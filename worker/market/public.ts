import { json, HttpError } from "../http";
import { snapshotSchema, type PublicItinerary } from "../../shared/market";
export async function readPublic(
  env: Env,
  id: string,
): Promise<PublicItinerary> {
  const row = await env.DB.prepare(
    "SELECT id,version,updated_at,snapshot FROM public_itineraries WHERE id=?",
  )
    .bind(id)
    .first<{
      id: string;
      version: number;
      updated_at: string;
      snapshot: string;
    }>();
  if (!row) throw new HttpError(404, "此行程没有公开分享，或分享已经取消");
  return { ...row, snapshot: snapshotSchema.parse(JSON.parse(row.snapshot)) };
}
export async function publicMarket(request: Request, env: Env, id?: string) {
  if (id) return json(await readPublic(env, id));
  const url = new URL(request.url),
    q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Number(url.searchParams.get("page") ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000)
    throw new HttpError(400, "页码无效");
  const rows = await env.DB.prepare(
    `SELECT id,title,updated_at,
 CAST(julianday(json_extract(snapshot,'$.trip.end_date'))-julianday(json_extract(snapshot,'$.trip.start_date'))+1 AS INTEGER) AS days,
 json_array_length(snapshot,'$.events') AS event_count,json_extract(snapshot,'$.trip.destinations') AS destinations
 FROM public_itineraries WHERE instr(lower(search_text),lower(?))>0 ORDER BY updated_at DESC,id LIMIT 21 OFFSET ?`,
  )
    .bind(q, page * 20)
    .all<{
      id: string;
      title: string;
      updated_at: string;
      days: number;
      event_count: number;
      destinations: string;
    }>();
  return json({
    items: rows.results
      .slice(0, 20)
      .map((r) => ({
        ...r,
        destinations: JSON.parse(r.destinations).map(
          (d: { name: string }) => d.name,
        ),
      })),
    hasMore: rows.results.length > 20,
  });
}
