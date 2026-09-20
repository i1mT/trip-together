import { json } from "../http";
import { sha, randomToken } from "./password";
import { signSession } from "../security/session";

const lifetime = 180 * 86400000,
  renewBefore = 150 * 86400000,
  touchAfter = 3600000;
export const tokenLifetimeSeconds = lifetime / 1000;
export function cleanLabel(value: string) {
  return value.trim().slice(0, 60);
}
export async function apiTokenIdentity(env: Env, token: string) {
  const now = Date.now(),
    hash = await sha(token);
  const row = await env.DB.prepare(
    "SELECT member_id,last_used_at,expires_at FROM api_tokens WHERE token_hash=? AND expires_at>?",
  )
    .bind(hash, now)
    .first<{ member_id: string; last_used_at: number; expires_at: number }>();
  if (!row) return null;
  if (now - row.last_used_at > touchAfter || row.expires_at - now < renewBefore)
    await env.DB.prepare(
      "UPDATE api_tokens SET last_used_at=?,expires_at=? WHERE token_hash=?",
    )
      .bind(now, now + lifetime, hash)
      .run();
  return row.member_id;
}
export async function issueApiToken(
  request: Request,
  env: Env,
  memberId: string,
  label: string,
) {
  const token = randomToken(),
    signed = await signSession(request, env, token),
    now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO api_tokens VALUES (?,?,?,?,?,?,?)").bind(
      crypto.randomUUID(),
      await sha(token),
      memberId,
      cleanLabel(label),
      now,
      now,
      now + lifetime,
    ),
    env.DB.prepare("DELETE FROM api_tokens WHERE expires_at < ?").bind(now),
  ]);
  return signed;
}
export async function listApiTokens(env: Env, memberId: string) {
  const rows = await env.DB.prepare(
    "SELECT id,label,created_at,last_used_at,expires_at FROM api_tokens WHERE member_id=? AND expires_at>? ORDER BY created_at DESC",
  )
    .bind(memberId, Date.now())
    .all();
  return json({ tokens: rows.results });
}
export async function revokeApiToken(env: Env, memberId: string, id: string) {
  await env.DB.prepare("DELETE FROM api_tokens WHERE member_id=? AND id=?")
    .bind(memberId, id)
    .run();
  return json({ ok: true });
}
