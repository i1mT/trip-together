import { currencyNames } from "../../../shared/travel-options";
import {
  estimateCny,
  referencePpm,
  referenceRateDate,
} from "../../../shared/fx";
import type { Currency, Expense, Member } from "./models";

export { estimateCny, referencePpm, referenceRateDate };

export function isMe(member: Member, userId: string) {
  return (
    member.user_id === userId ||
    (member.user_id == null && member.id === userId)
  );
}

export function selfMemberId(members: Member[], userId: string) {
  return members.find((member) => member.user_id === userId)?.id ?? userId;
}
export function money(cents: number, currency: Currency) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    ...(cents % 100
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : {}),
  }).format(cents / 100);
}
export function splitAmount(amount: number, participants: string[]) {
  const ids = [...new Set(participants)].sort();
  if (!ids.length) throw new Error("至少选择一位分摊成员");
  const base = Math.floor(amount / ids.length),
    remainder = amount % ids.length;
  return Object.fromEntries(
    ids.map((id, i) => [id, base + (i < remainder ? 1 : 0)]),
  );
}
export function summarize(
  expenses: Expense[],
  members: Member[],
  currency: Currency,
) {
  const rows = members.map((m) => ({ ...m, paid: 0, share: 0, balance: 0 }));
  let total = 0;
  for (const expense of expenses.filter((e) => e.currency === currency)) {
    const sign = expense.entry_type === "reversal" ? -1 : 1;
    const amount = expense.amount * sign;
    total += amount;
    const splits = splitAmount(expense.amount, expense.participants);
    for (const row of rows) {
      if (row.id === expense.payer_id) row.paid += amount;
      row.share += (splits[row.id] ?? 0) * sign;
      row.balance = row.paid - row.share;
    }
  }
  return { total, rows };
}

export function currencyLabel(currency: Currency) {
  return currencyNames[currency];
}

export function formatRate(ppm: number) {
  return (ppm / 1_000_000).toLocaleString("zh-CN", {
    maximumFractionDigits: 4,
  });
}

export function settlementOf(expense: Expense) {
  const sign = expense.entry_type === "reversal" ? -1 : 1;
  const locked = Boolean(expense.settlement_locked);
  if (expense.settle_status === "settled" && expense.amount_cny_settled != null)
    return {
      cents: expense.amount_cny_settled * sign,
      approximate: false,
      locked,
      status: "settled" as const,
    };
  return {
    cents: (expense.amount_cny_estimated ?? 0) * sign,
    approximate: true,
    locked: false,
    status: "estimated" as const,
  };
}

export function settlementSummary(expenses: Expense[]) {
  let settled = 0;
  let estimated = 0;
  let settledCount = 0;
  let estimatedCount = 0;
  for (const expense of expenses) {
    const sign = expense.entry_type === "reversal" ? -1 : 1;
    if (
      expense.settle_status === "settled" &&
      expense.amount_cny_settled != null
    ) {
      settled += expense.amount_cny_settled * sign;
      settledCount += 1;
    } else {
      estimated += (expense.amount_cny_estimated ?? 0) * sign;
      estimatedCount += 1;
    }
  }
  return {
    settled,
    estimated,
    settledCount,
    estimatedCount,
    total: settled + estimated,
    approximate: estimatedCount > 0,
  };
}
