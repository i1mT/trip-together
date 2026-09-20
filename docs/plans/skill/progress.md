# 旅行助手 Skill 进度

方案见 [01-plan.md](01-plan.md)。

## 已完成

### 阶段 1：设备授权登录（2026-09-20）

- `infra/schema/0010_api_tokens.sql`：`api_tokens`（只存 `sha256`）与 `device_authorizations`。
- `worker/security/device.ts`：`POST /api/device/code` 生成 8 位短码与一次性 `device_code`；`GET /api/device` 供页面校验并读取助手名称；`POST /api/device/approve|deny` 需要登录会话；`POST /api/device/token` 轮询兑换，令牌 180 天、剩余不足 150 天自动续期。
- `worker/accounts/tokens.ts`：`apiTokenIdentity`、`issueApiToken`、`listApiTokens`、`revokeApiToken`。
- `worker/security/session.ts`：`verifiedCredential` / `bearerToken`，会话与令牌共用 host 绑定 HMAC。
- `worker/auth.ts`：`identity()` 支持 Bearer 回退；`logout` 同时撤销会话与令牌。
- `worker/index.ts`：新增 5 个设备授权路由与 `/api/api-tokens`；`sameOrigin` 对「带 Bearer 且不带 Cookie」的请求和两个不使用 Cookie 的设备授权端点跳过，浏览器与跨站 Cookie 请求仍然返回 403。
- `/device` 授权页：未登录时复用登录页并显示授权码，登录后确认助手名称与授权码，可允许或拒绝。
- 「我的 → 已授权的设备」：列出授权名称、授权时间与最近使用时间，红色图标撤销并二次确认。

### 阶段 2–3：CLI 与打包发布（2026-09-20）

- `skills/trip-together/`：`SKILL.md`、`references/{model,api,recipes}.md`、`examples/trip-draft.json`。
- `skills/trip-together/scripts/tt.mjs` 与 `scripts/lib/{http,auth,commands}.mjs`：零依赖 Node CLI，覆盖登录、行程、安排、准备事项、旅行资料、个人证件、账本、凭证、地点搜索与旅行攻略市场，另有 `raw` 兜底。stdout 只输出一行 JSON，进度写 stderr。
- 凭据存 `~/.config/trip-together/credentials.json`（权限 600，按站点分键），支持 `--base` / `TT_BASE` 切换自建站点。
- 删除类命令必须显式 `--yes`，删除行程还要 `--confirm "<行程名称>"`；`event update`、`trip update` 缺 `version` 时自动读取最新版本。
- `scripts/build-skill.mjs`：零依赖 ZIP 打包（deflate、固定时间戳、保留 `tt.mjs` 可执行位），构建前校验必需文件与 `.mjs` 语法；`npm run build` 先打包再构建站点，`npm run build:skill` 可单独重打。压缩包输出到 `web/public/skill/trip-together-skill.zip`（已加入 `.gitignore`），随静态资源发布。
- `scripts/deploy.mjs` 在部署前校验 `web/out` 里存在该压缩包。

## 接入入口（App 内）

- `web/src/components/ai-guide.tsx` 提供 `AiGuideEntry`：入口按钮 + 「接入 AI」说明弹窗，弹窗内含可复制的一段话（复制后按钮变成对号，2 秒后恢复）和唯一的「我知道了」按钮；`promptText(origin)` 用当前站点的 `window.location.origin` 拼出本站压缩包地址，本地测试时复制到的就是本地地址。
- 入口位置：无行程首页空态、完整行程「这一天还没有安排」空态（`EmptyState` 新增 `extra`）、创建行程弹窗标题旁（`Sheet` 新增 `titleExtra`，仅新建时显示，行程设置不显示）、我的页面底部。
- 创建行程里的「接入 AI」用 `onOpen` 替换掉创建弹窗而不是叠加：读取说明时只有一个弹窗，点「我知道了」回到创建表单，已填内容仍在（表单组件不卸载）。

## 验证

- `npm test`：39 项通过，其中 `tests/device.test.ts` 覆盖允许、拒绝、一次性兑换、未知授权码、撤销、「Cookie + Bearer 的跨站请求仍返回 403」，并按命令行场景验证设备授权端点不带 `Origin` 也能使用。
- Chromium 与 WebKit 各 17 项 e2e 通过，其中 `tests/flows/device.spec.ts` 走完登录 → 允许 → 助手拿到令牌 → 网页撤销 → 令牌立即失效，`tests/flows/ai-guide.spec.ts` 覆盖四个接入入口、复制内容与对号恢复。
- 本地 `wrangler dev` 实测：从 `http://localhost:8790/skill/trip-together-skill.zip` 下载 zip、解压后运行解压出来的 CLI，走完 `login`（浏览器授权）→ `whoami` → `trip new/use` → `event add/status/list` → `place` → `data` → `expense add/list` → `prep add/check` → `doc upload/rename/download` → `market list` → `raw` → `trip rm`，全部通过；无 `--yes` / `--confirm` 的删除按预期被拒绝。
- 截图与日志：`.local/device-*.png`、`.local/ai-*.png`、`.local/skill-smoke.log`、`.local/skill-zip-smoke.log`。

## 待办

- 上线时应用 `0010_api_tokens.sql` migration，并确认 `web/out/skill/trip-together-skill.zip` 随发布一起上传。
- 草案批量导入 `tt import --dry-run` / `--commit` 尚未实现（当前由助手逐条调用命令写入）。
- 尚未在真实 AI agent 平台里安装该 skill 完整跑一次「用户交一张机票截图 → 自动录入」的对话流程。
