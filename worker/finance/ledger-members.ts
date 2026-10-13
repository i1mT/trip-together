import { z } from "zod";
import { body, HttpError, json } from "../http";
import { sha } from "../accounts/password";
import { rateLimit } from "../security/rate-limit";
import { requireOwner, type Trip } from "../trips/access";

type LedgerRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  status: string;
};

export async function ensureLedgerMembers(env: Env, tripId: string) {
  const missing = await env.DB.prepare(
    `SELECT tm.member_id AS user_id, u.name AS name, tm.joined_at AS joined_at
     FROM trip_members tm
     JOIN members u ON u.id = tm.member_id
     WHERE tm.trip_id=? AND NOT EXISTS (
       SELECT 1 FROM ledger_members lm
       WHERE lm.trip_id=tm.trip_id AND lm.user_id=tm.member_id
     )`,
  )
    .bind(tripId)
    .all<{ user_id: string; name: string; joined_at: string }>();
  if (!missing.results.length) return;
  await env.DB.batch(
    missing.results.map((row) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO ledger_members (id,trip_id,user_id,display_name,status,claimed_at) VALUES (?,?,?,?,'claimed',?)",
      ).bind(crypto.randomUUID(), tripId, row.user_id, row.name, row.joined_at),
    ),
  );
}

export async function ledgerDirectory(env: Env, tripId: string) {
  await ensureLedgerMembers(env, tripId);
  const rows = await env.DB.prepare(
    "SELECT id, user_id, display_name, status FROM ledger_members WHERE trip_id=?",
  )
    .bind(tripId)
    .all<LedgerRow>();
  const byId = new Map(rows.results.map((row) => [row.id, row]));
  const byUser = new Map(
    rows.results.flatMap((row) =>
      row.user_id ? [[row.user_id, row] as const] : [],
    ),
  );
  return { rows: rows.results, byId, byUser };
}

export function resolveLedgerId(
  directory: Awaited<ReturnType<typeof ledgerDirectory>>,
  id: string,
) {
  return directory.byId.get(id) ?? directory.byUser.get(id);
}

const nameSchema = z.string().trim().min(1, "请填写同伴怎么称呼").max(40);

export async function addPlaceholder(
  request: Request,
  env: Env,
  tripId: string,
  actorId: string,
) {
  await rateLimit(request, env, "add-companion", 30, actorId);
  const { name } = await body(request, z.object({ name: nameSchema }));
  const directory = await ledgerDirectory(env, tripId);
  const duplicate = directory.rows.some((row) => row.display_name === name);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO ledger_members (id,trip_id,user_id,display_name,status) VALUES (?,?,NULL,?,'placeholder')",
  )
    .bind(id, tripId, name)
    .run();
  return json({
    duplicate,
    member: {
      id,
      user_id: null,
      name,
      english_name: "",
      status: "placeholder",
      has_avatar: 0,
      default_avatar: "",
      expense_count: 0,
    },
  });
}

async function placeholderOrThrow(env: Env, tripId: string, id: string) {
  const row = await env.DB.prepare(
    "SELECT id,user_id,display_name,status FROM ledger_members WHERE id=? AND trip_id=?",
  )
    .bind(id, tripId)
    .first<LedgerRow>();
  if (!row) throw new HttpError(404, "找不到这位同伴");
  return row;
}

export async function expenseTouches(
  env: Env,
  tripId: string,
  memberId: string,
) {
  const rows = await env.DB.prepare(
    "SELECT payer_member_id, participants FROM expenses WHERE trip_id=?",
  )
    .bind(tripId)
    .all<{ payer_member_id: string | null; participants: string }>();
  return rows.results.some((row) => {
    if (row.payer_member_id === memberId) return true;
    const participants = JSON.parse(row.participants) as string[];
    return participants.includes(memberId);
  });
}

export async function deletePlaceholder(
  env: Env,
  trip: Trip,
  actorId: string,
  id: string,
) {
  requireOwner(trip, actorId);
  const row = await placeholderOrThrow(env, trip.id, id);
  if (row.user_id || row.status !== "placeholder")
    throw new HttpError(409, "已认领的同伴不能删除");
  if (await expenseTouches(env, trip.id, id))
    throw new HttpError(409, "这位同伴已经有账，只能合并到其他同伴");
  const result = await env.DB.prepare(
    "DELETE FROM ledger_members WHERE id=? AND trip_id=? AND user_id IS NULL",
  )
    .bind(id, trip.id)
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "这位同伴已经变化，请刷新");
  return json({ ok: true });
}

