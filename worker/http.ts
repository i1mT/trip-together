import { z } from "zod";
import { mapTilesOrigin } from "../shared/map-source";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "请求格式不正确");
  if (Number(request.headers.get("content-length") ?? 0) > 12000)
    throw new HttpError(413, "提交的内容过长");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) {
        await reader.cancel();
        throw new HttpError(413, "提交的内容过长");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "请求内容无法读取");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const names: Record<string, string> = {
      email: "邮箱",
      password: "密码",
      title: "名称",
      name: "昵称",
      start_date: "出发日期",
      end_date: "返回日期",
      start: "开始时间",
      end: "结束时间",
      currency: "币种",
      home_currency: "常用币种",
      timezone: "当地时间",
      home_timezone: "常住地时间",
      endTimezone: "到达地时间",
      date: "日期",
      amount: "金额",
      participants: "分摊成员",
      documents: "关联资料",
      note: "说明",
      version: "内容版本",
      destinations: "目的地",
      token: "邀请口令",
    };
    const label = names[String(issue?.path[0])] ?? "填写内容";
    const message =
      issue && /[\u4e00-\u9fff]/.test(issue.message)
        ? issue.message
        : issue?.code === "too_big"
          ? `${label}超出允许范围，请缩短内容或减小数值`
          : `请检查${label}是否完整、正确`;
    throw new HttpError(400, message);
  }
  return result.data;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    throw new HttpError(403, "请从本站页面提交操作");
}
export function secure(response: Response) {
  const result = new Response(response.body, response);
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "no-referrer");
  result.headers.set("X-Frame-Options", "SAMEORIGIN");
  result.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  result.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${mapTilesOrigin}; connect-src 'self' https://api.bigdatacloud.net ${mapTilesOrigin}; font-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`,
  );
  return result;
}
