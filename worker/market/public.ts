import { json, HttpError } from "../http";
import { snapshotSchema, type PublicItinerary } from "../../shared/market";
import { authorJoin, authorColumns, publicAuthor } from "./author";
type PublicRow = {
  id: string;
  code: string;
  introduction: string;
  version: number;
  updated_at: string;
  snapshot: string;
  author_name: string;
  author_avatar: number;
};
export async function readPublic(
  env: Env,
  id: string,
): Promise<PublicItinerary> {
  const row = await env.DB.prepare(
    `SELECT p.id,p.code,p.introduction,p.version,p.updated_at,p.snapshot,${authorColumns} FROM public_itineraries p ${authorJoin} WHERE p.id=?`,
  )
    .bind(id)
    .first<PublicRow>();
  if (!row) throw new HttpError(404, "此行程没有公开分享，或分享已经取消");
  const { author_name, author_avatar, ...value } = row;
  return {
    ...value,
    author: publicAuthor(row),
    snapshot: snapshotSchema.parse(JSON.parse(row.snapshot)),
  };
}
export async function publicMarket(request: Request, env: Env, id?: string) {
  if (id) return json(await readPublic(env, id));
  const url = new URL(request.url),
    q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const code = q.replace(/\s/g, "").toUpperCase();
  const page = Number(url.searchParams.get("page") ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000)
    throw new HttpError(400, "页码无效");
  const rows = await env.DB.prepare(
    `SELECT p.id,p.code,p.introduction,p.title,p.updated_at,${authorColumns},
 CAST(julianday(json_extract(p.snapshot,'$.trip.end_date'))-julianday(json_extract(p.snapshot,'$.trip.start_date'))+1 AS INTEGER) AS days,
 json_array_length(p.snapshot,'$.events') AS event_count,json_extract(p.snapshot,'$.trip.destinations') AS destinations
 FROM public_itineraries p ${authorJoin} WHERE p.code=? OR instr(lower(p.search_text),lower(?))>0 ORDER BY (p.code=?) DESC,p.updated_at DESC,p.id LIMIT 21 OFFSET ?`,
  )
    .bind(code, q, code, page * 20)
    .all<{
      id: string;
      code: string;
      introduction: string;
      title: string;
      updated_at: string;
      days: number;
      event_count: number;
      destinations: string;
      author_name: string;
      author_avatar: number;
    }>();
  return json({
    items: rows.results.slice(0, 20).map((row) => {
      const { author_name, author_avatar, ...value } = row;
      return {
        ...value,
        author: publicAuthor(row),
        destinations: JSON.parse(row.destinations).map(
          (d: { name: string }) => d.name,
        ),
      };
    }),
    hasMore: rows.results.length > 20,
  });
}
