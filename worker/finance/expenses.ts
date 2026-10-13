import { z } from "zod";
import { body, HttpError, json } from "../http";
import { currencySchema } from "../../shared/validation";
import type { Currency } from "../../shared/travel-options";
import { estimateCny, ppmFromEstimate, referencePpm } from "../../shared/fx";
import { ledgerDirectory, resolveLedgerId } from "./ledger-members";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "请填写支出名称").max(100),
  amount: z.number().int().positive().max(100000000, "金额过大"),
  currency: currencySchema,
  payerId: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (s) =>
        !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
      "日期无效",
    ),
  participants: z.array(z.string()).min(1, "至少选择一位分摊成员").max(100),
  note: z.string().trim().max(1000).default(""),
  version: z.number().int().positive().optional(),
  receiptIds: z.array(z.string().uuid()).max(5).optional(),
  amountCnyEstimated: z.number().int().nonnegative().max(100000000).optional(),
});

type Existing = {
  payer_id: string;
  payer_member_id: string | null;
  created_by: string;
  version: number;
  amount: number;
  currency: Currency;
  participants: string;
  settle_status: string;
  settlement_locked: number;
  entry_type: string;
  fx_rate_ppm: number | null;
  amount_cny_estimated: number | null;
  amount_cny_settled: number | null;
  title: string;
  date: string;
};

function sameMembers(left: string[], right: string[]) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function settlementOf(input: z.infer<typeof schema>, existing?: Existing) {
  if (existing?.settlement_locked)
    return {
      ppm: existing.fx_rate_ppm,
      estimated: existing.amount_cny_estimated,
      settled: existing.amount_cny_settled,
      status: existing.settle_status,
      locked: 1,
    };
  if (input.currency === "CNY")
    return {
      ppm: referencePpm("CNY"),
      estimated: input.amount,
      settled: input.amount,
      status: "settled",
      locked: 0,
    };
  const keepRate =
    input.amountCnyEstimated == null &&
    existing?.currency === input.currency &&
    existing.fx_rate_ppm;
  const ppm =
    input.amountCnyEstimated != null
      ? ppmFromEstimate(input.amount, input.amountCnyEstimated)
      : keepRate
        ? existing!.fx_rate_ppm!
        : referencePpm(input.currency);
  return {
    ppm,
    estimated: input.amountCnyEstimated ?? estimateCny(input.amount, ppm),
    settled: null,
    status: "estimated",
    locked: 0,
  };
}

