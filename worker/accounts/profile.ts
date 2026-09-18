import { z } from "zod";
import { body, HttpError, json } from "../http";
import { passwordHash, randomToken, equal } from "./password";
import { rateLimit } from "../auth";
export const profileColumns =
  "id,email,name,english_name,passport,identity_number,expiry,version,default_avatar,(avatar_key IS NOT NULL) AS has_avatar";
export async function profile(env: Env, id: string) {
  return env.DB.prepare(`SELECT ${profileColumns} FROM members WHERE id=?`)
    .bind(id)
    .first();
}
export async function updateProfile(request: Request, env: Env, id: string) {
  const v = await body(
    request,
    z.object({
      name: z.string().trim().min(1).max(60),
      english_name: z.string().max(100),
      passport: z.string().max(60),
      identity_number: z.string().max(60),
      expiry: z.string().max(30),
      version: z.number().int().positive(),
    }),
  );
  const result = await env.DB.prepare(
    "UPDATE members SET name=?,english_name=?,passport=?,identity_number=?,expiry=?,version=version+1 WHERE id=? AND version=?",
  )
    .bind(
      v.name,
      v.english_name,
      v.passport,
      v.identity_number,
      v.expiry,
      id,
      v.version,
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "个人资料已经更新，请刷新后重试");
  return json({ ok: true });
}
export async function changePassword(request: Request, env: Env, id: string) {
  await rateLimit(request, env, "password");
  const v = await body(
    request,
    z.object({
      currentPassword: z.string().max(128),
      password: z.string().min(10).max(128),
    }),
  );
  const m = await env.DB.prepare(
    "SELECT password_hash,salt FROM members WHERE id=?",
  )
    .bind(id)
    .first<{ password_hash: string; salt: string }>();
  if (
    !m ||
    !equal(await passwordHash(v.currentPassword, m.salt), m.password_hash)
  )
    throw new HttpError(401, "当前密码不正确");
  const salt = randomToken();
  const result = await env.DB.batch([
    env.DB.prepare(
      "UPDATE members SET password_hash=?,salt=? WHERE id=? AND password_hash=?",
    ).bind(await passwordHash(v.password, salt), salt, id, m.password_hash),
    env.DB.prepare(
      "DELETE FROM sessions WHERE member_id=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND salt=?)",
    ).bind(id, id, salt),
  ]);
  if (!result[0].meta.changes)
    throw new HttpError(409, "密码已经变更，请重新登录");
  return json({ ok: true });
}
