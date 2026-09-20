// 与 Trip Together Worker API 通信的最小客户端：只依赖 Node 内置模块。
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
export const defaultBase = "https://trip.awell.one";
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
let session = { base: defaultBase, token: "" };
export function configure(next) {
  session = { ...session, ...next };
}
export function context() {
  return session;
}
function parse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}
export async function api(path, { method = "GET", data, headers = {} } = {}) {
  const url = `${session.base}/api${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  } catch (error) {
    throw new ApiError(`无法连接 ${session.base}：${error.message}`);
  }
  if (!response.ok) {
    const value = parse(await response.text());
    throw new ApiError(
      value.error ?? `请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  if (response.status === 204) return {};
  return parse(await response.text());
}
const mimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};
export async function upload(path, file, { contentType, name } = {}) {
  const type = contentType ?? mimeTypes[extname(file).toLowerCase()];
  if (!type)
    throw new ApiError("只能上传 PNG、JPEG、WebP 或 PDF，其他格式请先转换");
  const response = await fetch(`${session.base}/api${path}`, {
    method: "PUT",
    headers: {
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      "Content-Type": type,
      "X-File-Name": encodeURIComponent(name ?? basename(file)),
    },
    body: await readFile(file),
  });
  if (!response.ok) {
    const value = parse(await response.text());
    throw new ApiError(
      value.error ?? `上传失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return parse(await response.text());
}
export async function download(path, target) {
  const response = await fetch(`${session.base}/api${path}`, {
    headers: session.token ? { Authorization: `Bearer ${session.token}` } : {},
  });
  if (!response.ok)
    throw new ApiError(`下载失败（HTTP ${response.status}）`, response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);
  return { path: target, bytes: bytes.length };
}
export function query(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}