export async function saveExpense(
  request: Request,
  env: Env,
  memberId: string,
  tripId: string,
  expenseId?: string,
) {
  const input = await body(request, schema);
  const directory = await ledgerDirectory(env, tripId);
  const participants = input.participants.map((id) => {
    const member = resolveLedgerId(directory, id);
    if (!member) throw new HttpError(400, "分摊成员无效");
    return member;
  });
  if (
    new Set(participants.map((member) => member.id)).size !==
    participants.length
  )
    throw new HttpError(400, "分摊成员无效");
  const id = expenseId ?? input.id ?? crypto.randomUUID();
  const existing = await env.DB.prepare(
    "SELECT payer_id,payer_member_id,created_by,version,amount,currency,participants,settle_status,settlement_locked,entry_type,fx_rate_ppm,amount_cny_estimated,amount_cny_settled,title,date FROM expenses WHERE id=? AND trip_id=?",
  )
    .bind(id, tripId)
    .first<Existing>();
  const payerKey = input.payerId ?? existing?.payer_member_id ?? memberId;
  const payer = resolveLedgerId(directory, payerKey);
  if (!payer) throw new HttpError(400, "请选择有效付款人");
  if (expenseId) {
    if (!existing) throw new HttpError(404, "这笔支出不存在");
    if (existing.version !== input.version)
      throw new HttpError(409, "这笔支出已经更新，请刷新后重试");
    if (existing.settlement_locked) {
      const stored = JSON.parse(existing.participants) as string[];
      const unchanged =
        input.amount === existing.amount &&
        input.currency === existing.currency &&
        payer.id === existing.payer_member_id &&
        sameMembers(
          participants.map((member) => member.id),
          stored,
        );
      if (!unchanged)
        throw new HttpError(
          409,
          "已结算金额已锁定，不能修改。如需更正，请冲销后重记",
        );
    }
  } else if (existing) {
    if (existing.created_by !== memberId)
      throw new HttpError(409, "支出编号冲突");
    return json({ ok: true, id });
  }
  if (
    input.receiptIds &&
    new Set(input.receiptIds).size !== input.receiptIds.length
  )
    throw new HttpError(400, "资料重复");
  for (const receiptId of input.receiptIds ?? []) {
    const receipt = await env.DB.prepare(
      "SELECT uploaded_by,expense_id FROM receipts WHERE id=? AND trip_id=?",
    )
      .bind(receiptId, tripId)
      .first<{ uploaded_by: string; expense_id: string | null }>();
    if (
      !receipt ||
      !(
        receipt.expense_id === id ||
        (receipt.expense_id === null && receipt.uploaded_by === memberId)
      )
    )
      throw new HttpError(403, "无法关联这份资料");
  }
  const token = crypto.randomUUID();
  const settlement = settlementOf(input, existing ?? undefined);
  const participantIds = participants.map((member) => member.id);
  // payer_id stays a real account so the existing foreign key holds.
  // Placeholder payers keep the recorder here; balances use payer_member_id.
  const payerAccountId = payer.user_id ?? existing?.payer_id ?? memberId;
  const statements: D1PreparedStatement[] = [];
  if (expenseId)
    statements.push(
      env.DB.prepare(
        "UPDATE expenses SET title=?,amount=?,currency=?,payer_id=?,payer_member_id=?,date=?,participants=?,note=?,fx_rate_ppm=?,amount_cny_estimated=?,amount_cny_settled=?,settle_status=?,settlement_locked=?,version=version+1,write_token=? WHERE id=? AND trip_id=? AND version=?",
      ).bind(
        input.title,
        input.amount,
        input.currency,
        payerAccountId,
        payer.id,
        input.date,
        JSON.stringify(participantIds),
        input.note,
        settlement.ppm,
        settlement.estimated,
        settlement.settled,
        settlement.status,
        settlement.locked,
        token,
        id,
        tripId,
        input.version,
      ),
    );
  else
    statements.push(
      env.DB.prepare(
        "INSERT INTO expenses (id,trip_id,payer_id,payer_member_id,created_by,title,amount,currency,category,date,participants,note,write_token,fx_rate_ppm,amount_cny_estimated,amount_cny_settled,settle_status,settlement_locked,entry_type) VALUES (?,?,?,?,?,?,?,?,'其他',?,?,?,?,?,?,?,?,?,'normal')",
      ).bind(
        id,
        tripId,
        payerAccountId,
        payer.id,
        memberId,
        input.title,
        input.amount,
        input.currency,
        input.date,
        JSON.stringify(participantIds),
        input.note,
        token,
        settlement.ppm,
        settlement.estimated,
        settlement.settled,
        settlement.status,
        settlement.locked,
      ),
    );
  if (input.receiptIds) {
    statements.push(
      env.DB.prepare(
        "UPDATE receipts SET expense_id=NULL WHERE expense_id=? AND id NOT IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM expenses WHERE id=? AND write_token=?)",
      ).bind(id, JSON.stringify(input.receiptIds), id, token),
    );
    for (const receiptId of input.receiptIds)
      statements.push(
        env.DB.prepare(
          "UPDATE receipts SET uploaded_by=CASE WHEN expense_id=? OR (expense_id IS NULL AND uploaded_by=?) THEN uploaded_by ELSE NULL END,expense_id=? WHERE id=? AND EXISTS(SELECT 1 FROM expenses WHERE id=? AND write_token=?)",
        ).bind(id, memberId, id, receiptId, id, token),
      );
  }
  try {
    const results = await env.DB.batch(statements);
    if (!results[0].meta.changes)
      throw new HttpError(409, "这笔支出已经更新，请刷新后重试");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /constraint|UNIQUE/i.test(error.message))
      throw new HttpError(409, "记录或资料已经变更，请刷新后重试");
    throw error;
  }
  return json({ ok: true, id });
}