export async function unclaimMember(
  request: Request,
  env: Env,
  trip: Trip,
  actorId: string,
  id: string,
) {
  requireOwner(trip, actorId);
  await body(request, z.object({}).passthrough());
  const row = await placeholderOrThrow(env, trip.id, id);
  if (!row.user_id || row.status !== "claimed")
    throw new HttpError(409, "这位同伴还没有认领");
  if (row.user_id === trip.owner_id)
    throw new HttpError(409, "不能解除创建者自己的认领");
  const updated = await env.DB.prepare(
    "UPDATE ledger_members SET user_id=NULL, status='placeholder', claimed_at=NULL WHERE id=? AND trip_id=? AND user_id=?",
  )
    .bind(id, trip.id, row.user_id)
    .run();
  if (!updated.meta.changes)
    throw new HttpError(409, "认领状态已经变化，请刷新");
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM trip_members WHERE trip_id=? AND member_id=?",
    ).bind(trip.id, row.user_id),
    env.DB.prepare("DELETE FROM packing WHERE trip_id=? AND member_id=?").bind(
      trip.id,
      row.user_id,
    ),
    env.DB.prepare(
      "INSERT INTO member_claims (id,trip_id,member_id,action,actor_id,from_user_id) VALUES (?,?,?,'unclaim',?,?)",
    ).bind(crypto.randomUUID(), trip.id, id, actorId, row.user_id),
  ]);
  return json({ ok: true });
}

export async function mergePlaceholder(
  request: Request,
  env: Env,
  trip: Trip,
  actorId: string,
  id: string,
) {
  requireOwner(trip, actorId);
  const { targetId } = await body(
    request,
    z.object({ targetId: z.string().min(1).max(80) }),
  );
  if (targetId === id) throw new HttpError(400, "不能合并到自己");
  const source = await placeholderOrThrow(env, trip.id, id);
  if (source.user_id || source.status !== "placeholder")
    throw new HttpError(409, "只能合并尚未认领的同伴");
  const directory = await ledgerDirectory(env, trip.id);
  const target = directory.byId.get(targetId);
  if (!target) throw new HttpError(400, "要合并到的同伴不在这个行程里");
  const expenses = await env.DB.prepare(
    "SELECT id, payer_member_id, participants, version FROM expenses WHERE trip_id=?",
  )
    .bind(trip.id)
    .all<{
      id: string;
      payer_member_id: string | null;
      participants: string;
      version: number;
    }>();
  const statements: D1PreparedStatement[] = [];
  for (const expense of expenses.results) {
    const participants = JSON.parse(expense.participants) as string[];
    const involved =
      expense.payer_member_id === id || participants.includes(id);
    if (!involved) continue;
    const next = [
      ...new Set(
        participants.map((memberId) =>
          memberId === id ? target.id : memberId,
        ),
      ),
    ];
    statements.push(
      env.DB.prepare(
        "UPDATE expenses SET payer_member_id=?, participants=?, version=version+1 WHERE id=? AND trip_id=? AND version=?",
      ).bind(
        expense.payer_member_id === id ? target.id : expense.payer_member_id,
        JSON.stringify(next),
        expense.id,
        trip.id,
        expense.version,
      ),
    );
  }
  if (statements.length) {
    const updated = await env.DB.batch(statements);
    if (updated.some((result) => !result.meta.changes))
      throw new HttpError(409, "账目已经变化，请刷新后重试");
  }
  const removed = await env.DB.prepare(
    "DELETE FROM ledger_members WHERE id=? AND trip_id=? AND user_id IS NULL",
  )
    .bind(id, trip.id)
    .run();
  if (!removed.meta.changes)
    throw new HttpError(409, "这位同伴已经变化，请刷新");
  await env.DB.prepare(
    "INSERT INTO member_claims (id,trip_id,member_id,action,actor_id,target_member_id) VALUES (?,?,?,'merge',?,?)",
  )
    .bind(crypto.randomUUID(), trip.id, id, actorId, target.id)
    .run();
  return json({ ok: true });
}

const tokenField = z
  .string()
  .trim()
  .transform((value) =>
    value.length === 6 ? value.toUpperCase() : value.toLowerCase(),
  )
  .refine(
    (value) => /^[A-HJ-NP-Z]{6}$/.test(value) || /^[a-f0-9]{64}$/.test(value),
    "请输入完整的 6 位字母邀请口令",
  );

async function inviteFor(env: Env, token: string) {
  const hash = await sha(token);
  return env.DB.prepare(
    "SELECT i.trip_id, t.title FROM trip_invites i JOIN trips t ON t.id=i.trip_id WHERE i.token_hash=? AND i.expires_at>?",
  )
    .bind(hash, Date.now())
    .first<{ trip_id: string; title: string }>();
}

