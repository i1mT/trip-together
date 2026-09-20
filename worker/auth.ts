import { z } from "zod";
import { body, HttpError, json } from "./http";
import {
  signSession,
  verifiedSession,
  verifiedCredential,
  bearerToken,
} from "./security/session";
import { sha, randomToken, passwordHash, equal } from "./accounts/password";
import { apiTokenIdentity } from "./accounts/tokens";
import { rateLimit } from "./security/rate-limit";
export { rateLimit } from "./security/rate-limit";
import { emailAddress, consumeCode } from "./security/email";
export { sha } from "./accounts/password";
const credentials = z.object({
  email: emailAddress,
  password: z.string().min(10).max(128),
  code: z.string().max(6).optional(),
});
function cookie(request: Request, value: string, age: number) {
  return `travel_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function identity(request: Request, env: Env) {
  const session = await verifiedSession(request, env);
  if (session)
    return env.DB.prepare(
      "SELECT member_id FROM sessions WHERE token_hash=? AND expires_at>?",
    )
      .bind(await sha(session), Date.now())
      .first<string>("member_id");
  const token = await verifiedCredential(request, env, bearerToken(request));
  return token ? apiTokenIdentity(env, token) : null;
}
async function session(
  request: Request,
  env: Env,
  id: string,
  extra: object = {},
) {
  const token = randomToken(),
    signed = await signSession(request, env, token);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions VALUES (?,?,?)").bind(
      await sha(token),
      id,
      Date.now() + 30 * 86400000,
    ),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(
      Date.now(),
    ),
    env.DB.prepare("DELETE FROM login_attempts WHERE expires_at < ?").bind(
      Date.now(),
    ),
  ]);
  return json({ ok: true, ...extra }, 200, {
    "Set-Cookie": cookie(request, signed, 30 * 86400),
  });
}
export async function register(request: Request, env: Env) {
  await rateLimit(request, env, "register");
  const input = await body(request, credentials);
  await consumeCode(request, env, input.email, "register", input.code);
  const id = crypto.randomUUID(),
    salt = randomToken();
  const defaultAvatars = [
    "flight",
    "drive",
    "stay",
    "explore",
    "transfer",
    "luggage",
  ] as const;
  const defaultAvatar =
    defaultAvatars[crypto.getRandomValues(new Uint8Array(1))[0] % 6];
  const result = await env.DB.prepare(
    "INSERT INTO members (id,email,name,password_hash,salt,email_verified_at,default_avatar) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING",
  )
    .bind(
      id,
      input.email,
      "旅行者",
      await passwordHash(input.password, salt),
      salt,
      env.APP_ENV === "local" ? null : Date.now(),
      defaultAvatar,
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "邮箱已经注册，请登录或重置密码");
  return session(request, env, id);
}
export async function login(request: Request, env: Env) {
  await rateLimit(request, env, "login");
  const input = await body(
    request,
    credentials.extend({ password: z.string().min(1).max(128) }),
  );
  const member = await env.DB.prepare(
    "SELECT id,password_hash,salt FROM members WHERE email=?",
  )
    .bind(input.email)
    .first<{ id: string; password_hash: string; salt: string }>();
  const hash = await passwordHash(
    input.password,
    member?.salt ?? "invalid-account",
  );
  if (!member || !equal(hash, member.password_hash))
    throw new HttpError(401, "邮箱或密码不正确");
  return session(request, env, member.id);
}
export async function recover(request: Request, env: Env) {
  await rateLimit(request, env, "recover", 10);
  const input = await body(request, credentials);
  await consumeCode(request, env, input.email, "recover", input.code);
  const member = await env.DB.prepare("SELECT id FROM members WHERE email=?")
    .bind(input.email)
    .first<{ id: string }>();
  if (!member) throw new HttpError(400, "无法重置密码，请检查邮箱或先注册");
  const salt = randomToken();
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET password_hash=?,salt=? WHERE id=?").bind(
      await passwordHash(input.password, salt),
      salt,
      member.id,
    ),
    env.DB.prepare("DELETE FROM sessions WHERE member_id=?").bind(member.id),
  ]);
  return json({ ok: true });
}
export async function migrateAccount(request: Request, env: Env) {
  await rateLimit(request, env, "migrate", 10);
  const input = await body(
    request,
    credentials.extend({
      legacyUsername: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_.-]{3,40}$/),
    }),
  );
  const member = await env.DB.prepare(
    "SELECT id,password_hash,salt FROM members WHERE email=? AND instr(email,'@')=0",
  )
    .bind(input.legacyUsername)
    .first<{ id: string; password_hash: string; salt: string }>();
  if (
    !member ||
    !equal(
      await passwordHash(input.password, member.salt),
      member.password_hash,
    )
  )
    throw new HttpError(401, "旧账号或密码不正确");
  await consumeCode(request, env, input.email, "migrate", input.code);
  const result = await env.DB.prepare(
    "UPDATE OR IGNORE members SET email=?,email_verified_at=?,version=version+1 WHERE id=? AND email=? AND password_hash=?",
  )
    .bind(
      input.email,
      env.APP_ENV === "local" ? null : Date.now(),
      member.id,
      input.legacyUsername,
      member.password_hash,
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(409, "邮箱已经使用或账号已经更新，请重新登录");
  await env.DB.prepare("DELETE FROM sessions WHERE member_id=?")
    .bind(member.id)
    .run();
  return session(request, env, member.id);
}
export async function logout(request: Request, env: Env) {
  const session = await verifiedSession(request, env),
    token =
      session ||
      (await verifiedCredential(request, env, bearerToken(request))) ||
      "";
  if (token) {
    const hash = await sha(token);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash),
      env.DB.prepare("DELETE FROM api_tokens WHERE token_hash=?").bind(hash),
    ]);
  }
  return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
}
