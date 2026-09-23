import { eventStatuses } from "../../shared/event-status";
import { z } from "zod";
import { body, HttpError, json } from "../http";
import { eventSchema } from "../../shared/validation";
import { requireDocument } from "./access";
const versionSchema = z.object({ version: z.number().int().positive() });
export async function saveEvent(
  request: Request,
  env: Env,
  tripId: string,
  memberId: string,
  id?: string,
) {
  const v = await body(request, eventSchema);
  const eventId = id ?? crypto.randomUUID();
  for (const doc of v.documents)
    await requireDocument(env, doc, tripId, memberId);
  const { version, ...data } = v;
  let status = "planned";
  // Preserve attachments owned by other members when editing a shared event.
  if (id) {
    const previous = await env.DB.prepare(
      "SELECT data FROM events WHERE id=? AND trip_id=?",
    )
      .bind(id, tripId)
      .first<{ data: string }>();
    if (previous) {
      status = JSON.parse(previous.data).status ?? "planned";
      const hidden = await env.DB.prepare(
        "SELECT id FROM documents WHERE trip_id=? AND owner_id IS NOT NULL AND owner_id<>? AND id IN (SELECT value FROM json_each(?, '$.documents'))",
      )
        .bind(tripId, memberId, previous.data)
        .all<{ id: string }>();
      data.documents = [
        ...new Set([...data.documents, ...hidden.results.map((d) => d.id)]),
      ];
    }
  }
  const r = id
    ? await env.DB.prepare(
        "UPDATE events SET data=?,version=version+1 WHERE id=? AND trip_id=? AND version=?",
      )
        .bind(
          JSON.stringify({ ...data, status, id: eventId }),
          eventId,
          tripId,
          version ?? 0,
        )
        .run()
    : await insertEvent(
        env,
        tripId,
        memberId,
        eventId,
        JSON.stringify({ ...data, status, id: eventId }),
      );
  if (!r.meta.changes) throw new HttpError(409, "事项已经变更，请刷新后重试");
  return json({ id: eventId });
}

async function insertEvent(
  env: Env,
  tripId: string,
  memberId: string,
  eventId: string,
  data: string,
) {
  const hasManualOrder = await env.DB.prepare(
    "SELECT 1 FROM events WHERE trip_id=? AND sort_order IS NOT NULL LIMIT 1",
  )
    .bind(tripId)
    .first();
  const last = hasManualOrder
    ? await env.DB.prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS value FROM events WHERE trip_id=?",
      )
        .bind(tripId)
        .first<{ value: number }>()
    : null;
  return env.DB.prepare(
    "INSERT INTO events (id,trip_id,data,created_by,sort_order) VALUES (?,?,?,?,?)",
  )
    .bind(
      eventId,
      tripId,
      data,
      memberId,
      hasManualOrder ? (last?.value ?? -1) + 1 : null,
    )
    .run();
}

export async function reorderEvents(
  request: Request,
  env: Env,
  tripId: string,
) {
  const value = await body(
    request,
    z.object({ ids: z.array(z.string().uuid()).min(1) }),
  );
  const rows = await env.DB.prepare("SELECT id FROM events WHERE trip_id=?")
    .bind(tripId)
    .all<{ id: string }>();
  const existing = new Set(rows.results.map((row) => row.id));
  if (
    value.ids.length !== existing.size ||
    new Set(value.ids).size !== value.ids.length ||
    value.ids.some((id) => !existing.has(id))
  )
    throw new HttpError(400, "安排顺序已经变化，请刷新后重试");
  const statements = value.ids.map((id, index) =>
    env.DB.prepare(
      "UPDATE events SET sort_order=? WHERE id=? AND trip_id=?",
    ).bind(index, id, tripId),
  );
  await env.DB.batch(statements);
  return json({ ok: true });
}
export async function deleteEvent(
  request: Request,
  env: Env,
  tripId: string,
  id: string,
) {
  const { version } = await body(request, versionSchema);
  const r = await env.DB.prepare(
    "DELETE FROM events WHERE id=? AND trip_id=? AND version=?",
  )
    .bind(id, tripId, version)
    .run();
  if (!r.meta.changes) throw new HttpError(409, "事项已经变更，请刷新后重试");
  return json({ ok: true });
}
export async function preparation(
  request: Request,
  env: Env,
  tripId: string,
  id?: string,
) {
  if (request.method === "DELETE") {
    await env.DB.prepare(
      "DELETE FROM preparation_items WHERE trip_id=? AND id=?",
    )
      .bind(tripId, id)
      .run();
    return json({ ok: true });
  }
  const v = await body(
    request,
    z.object({
      group_name: z.string().trim().min(1).max(60),
      title: z.string().trim().min(1).max(200),
      note: z.string().max(1000).default(""),
    }),
  );
  if (request.method === "PUT" && id) {
    const result = await env.DB.prepare(
      "UPDATE preparation_items SET group_name=?,title=?,note=? WHERE trip_id=? AND id=?",
    )
      .bind(v.group_name, v.title, v.note, tripId, id)
      .run();
    if (!result.meta.changes) throw new HttpError(404, "准备事项不存在");
    return json({ ok: true });
  }
  const itemId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO preparation_items (id,trip_id,group_name,title,note) VALUES (?,?,?,?,?)",
  )
    .bind(itemId, tripId, v.group_name, v.title, v.note)
    .run();
  return json({ id: itemId });
}

export async function setEventStatus(
  request: Request,
  env: Env,
  tripId: string,
  id: string,
) {
  const value = await body(
    request,
    z.object({
      status: z.enum(eventStatuses),
      version: z.number().int().positive(),
    }),
  );
  const result = await env.DB.prepare(
    "UPDATE events SET data=json_set(data,'$.status',?),version=version+1 WHERE id=? AND trip_id=? AND version=?",
  )
    .bind(value.status, id, tripId, value.version)
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "事项已经变更，请刷新后重试");
  return json({ status: value.status, version: value.version + 1 });
}