function splitCents(amount: number, participants: string[]) {
  const ids = [...new Set(participants)].sort();
  if (!ids.length) return {};
  const base = Math.floor(amount / ids.length);
  const remainder = amount % ids.length;
  return Object.fromEntries(
    ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]),
  );
}

export async function previewClaim(
  request: Request,
  env: Env,
  actorId: string,
) {
  await rateLimit(request, env, "join-preview", 30, actorId);
  const { token } = await body(request, z.object({ token: tokenField }));
  const invite = await inviteFor(env, token);
  if (!invite) throw new HttpError(404, "邀请已失效或不存在");
  const people = await env.DB.prepare(
    "SELECT id, display_name FROM ledger_members WHERE trip_id=? AND status='placeholder' AND user_id IS NULL ORDER BY created_at, id",
  )
    .bind(invite.trip_id)
    .all<{ id: string; display_name: string }>();
  const expenses = await env.DB.prepare(
    "SELECT payer_member_id, participants, amount_cny_estimated, amount_cny_settled, settle_status, entry_type FROM expenses WHERE trip_id=?",
  )
    .bind(invite.trip_id)
    .all<{
      payer_member_id: string | null;
      participants: string;
      amount_cny_estimated: number | null;
      amount_cny_settled: number | null;
      settle_status: string;
      entry_type: string;
    }>();
  const placeholders = people.results.map((person) => {
    let expenseCount = 0;
    let shareCny = 0;
    let approximate = false;
    for (const expense of expenses.results) {
      const participants = JSON.parse(expense.participants) as string[];
      const involved =
        expense.payer_member_id === person.id ||
        participants.includes(person.id);
      if (!involved) continue;
      expenseCount += 1;
      const settled =
        expense.settle_status === "settled" &&
        expense.amount_cny_settled != null;
      if (!settled) approximate = true;
      const cents = settled
        ? expense.amount_cny_settled!
        : (expense.amount_cny_estimated ?? 0);
      const sign = expense.entry_type === "reversal" ? -1 : 1;
      shareCny += (splitCents(cents, participants)[person.id] ?? 0) * sign;
    }
    return {
      id: person.id,
      name: person.display_name,
      expenseCount,
      shareCny,
      approximate,
    };
  });
  return json({ tripId: invite.trip_id, title: invite.title, placeholders });
}

export async function claimMember(request: Request, env: Env, actorId: string) {
  await rateLimit(request, env, "claim-member", 20, actorId);
  const { token, memberId } = await body(
    request,
    z.object({ token: tokenField, memberId: z.string().min(1).max(80) }),
  );
  const invite = await inviteFor(env, token);
  if (!invite) throw new HttpError(404, "邀请已失效或不存在");
  const person = await env.DB.prepare(
    "SELECT id,user_id,status FROM ledger_members WHERE id=? AND trip_id=?",
  )
    .bind(memberId, invite.trip_id)
    .first<{ id: string; user_id: string | null; status: string }>();
  if (!person || person.user_id || person.status !== "placeholder")
    throw new HttpError(404, "这个同伴不存在或已经被认领");
  const joined = await env.DB.prepare(
    "SELECT 1 AS ok FROM trip_members WHERE trip_id=? AND member_id=?",
  )
    .bind(invite.trip_id, actorId)
    .first();
  if (joined)
    throw new HttpError(
      409,
      "你已经在这个行程里。请让创建者把这位同伴合并到你名下",
    );
  const claimed = await env.DB.prepare(
    "UPDATE ledger_members SET user_id=?, status='claimed', claimed_at=CURRENT_TIMESTAMP WHERE id=? AND trip_id=? AND user_id IS NULL",
  )
    .bind(actorId, person.id, invite.trip_id)
    .run();
  if (!claimed.meta.changes)
    throw new HttpError(409, "这个同伴刚刚被认领，请刷新");
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO trip_members (trip_id, member_id) VALUES (?,?)",
      ).bind(invite.trip_id, actorId),
      env.DB.prepare(
        "INSERT INTO member_claims (id,trip_id,member_id,action,actor_id,to_user_id) VALUES (?,?,?,'claim',?,?)",
      ).bind(crypto.randomUUID(), invite.trip_id, person.id, actorId, actorId),
    ]);
  } catch (error) {
    await env.DB.prepare(
      "UPDATE ledger_members SET user_id=NULL, status='placeholder', claimed_at=NULL WHERE id=? AND trip_id=? AND user_id=?",
    )
      .bind(person.id, invite.trip_id, actorId)
      .run();
    if (error instanceof Error && /UNIQUE/i.test(error.message))
      throw new HttpError(409, "你已经在这个行程里，或这位同伴刚刚被认领");
    throw error;
  }
  return json({ id: invite.trip_id, memberId: person.id });
}
