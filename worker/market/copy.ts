import { z } from "zod";
import { body, HttpError, json } from "../http";
import { rateLimit } from "../auth";
import { dateSchema } from "../../shared/validation";
import { readPublic } from "./public";
import { shiftSnapshot } from "./snapshot";
export async function copyItinerary(
  request: Request,
  env: Env,
  memberId: string,
  publicId: string,
) {
  const v = await body(
    request,
    z.object({
      requestId: z.string().uuid(),
      version: z.number().int().positive(),
      start_date: dateSchema,
    }),
  );
  async function previous() {
    return env.DB.prepare(
      "SELECT trip_id,public_id FROM itinerary_copies WHERE member_id=? AND request_id=?",
    )
      .bind(memberId, v.requestId)
      .first<{ trip_id: string | null; public_id: string }>();
  }
  function copied(r: { trip_id: string | null; public_id: string }) {
    if (r.public_id !== publicId || !r.trip_id)
      throw new HttpError(409, "复制请求已经使用，请重新打开后复制");
    return json({ id: r.trip_id });
  }
  const prior = await previous();
  if (prior) return copied(prior);
  await rateLimit(request, env, "copy-itinerary", 20);
  const publication = await readPublic(env, publicId);
  if (publication.version !== v.version)
    throw new HttpError(409, "公开行程已经更新，请刷新预览后复制");
  const snapshot = shiftSnapshot(publication.snapshot, v.start_date),
    t = snapshot.trip,
    id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO trips(id,title,owner_id,start_date,end_date,timezone,home_timezone,currency,home_currency,destinations)
 SELECT ?,?,?,?,?,?,?,?,?,? FROM public_itineraries WHERE id=? AND version=?`,
      ).bind(
        id,
        t.title,
        memberId,
        t.start_date,
        t.end_date,
        t.timezone,
        t.home_timezone,
        t.currency,
        t.home_currency,
        JSON.stringify(t.destinations),
        publicId,
        v.version,
      ),
      env.DB.prepare(
        "INSERT INTO trip_members(trip_id,member_id) VALUES (?,?)",
      ).bind(id, memberId),
      env.DB.prepare(
        "INSERT INTO itinerary_copies(member_id,request_id,public_id,trip_id) VALUES (?,?,?,?)",
      ).bind(memberId, v.requestId, publicId, id),
      ...snapshot.events.map((e) => {
        const eventId = crypto.randomUUID();
        return env.DB.prepare(
          "INSERT INTO events(id,trip_id,data,created_by) VALUES (?,?,?,?)",
        ).bind(
          eventId,
          id,
          JSON.stringify({
            ...e,
            id: eventId,
            documents: [],
            note: "",
            phone: "",
            code: "",
            subtitle: "",
            certainty: "suggested",
            source: `来自公开行程：${publicId}`,
          }),
          memberId,
        );
      }),
    ]);
  } catch (error) {
    const done = await previous();
    if (done) return copied(done);
    const current = await readPublic(env, publicId);
    if (current.version !== v.version)
      throw new HttpError(409, "分享已经变更，请刷新后复制");
    throw error;
  }
  return json({ id });
}
