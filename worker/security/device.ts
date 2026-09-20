import { z } from "zod";
import { body, HttpError, json } from "../http";
import { sha, randomToken } from "../accounts/password";
import {
  issueApiToken,
  cleanLabel,
  tokenLifetimeSeconds,
} from "../accounts/tokens";
import { rateLimit } from "./rate-limit";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  codeFormat = /^[A-Z2-9]{8}$/,
  lifetime = 600000,
  interval = 3;
type Authorization = {
  status: string;
  label: string;
  member_id: string | null;
  expires_at: number;
};
function userCode() {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}
export async function deviceCode(request: Request, env: Env) {
  await rateLimit(request, env, "device-code", 12);
  const input = await body(
      request,
      z.object({ label: z.string().max(60).optional() }),
    ),
    secret = randomToken(),
    hash = await sha(secret),
    now = Date.now(),
    label = cleanLabel(input.label ?? ""),
    expires = now + lifetime;
  let code = "";
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = userCode();
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO device_authorizations (code_hash,user_code,status,label,created_at,expires_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(hash, candidate, "pending", label, now, expires)
      .run();
    if (result.meta.changes) code = candidate;
  }
  if (!code) throw new HttpError(503, "暂时无法生成授权码，请稍后重试");
  await env.DB.prepare("DELETE FROM device_authorizations WHERE expires_at < ?")
    .bind(now)
    .run();
  const origin = new URL(request.url).origin;
  return json({
    user_code: code,
    device_code: secret,
    verification_url: `${origin}/device?code=${code}`,
    expires_in: lifetime / 1000,
    interval,
  });
}

async function find(env: Env, hash: string) {
  return env.DB.prepare(
    "SELECT status,label,member_id,expires_at FROM device_authorizations WHERE code_hash=?",
  )
    .bind(hash)
    .first<Authorization>();
}

async function decide(
  request: Request,
  env: Env,
  memberId: string,
  status: string,
) {
  const { code } = await body(
    request,
    z.object({ code: z.string().trim().min(4).max(16) }),
  );
  const result = await env.DB.prepare(
    "UPDATE device_authorizations SET status=?,member_id=? WHERE user_code=? AND status='pending' AND expires_at>?",
  )
    .bind(status, memberId, code.toUpperCase(), Date.now())
    .run();
  if (!result.meta.changes)
    throw new HttpError(400, "授权码无效或已过期，请在助手中重新发起登录");
  return json({ ok: true });
}

export function deviceApprove(request: Request, env: Env, memberId: string) {
  return decide(request, env, memberId, "approved");
}

export function deviceDeny(request: Request, env: Env, memberId: string) {
  return decide(request, env, memberId, "denied");
}

export async function deviceLookup(request: Request, env: Env) {
  const code = (
    new URL(request.url).searchParams.get("code") ?? ""
  ).toUpperCase();
  if (!codeFormat.test(code)) return json({ valid: false, label: "" });
  const row = await env.DB.prepare(
    "SELECT label FROM device_authorizations WHERE user_code=? AND expires_at>?",
  )
    .bind(code, Date.now())
    .first<{ label: string }>();
  return json({ valid: Boolean(row), label: row?.label ?? "" });
}

export async function deviceExchange(request: Request, env: Env) {
  await rateLimit(request, env, "device-token", 400);
  const { device_code } = await body(
    request,
    z.object({ device_code: z.string().regex(/^[a-f0-9]{64}$/) }),
  );
  const hash = await sha(device_code),
    now = Date.now(),
    row = await find(env, hash);
  if (!row || row.expires_at <= now) {
    await env.DB.prepare("DELETE FROM device_authorizations WHERE code_hash=?")
      .bind(hash)
      .run();
    throw new HttpError(400, "授权已过期，请在助手中重新发起登录");
  }
  if (row.status === "pending") return json({ status: "pending" });
  await env.DB.prepare("DELETE FROM device_authorizations WHERE code_hash=?")
    .bind(hash)
    .run();
  if (row.status !== "approved" || !row.member_id)
    return json({ status: "denied" });
  const member = await env.DB.prepare(
    "SELECT id,email,name FROM members WHERE id=?",
  )
    .bind(row.member_id)
    .first();
  return json({
    status: "approved",
    token: await issueApiToken(request, env, row.member_id, row.label),
    expires_in: tokenLifetimeSeconds,
    member,
  });
}
