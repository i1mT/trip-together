import { z } from "zod";
import { body, HttpError, json } from "../http";
import { sha } from "../accounts/password";
import { rateLimit } from "../security/rate-limit";
import { requireOwner, type Trip } from "./access";
import { ensureLedgerMembers } from "../finance/ledger-members";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function invitationCode() {
  let code = "";
  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    for (const byte of bytes) {
      if (byte < 240) code += alphabet[byte % 24];
      if (code.length === 6) break;
    }
  }
  return code;
}
export async function invite(
  request: Request,
  env: Env,
  trip: Trip,
  memberId: string,
) {
  requireOwner(trip, memberId);
  if (request.method === "GET") {
    const existing = await env.DB.prepare(
      "SELECT code AS token,expires_at AS expiresAt FROM trip_invites WHERE trip_id=? AND expires_at>? AND code IS NOT NULL",
    )
      .bind(trip.id, Date.now())
      .first();
    return json(existing ?? { token: null });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM trip_invites WHERE trip_id=?")
      .bind(trip.id)
      .run();
    return json({ ok: true });
  }
  await rateLimit(request, env, "invite-create", 20, memberId);
  const expiresAt = Date.now() + 7 * 86400000;
  for (let attempt = 0; attempt < 10; attempt++) {
    const token = invitationCode();
    // An atomic upsert preserves the previous invite if a code collides.
    try {
      const result = await env.DB.prepare(
        "INSERT INTO trip_invites (token_hash,trip_id,expires_at,code) VALUES (?,?,?,?) ON CONFLICT(trip_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,code=excluded.code,created_at=CURRENT_TIMESTAMP WHERE trip_invites.code IS NULL OR trip_invites.code<>excluded.code",
      )
        .bind(await sha(token), trip.id, expiresAt, token)
        .run();
      if (result.meta.changes) return json({ token, expiresAt });
    } catch (e) {
      if (
        !(e instanceof Error) ||
        !/UNIQUE constraint failed: trip_invites\.(code|token_hash)/.test(
          e.message,
        )
      )
        throw e;
    }
  }
  throw new HttpError(503, "暂时无法生成邀请口令，请重试");
}
export async function join(request: Request, env: Env, memberId: string) {
  await rateLimit(request, env, "join", 20);
  await rateLimit(request, env, "join-member", 20, memberId);
  const { token } = await body(
    request,
    z.object({
      token: z
        .string()
        .trim()
        .transform((v) => (v.length === 6 ? v.toUpperCase() : v.toLowerCase()))
        .refine(
          (v) => /^[A-HJ-NP-Z]{6}$/.test(v) || /^[a-f0-9]{64}$/.test(v),
          "请输入完整的 6 位字母邀请口令",
        ),
    }),
  );
  const hash = await sha(token),
    now = Date.now();
  const invitation = await env.DB.prepare(
    "SELECT trip_id FROM trip_invites WHERE token_hash=? AND expires_at>?",
  )
    .bind(hash, now)
    .first<{ trip_id: string }>();
  if (!invitation) throw new HttpError(404, "邀请已失效或不存在");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO trip_members (trip_id,member_id) SELECT trip_id,? FROM trip_invites WHERE token_hash=? AND expires_at>?",
  )
    .bind(memberId, hash, now)
    .run();
  const joined = await env.DB.prepare(
    "SELECT 1 FROM trip_members WHERE trip_id=? AND member_id=?",
  )
    .bind(invitation.trip_id, memberId)
    .first();
  if (!joined) throw new HttpError(409, "邀请已经撤销");
  await ensureLedgerMembers(env, invitation.trip_id);
  return json({ id: invitation.trip_id });
}
