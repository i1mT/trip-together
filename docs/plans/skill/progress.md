# 旅行助手 Skill 进度

方案见 [01-plan.md](01-plan.md)。

## 已完成

### 阶段 1：设备授权登录（2026-09-20）

- `infra/schema/0010_api_tokens.sql`：`api_tokens`（只存 `sha256`）与 `device_authorizations`。
- `worker/security/device.ts`：`POST /api/device/code` 生成 8 位短码与一次性 `device_code`；`GET /api/device` 供页面校验并读取助手名称；`POST /api/device/approve|deny` 需要登录会话；`POST /api/device/token` 轮询兑换，令牌 180 天、剩余不足 150 天自动续期。
- `worker/accounts/tokens.ts`：`apiTokenIdentity`、`issueApiToken`、`listApiTokens`、`revokeApiToken`。
- `worker/security/session.ts`：`verifiedCredential` / `bearerToken`，会话与令牌共用 host 绑定 HMAC。
- `worker/auth.ts`：`identity()` 支持 Bearer 回退；`logout` 同时撤销会话与令牌。
- `worker/index.ts`：新增 5 个设备授权路由与 `/api/api-tokens`；`sameOrigin` 仅对「带 Bearer 且不带 Cookie」的请求跳过。
- `/device` 授权页：未登录时复用登录页并显示授权码，登录后确认助手名称与授权码，可允许或拒绝。
- 「我的 → 已授权的设备」：列出授权名称、授权时间与最近使用时间，红色图标撤销并二次确认。

## 验证

- `npm test`：39 项通过，其中 `tests/device.test.ts` 覆盖允许、拒绝、一次性兑换、未知授权码、撤销及「Cookie + Bearer 的跨站请求仍返回 403」。
- Chromium 与 WebKit 各 15 项 e2e 通过，其中 `tests/flows/device.spec.ts` 走完登录 → 允许 → 助手拿到令牌 → 网页撤销 → 令牌立即失效。
- 本地 `wrangler dev`（`.local/device-verify`，已应用 0010）实测；截图见 `.local/device-approve-*.png`、`.local/device-login.png`、`.local/device-tokens.png`。

## 待办

- 阶段 2：CLI 骨架（`tt login/whoami/logout`、`trips list`、凭据存储）。
- 阶段 3：写入类命令与 `tt import --dry-run` / `--commit`。
- 阶段 4：`SKILL.md`、references、示例与端到端验收。
- 上线时应用 `0010_api_tokens.sql` migration。
