// 设备授权登录：在浏览器里确认一次，令牌保存在本地凭据文件，不要求用户复制粘贴。
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { ApiError, api, context } from "./http.mjs";
const directory =
  process.env.TT_HOME ?? join(homedir(), ".config", "trip-together");
const file = join(directory, "credentials.json");
export function credentialPath() {
  return file;
}
export function readCredentials() {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value ? value : {};
  } catch {
    return {};
  }
}
function write(value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {}
}
export function stored(base) {
  return readCredentials()[base] ?? null;
}
export function remember(base, patch) {
  const all = readCredentials();
  all[base] = { ...(all[base] ?? {}), ...patch };
  write(all);
  return all[base];
}
export function forget(base) {
  const all = readCredentials();
  delete all[base];
  write(all);
}
function openBrowser(url) {
  const [command, args] =
    platform() === "darwin"
      ? ["open", [url]]
      : platform() === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {}
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function login({ label, open = true } = {}) {
  const { base } = context(),
    code = await api("/device/code", {
      method: "POST",
      data: { label: label ?? `trip-together CLI · ${platform()}` },
    });
  process.stderr.write(
    `授权码：${code.user_code}\n请在浏览器中登录并允许：${code.verification_url}\n等待确认（${code.expires_in} 秒内有效）…\n`,
  );
  if (open) openBrowser(code.verification_url);
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    await pause((code.interval ?? 3) * 1000);
    const result = await api("/device/token", {
      method: "POST",
      data: { device_code: code.device_code },
    });
    if (result.status === "pending") continue;
    if (result.status !== "approved")
      throw new ApiError("你在浏览器里拒绝了这次授权");
    remember(base, {
      token: result.token,
      member: result.member,
      authorizedAt: new Date().toISOString(),
    });
    return {
      base,
      member: result.member,
      expiresInDays: Math.round(result.expires_in / 86400),
      credentials: file,
    };
  }
  throw new ApiError("授权码已过期，请重新运行 tt login");
}
export async function logout() {
  const { base, token } = context();
  if (token) await api("/logout", { method: "POST", data: {} }).catch(() => {});
  forget(base);
  return { base, loggedOut: true };
}
