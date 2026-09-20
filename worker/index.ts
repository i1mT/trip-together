import { publicAvatar } from "./market/author";
import { publicMarket } from "./market/public";
import { copyItinerary } from "./market/copy";
import { analyticsConfig } from "./analytics/config";
import { analyticsScheduled } from "./analytics/delivery";
import { summaryResponse } from "./analytics/summary";
import { trackResponse } from "./analytics/track";
import { searchPlaces } from "./places/search";
import { sendCode, verificationRequired } from "./security/email";
import {
  deviceCode,
  deviceLookup,
  deviceExchange,
  deviceApprove,
  deviceDeny,
} from "./security/device";
import { bearerToken } from "./security/session";
import { listApiTokens, revokeApiToken } from "./accounts/tokens";
import { HttpError, json, sameOrigin, secure } from "./http";
import {
  identity,
  login,
  logout,
  register,
  recover,
  migrateAccount,
} from "./auth";
import { bootstrap, createTrip, join } from "./trips/manage";
import { tripRouter } from "./trips/router";
import { updateProfile, changePassword } from "./accounts/profile";
import { personalDocument } from "./storage/personal-documents";
import { fileResponse } from "./files";
import { avatarResponse, uploadAvatar } from "./avatars";
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(analyticsScheduled(env));
  },
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url),
        path = url.pathname,
        method = request.method;
      if (!path.startsWith("/api/")) {
        const r = secure(await env.ASSETS.fetch(request));
        if (r.headers.get("content-type")?.includes("text/html"))
          r.headers.set("Cache-Control", "no-store");
        return r;
      }
      // 浏览器请求始终校验来源。只有两类请求可以跳过：带 Bearer 且不带 Cookie 的脚本请求，
      // 以及不使用 Cookie 的设备授权端点（/api/device/code 与 /api/device/token）。
      const credentialless =
        path === "/api/device/code" || path === "/api/device/token";
      if (
        !["GET", "HEAD"].includes(method) &&
        !credentialless &&
        !(bearerToken(request) && !request.headers.get("cookie"))
      )
        sameOrigin(request);
      if (path === "/api/analytics/config" && method === "GET")
        return secure(json({ enabled: Boolean(analyticsConfig(env)) }));
      if (path === "/api/analytics/summary" && method === "GET")
        return secure(await summaryResponse(request, env));
      if (path === "/api/analytics/track" && method === "POST")
        return secure(await trackResponse(request, env));
      if (
        method === "GET" &&
        /^\/api\/market\/[a-f0-9-]{36}\/avatar$/.test(path)
      )
        return secure(await publicAvatar(env, path.split("/")[3]));
      if (method === "GET" && /^\/api\/market(?:\/[a-f0-9-]{36})?$/.test(path))
        return secure(await publicMarket(request, env, path.split("/")[3]));
      if (path === "/api/auth-config" && method === "GET")
        return secure(
          json({
            emailVerificationRequired: verificationRequired(request, env),
          }),
        );
      if (path === "/api/device" && method === "GET")
        return secure(await deviceLookup(request, env));
      if (path === "/api/device/code" && method === "POST")
        return secure(await deviceCode(request, env));
      if (path === "/api/device/token" && method === "POST")
        return secure(await deviceExchange(request, env));
      if (method === "POST") {
        if (path === "/api/email-code")
          return secure(await sendCode(request, env));
        if (path === "/api/migrate-account")
          return secure(await migrateAccount(request, env));
        if (path === "/api/login") return secure(await login(request, env));
        if (path === "/api/register")
          return secure(await register(request, env));
        if (path === "/api/recover") return secure(await recover(request, env));
      }
      const memberId = await identity(request, env);
      if (!memberId) return secure(json({ error: "请先登录" }, 401));
      if (
        method === "POST" &&
        /^\/api\/market\/[a-f0-9-]{36}\/copy$/.test(path)
      )
        return secure(
          await copyItinerary(request, env, memberId, path.split("/")[3]),
        );
      let r: Response;
      if (path === "/api/bootstrap" && method === "GET")
        r = await bootstrap(env, memberId);
      else if (path === "/api/places" && method === "GET")
        r = await searchPlaces(request, env, memberId);
      else if (path === "/api/logout" && method === "POST")
        r = await logout(request, env);
      else if (path === "/api/profile" && method === "PUT")
        r = await updateProfile(request, env, memberId);
      else if (path === "/api/password" && method === "PUT")
        r = await changePassword(request, env, memberId);
      else if (path === "/api/avatar" && ["PUT", "DELETE"].includes(method))
        r = await uploadAvatar(request, env, memberId);
      else if (path === "/api/trips" && method === "POST")
        r = await createTrip(request, env, memberId);
      else if (path === "/api/join" && method === "POST")
        r = await join(request, env, memberId);
      else if (path === "/api/device/approve" && method === "POST")
        r = await deviceApprove(request, env, memberId);
      else if (path === "/api/device/deny" && method === "POST")
        r = await deviceDeny(request, env, memberId);
      else if (path === "/api/api-tokens" && method === "GET")
        r = await listApiTokens(env, memberId);
      else if (/^\/api\/api-tokens\/[^/]+$/.test(path) && method === "DELETE")
        r = await revokeApiToken(env, memberId, path.split("/").at(-1)!);
      else if (path.startsWith("/api/trips/"))
        r = await tripRouter(request, env, memberId, path.slice(11).split("/"));
      else if (
        /^\/api\/avatars\/[^/]+$/.test(path) &&
        ["GET", "HEAD"].includes(method)
      )
        r = await avatarResponse(
          request,
          env,
          path.split("/").at(-1)!,
          memberId,
        );
      else if (
        /^\/api\/files\/[^/]+$/.test(path) &&
        ["GET", "HEAD"].includes(method)
      )
        r = await fileResponse(request, env, memberId, path.split("/").at(-1)!);
      else if (
        /^\/api\/personal-documents\/[^/]+$/.test(path) &&
        ["PUT", "DELETE"].includes(method)
      )
        r = await personalDocument(
          request,
          env,
          memberId,
          path.split("/").at(-1)!,
        );
      else r = json({ error: "接口不存在" }, 404);
      return secure(r);
    } catch (e) {
      if (e instanceof HttpError)
        return secure(json({ error: e.message }, e.status));
      console.error(
        JSON.stringify({
          event: "request_failed",
          type: e instanceof Error ? e.name : "unknown",
        }),
      );
      return secure(json({ error: "服务暂时不可用，请稍后重试" }, 500));
    }
  },
} satisfies ExportedHandler<Env>;