export async function deleteExpense(
  request: Request,
  env: Env,
  _memberId: string,
  tripId: string,
  id: string,
) {
  const { version } = await body(
    request,
    z.object({ version: z.number().int().positive() }),
  );
  const existing = await env.DB.prepare(
    "SELECT version, settlement_locked, entry_type FROM expenses WHERE id=? AND trip_id=?",
  )
    .bind(id, tripId)
    .first<{
      version: number;
      settlement_locked: number;
      entry_type: string;
    }>();
  if (!existing) throw new HttpError(404, "这笔支出不存在");
  if (existing.version !== version)
    throw new HttpError(409, "无法删除：这笔支出已变更，请刷新后重试");
  if (existing.settlement_locked || existing.entry_type === "reversal")
    throw new HttpError(
      409,
      "已结算金额已锁定，不能删除。如需更正，请冲销后重记",
    );
  const result = await env.DB.prepare(
    "DELETE FROM expenses WHERE id=? AND trip_id=? AND version=? AND settlement_locked=0",
  )
    .bind(id, tripId, version)
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "无法删除：这笔支出已变更，请刷新后重试");
  return json({ ok: true });
}

export async function settleExpense(
  request: Request,
  env: Env,
  _memberId: string,
  tripId: string,
  id: string,
) {
  const { amountCny, version } = await body(
    request,
    z.object({
      amountCny: z.number().int().positive().max(100000000, "金额过大"),
      version: z.number().int().positive(),
    }),
  );
  const existing = await env.DB.prepare(
    "SELECT version, settlement_locked, entry_type, settle_status FROM expenses WHERE id=? AND trip_id=?",
  )
    .bind(id, tripId)
    .first<{
      version: number;
      settlement_locked: number;
      entry_type: string;
      settle_status: string;
    }>();
  if (!existing) throw new HttpError(404, "这笔支出不存在");
  if (existing.version !== version)
    throw new HttpError(409, "这笔支出已经更新，请刷新后重试");
  if (existing.entry_type === "reversal")
    throw new HttpError(409, "冲销记录不能再次结算");
  if (existing.settlement_locked)
    throw new HttpError(409, "已结算金额已锁定，不能再改");
  const result = await env.DB.prepare(
    "UPDATE expenses SET amount_cny_settled=?, settle_status='settled', settlement_locked=1, version=version+1 WHERE id=? AND trip_id=? AND version=? AND settlement_locked=0",
  )
    .bind(amountCny, id, tripId, version)
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "这笔支出已经更新，请刷新后重试");
  return json({ ok: true, id });
}

export async function reverseExpense(
  request: Request,
  env: Env,
  memberId: string,
  tripId: string,
  id: string,
) {
  const { version, title } = await body(
    request,
    z.object({
      version: z.number().int().positive(),
      title: z.string().trim().min(1).max(100).optional(),
    }),
  );
  const existing = await env.DB.prepare(
    "SELECT * FROM expenses WHERE id=? AND trip_id=?",
  )
    .bind(id, tripId)
    .first<Existing & { note: string; category: string }>();
  if (!existing) throw new HttpError(404, "这笔支出不存在");
  if (existing.version !== version)
    throw new HttpError(409, "这笔支出已经更新，请刷新后重试");
  if (existing.entry_type === "reversal")
    throw new HttpError(409, "冲销记录不能再冲销");
  if (!existing.settlement_locked)
    throw new HttpError(409, "这笔账还没锁定，可以直接修改或删除");
  const prior = await env.DB.prepare(
    "SELECT id FROM expenses WHERE trip_id=? AND reversal_of=?",
  )
    .bind(tripId, id)
    .first();
  if (prior) throw new HttpError(409, "这笔账已经冲销过");
  const reversalId = crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT INTO expenses (
      id,trip_id,payer_id,payer_member_id,created_by,title,amount,currency,category,date,participants,note,write_token,
      fx_rate_ppm,amount_cny_estimated,amount_cny_settled,settle_status,settlement_locked,entry_type,reversal_of
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'settled',1,'reversal',?)`,
  )
    .bind(
      reversalId,
      tripId,
      existing.payer_id,
      existing.payer_member_id,
      memberId,
      title ?? `冲销：${existing.title}`.slice(0, 100),
      existing.amount,
      existing.currency,
      existing.category,
      existing.date,
      existing.participants,
      "",
      crypto.randomUUID(),
      existing.fx_rate_ppm,
      existing.amount_cny_estimated,
      existing.amount_cny_settled,
      id,
    )
    .run();
  if (!result.meta.changes) throw new HttpError(409, "冲销没有写入，请重试");
  return json({ ok: true, id: reversalId });
}
