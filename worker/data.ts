import { z } from "zod";
import { body, HttpError, json } from "./http";
import { profile } from "./accounts/profile";
import type { Trip } from "./trips/access";
export async function tripData(env: Env, memberId: string, trip: Trip) {
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
      "SELECT u.id,u.name,u.english_name,u.default_avatar,(u.avatar_key IS NOT NULL) AS has_avatar,u.version FROM members u JOIN trip_members m ON m.member_id=u.id WHERE m.trip_id=? ORDER BY m.joined_at,u.id",
    )
      .bind(trip.id)
      .all(),
    env.DB.prepare("SELECT data,version FROM events WHERE trip_id=?")
      .bind(trip.id)
      .all<{ data: string; version: number }>(),
    env.DB.prepare(
      "SELECT id,trip_id,name,category,owner_id,mime,size FROM documents WHERE (trip_id=? AND (owner_id IS NULL OR owner_id=?)) OR (trip_id IS NULL AND owner_id=?)",
    )
      .bind(trip.id, memberId, memberId)
      .all(),
    env.DB.prepare(
      "SELECT e.* FROM expenses e WHERE e.trip_id=? ORDER BY e.date DESC,e.created_at DESC,e.id DESC",
    )
      .bind(trip.id)
      .all<{ participants: string }>(),
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
  return json({
    trip: { ...trip, destinations: JSON.parse(trip.destinations ?? "[]") },
    me,
    members: members.results,
    events: events.results
      .map((e) => {
        const event = JSON.parse(e.data);
        return {
          ...event,
          documents: event.documents.filter((id: string) =>
            visibleDocuments.has(id),
          ),
          version: e.version,
        };
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    documents: documents.results,
    expenses: expenses.results.map((e) => ({
      ...e,
      participants: JSON.parse(e.participants),
    })),
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
