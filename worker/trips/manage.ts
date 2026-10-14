import { z } from "zod";
import { body, HttpError, json } from "../http";
import { tripSchema } from "../../shared/validation";
import { profile } from "../accounts/profile";
import { rateLimit } from "../auth";
import { requireOwner, type Trip } from "./access";
import { ensureLedgerMembers } from "../finance/ledger-members";
export async function bootstrap(env: Env, id: string) {
  const [me, trips, documents] = await Promise.all([
    profile(env, id),
    env.DB.prepare(
      "SELECT t.* FROM trips t JOIN trip_members m ON m.trip_id=t.id WHERE m.member_id=? ORDER BY t.created_at DESC,t.id",
    )
      .bind(id)
      .all(),
    env.DB.prepare(
      "SELECT id,trip_id,name,category,owner_id,mime,size FROM documents WHERE owner_id=? AND trip_id IS NULL",
    )
      .bind(id)
      .all(),
  ]);
  return json({
    me,
    trips: trips.results.map((t) => ({
      ...t,
      destinations: JSON.parse(String(t.destinations ?? "[]")),
    })),
    documents: documents.results,
  });
}
export async function createTrip(request: Request, env: Env, memberId: string) {
  await rateLimit(request, env, "create-trip", 30);
  const v = await body(request, tripSchema),
    id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO trips (id,title,owner_id,start_date,end_date,timezone,home_timezone,currency,home_currency,destinations) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      v.title,
      memberId,
      v.start_date,
      v.end_date,
      v.timezone,
      v.home_timezone,
      v.currency,
      v.home_currency,
      JSON.stringify(v.destinations),
    ),
    env.DB.prepare(
      "INSERT INTO trip_members (trip_id,member_id) VALUES (?,?)",
    ).bind(id, memberId),
  ]);
  await ensureLedgerMembers(env, id);
  return json({ id }, 201);
}
export async function updateTrip(
  request: Request,
  env: Env,
  trip: Trip,
  memberId: string,
) {
  requireOwner(trip, memberId);
  const v = await body(request, tripSchema);
  const r = await env.DB.prepare(
    "UPDATE trips SET title=?,start_date=?,end_date=?,timezone=?,home_timezone=?,currency=?,home_currency=?,destinations=?,version=version+1 WHERE id=? AND version=?",
  )
    .bind(
      v.title,
      v.start_date,
      v.end_date,
      v.timezone,
      v.home_timezone,
      v.currency,
      v.home_currency,
      JSON.stringify(v.destinations),
      trip.id,
      v.version ?? 0,
    )
    .run();
  if (!r.meta.changes)
    throw new HttpError(409, "行程设置已经更新，请刷新后重试");
  return json({ ok: true });
}
export async function deleteTrip(
  request: Request,
  env: Env,
  trip: Trip,
  memberId: string,
) {
  requireOwner(trip, memberId);
  const { title } = await body(request, z.object({ title: z.string() }));
  if (title !== trip.title)
    throw new HttpError(400, "请输入完整行程名称确认删除");
  // Delete objects before metadata: a retry can finish interrupted cleanup.
  const objects = await env.DB.prepare(
    "SELECT r2_key FROM documents WHERE trip_id=? UNION ALL SELECT r2_key FROM receipts WHERE trip_id=?",
  )
    .bind(trip.id, trip.id)
    .all<{ r2_key: string }>();
  for (let i = 0; i < objects.results.length; i += 100)
    await env.FILES.delete(
      objects.results.slice(i, i + 100).map((o) => o.r2_key),
    );
  await env.DB.prepare("DELETE FROM trips WHERE id=?").bind(trip.id).run();
  return json({ ok: true });
}
export { invite, join } from "./invitations";
