import { introductionSchema, shareTitleSchema } from "../../shared/market";
import { z } from "zod";
import { body, HttpError, json } from "../http";
import { requireOwner, type Trip } from "../trips/access";
import { rateLimit } from "../auth";
import { draft } from "./snapshot";
import { readPublic } from "./public";
export async function manageShare(
  request: Request,
  env: Env,
  trip: Trip,
  memberId: string,
) {
  requireOwner(trip, memberId);
  const existing = await env.DB.prepare(
    "SELECT id,version FROM public_itineraries WHERE trip_id=?",
  )
    .bind(trip.id)
    .first<{ id: string; version: number }>();
  if (request.method === "GET")
    return json({
      ...(await draft(env, trip)),
      current: existing ? await readPublic(env, existing.id) : null,
    });
  if (request.method === "DELETE") {
    const { version, publicationId } = await body(
      request,
      z.object({
        version: z.number().int().positive(),
        publicationId: z.string().uuid(),
      }),
    );
    const result = await env.DB.prepare(
      "DELETE FROM public_itineraries WHERE trip_id=? AND version=? AND id=?",
    )
      .bind(trip.id, version, publicationId)
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "分享状态已经变化，请重新打开后操作");
    return json({ ok: true });
  }
  await rateLimit(request, env, "publish-itinerary", 30);
  const v = await body(
    request,
    z.object({
      hash: z.string().length(64),
      version: z.number().int().nonnegative(),
      confirmed: z.literal(true),
      introduction: introductionSchema.default(""),
      title: shareTitleSchema,
      publicationId: z.string().uuid().nullable(),
    }),
  );
  const latest = await draft(env, trip);
  if (!latest.snapshot)
    throw new HttpError(400, "请先添加行程事项，再公开分享");
  if (latest.hash !== v.hash)
    throw new HttpError(409, "行程已经修改，请重新预览后发布");
  if (
    (existing?.version ?? 0) !== v.version ||
    (existing?.id ?? null) !== v.publicationId
  )
    throw new HttpError(409, "分享状态已经变化，请重新预览");
  const id = existing?.id ?? crypto.randomUUID(),
    s = latest.snapshot;
  const title = v.title?.trim() || s.trip.title;
  const snapshot =
    title === s.trip.title ? s : { ...s, trip: { ...s.trip, title } };
  const searchText = [title, ...s.trip.destinations.map((d) => d.name)].join(
    " ",
  );
  let result;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
    ).join("");
    try {
      result = existing
        ? await env.DB.prepare(
            "UPDATE public_itineraries SET title=?,search_text=?,snapshot=?,introduction=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND trip_id=? AND version=?",
          )
            .bind(
              title,
              searchText,
              JSON.stringify(snapshot),
              v.introduction,
              id,
              trip.id,
              v.version,
            )
            .run()
        : await env.DB.prepare(
            "INSERT INTO public_itineraries(id,trip_id,title,search_text,snapshot,introduction,code) VALUES (?,?,?,?,?,?,?) ON CONFLICT(trip_id) DO NOTHING",
          )
            .bind(
              id,
              trip.id,
              title,
              searchText,
              JSON.stringify(snapshot),
              v.introduction,
              code,
            )
            .run();
      break;
    } catch (error) {
      if (
        existing ||
        !(error instanceof Error) ||
        !error.message.includes(
          "UNIQUE constraint failed: public_itineraries.code",
        )
      )
        throw error;
    }
  }
  if (!result) throw new HttpError(503, "暂时无法生成分享口令，请重试");
  if (!result.meta.changes) throw new HttpError(409, "分享已经更新，请刷新");
  return json(await readPublic(env, id));
}
