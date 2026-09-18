import { HttpError } from "../http";
export const authorJoin =
  "JOIN trips t ON t.id=p.trip_id JOIN members m ON m.id=t.owner_id";
export const authorColumns =
  "m.name AS author_name, (m.avatar_key IS NOT NULL) AS author_avatar";
export function publicAuthor(row: {
  id: string;
  author_name: string;
  author_avatar: number;
}) {
  return {
    name: row.author_name || "旅行者",
    avatar: row.author_avatar ? `/api/market/${row.id}/avatar` : null,
  };
}
export async function publicAvatar(env: Env, id: string) {
  const row = await env.DB.prepare(
    `SELECT m.avatar_key,m.avatar_mime FROM public_itineraries p ${authorJoin} WHERE p.id=?`,
  )
    .bind(id)
    .first<{ avatar_key: string | null; avatar_mime: string }>();
  if (!row?.avatar_key) throw new HttpError(404, "头像不存在");
  const object = await env.FILES.get(row.avatar_key);
  if (!object) throw new HttpError(404, "头像不存在");
  return new Response(object.body, {
    headers: {
      "Content-Type": row.avatar_mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
