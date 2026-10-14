import { z } from "zod";
import { body, HttpError, json } from "./http";
import { profile } from "./accounts/profile";
import type { Trip } from "./trips/access";
import { ensureLedgerMembers } from "./finance/ledger-members";
export async function tripData(env: Env, memberId: string, trip: Trip) {
  await ensureLedgerMembers(env, trip.id);
  const [
    me,
    members,
    events,
    documents,
    expenses,
    packing,
    receipts,
    preparation,
  ] = await Promise.all([
    profile(env, memberId),
    env.DB.prepare(
      `SELECT lm.id, lm.user_id, lm.status,
        CASE WHEN lm.user_id IS NULL THEN lm.display_name ELSE COALESCE(u.name, lm.display_name) END AS name,
        COALESCE(u.english_name, '') AS english_name,
        COALESCE(u.default_avatar, '') AS default_avatar,
        (u.avatar_key IS NOT NULL) AS has_avatar,
        COALESCE(u.version, 1) AS version
       FROM ledger_members lm
       LEFT JOIN members u ON u.id = lm.user_id
       WHERE lm.trip_id=?`,
    )
      .bind(trip.id)
      .all<{
        id: string;
        user_id: string | null;
        status: string;
        name: string;
      }>(),
    env.DB.prepare("SELECT data,version,sort_order FROM events WHERE trip_id=?")
      .bind(trip.id)
      .all<{ data: string; version: number; sort_order: number | null }>(),
    env.DB.prepare(
      "SELECT id,trip_id,name,category,owner_id,mime,size FROM documents WHERE (trip_id=? AND (owner_id IS NULL OR owner_id=?)) OR (trip_id IS NULL AND owner_id=?)",
    )
      .bind(trip.id, memberId, memberId)
      .all(),
    env.DB.prepare(
      "SELECT e.* FROM expenses e WHERE e.trip_id=? ORDER BY e.date DESC,e.created_at DESC,e.id DESC",
    )
      .bind(trip.id)
      .all<{
        participants: string;
        payer_id: string;
        payer_member_id: string | null;
      }>(),
    env.DB.prepare(
      "SELECT item_id FROM packing WHERE trip_id=? AND member_id=? AND checked=1",
    )
      .bind(trip.id, memberId)
      .all<{ item_id: string }>(),
    env.DB.prepare(
      "SELECT id,name,mime,size,expense_id,uploaded_by,'支出资料' AS category,NULL AS owner_id FROM receipts WHERE trip_id=? AND expense_id IS NOT NULL",
    )
      .bind(trip.id)
      .all(),
    env.DB.prepare(
      "SELECT id,group_name,title,note FROM preparation_items WHERE trip_id=? ORDER BY created_at,rowid",
    )
      .bind(trip.id)
      .all(),
  ]);
  const visibleDocuments = new Set(documents.results.map((d) => d.id));
  const memberRows = members.results;
  const expenseRows = expenses.results.map((expense) => ({
    payer: expense.payer_member_id as string | null,
    participants: JSON.parse(expense.participants) as string[],
  }));
  const listedMembers = memberRows
    .map((member) => ({
      ...member,
      expense_count: expenseRows.filter(
        (expense) =>
          expense.payer === member.id ||
          expense.participants.includes(member.id),
      ).length,
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "claimed" ? -1 : 1;
      return (
        b.expense_count - a.expense_count || a.name.localeCompare(b.name, "zh")
      );
    });
  return json({
    trip: { ...trip, destinations: JSON.parse(trip.destinations ?? "[]") },
    me,
    members: listedMembers,
    events: events.results
      .map((e) => {
        const event = JSON.parse(e.data);
        return {
          ...event,
          documents: event.documents.filter((id: string) =>
            visibleDocuments.has(id),
          ),
          version: e.version,
          sortOrder: e.sort_order,
        };
      })
      .sort((a, b) => {
        if (a.sortOrder !== null && b.sortOrder !== null)
          return a.sortOrder - b.sortOrder;
        if (a.sortOrder !== null) return -1;
        if (b.sortOrder !== null) return 1;
        return Date.parse(a.start) - Date.parse(b.start);
      }),
    documents: documents.results,
    expenses: expenses.results.map((e) => {
      const participants = JSON.parse(e.participants) as string[];
      const payer =
        memberRows.find((member) => member.id === e.payer_member_id) ??
        memberRows.find((member) => member.user_id === e.payer_id);
      return {
        ...e,
        payer_id: payer?.id ?? e.payer_member_id ?? e.payer_id,
        participants: participants.map(
          (id) =>
            memberRows.find((member) => member.id === id)?.id ??
            memberRows.find((member) => member.user_id === id)?.id ??
            id,
        ),
      };
    }),
    packing: packing.results.map((p) => p.item_id),
    receipts: receipts.results,
    preparation: preparation.results,
  });
}
export async function packing(
  request: Request,
  env: Env,
  memberId: string,
  tripId: string,
) {
  const v = await body(
    request,
    z.object({ itemId: z.string().uuid(), checked: z.boolean() }),
  );
  const item = await env.DB.prepare(
    "SELECT id FROM preparation_items WHERE id=? AND trip_id=?",
  )
    .bind(v.itemId, tripId)
    .first();
  if (!item) throw new HttpError(400, "无效的清单项目");
  await env.DB.prepare(
    "INSERT INTO packing (trip_id,member_id,item_id,checked) VALUES (?,?,?,?) ON CONFLICT(trip_id,member_id,item_id) DO UPDATE SET checked=excluded.checked",
  )
    .bind(tripId, memberId, v.itemId, Number(v.checked))
    .run();
  return json({ ok: true });
}
