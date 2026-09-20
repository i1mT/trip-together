# Trip Together 通用版 Skill 方案

让 AI 助手（读 `SKILL.md` 的 agent）通过 CLI 完成 App 中所有可以手动完成的操作：创建与加入行程、维护安排、准备事项、旅行资料、个人证件、账本，以及分享到旅行攻略市场。

## 1. 交付物结构

```
skills/trip-together/
  SKILL.md                 # 触发描述 + 使用说明 + 铁律
  references/api.md        # 接口与字段参考
  references/model.md      # 数据模型、金额、时区规则
  references/recipes.md    # 常用编排配方
  scripts/tt.mjs           # CLI 入口
  scripts/lib/{auth,http,commands}.mjs
  examples/trip-draft.sample.json
```

Skill 不复制业务逻辑：所有写入都调用线上 Worker 的公开 API，与网页端走同一套校验和权限。Skill 随本仓库发布在 `skills/trip-together/`。

## 2. 认证：设备授权（浏览器登录一次，Skill 自己拿到令牌）

用户只需要在浏览器里正常登录一次并点一次「允许」，不生成、不复制、不粘贴任何令牌。

### 流程

1. 助手执行 `tt login`。
2. CLI 调 `POST /api/device/code`（无需登录，带限速），拿到
   `{ user_code, device_code, verification_url, expires_in: 600, interval: 3 }`。
   `user_code` 是 8 位易读字符（排除 I/O/0/1），`device_code` 是 32 字节随机值，二者不可互相推导。
3. CLI 用 `open`（macOS）/ `start`（Windows）/ `xdg-open`（Linux）打开 `verification_url`，同时把链接和短码打印出来，方便用户在任意设备打开：
   `https://<站点>/device?code=K7M2P4QX`
4. 浏览器进入 `/device?code=...`：
   - 未登录 → 复用现有登录页，并在登录页提示「旅行助手正在等待授权，登录后确认即可」和授权码，登录后原地进入确认卡片；
   - 已登录 → 显示确认卡片：「『Claude Code · macOS』请求访问你的账号」+ 授权码 +「允许访问」/「拒绝」。
5. 点「允许访问」→ `POST /api/device/approve`（需要登录 cookie，走现有 `identity`）→ 该条授权记录标记为已批准并绑定 `member_id`。
6. CLI 按 `interval` 轮询 `POST /api/device/token`（body 只含 `device_code`）：
   - `pending` 继续等待；`denied` 明确报错退出；
   - `approved` → 服务端生成 64 字节随机令牌，写入 `api_tokens`，返回 `token.<hmac>`（沿用现有 `signSession` 的 HMAC，仍与 host 绑定）。同一 `device_code` 只能兑换一次，兑换后记录立即删除。
7. CLI 把令牌写入 `~/.config/trip-together/credentials.json`（`0600`，按站点分键），此后所有请求带
   `Authorization: Bearer <token>`。
8. `tt whoami` 查看当前账号；`tt logout` 调 `POST /api/logout` 只撤销这一枚令牌，不影响浏览器登录。

### 有效期

默认 180 天；每次成功请求时若剩余不足 150 天，自动续期到 180 天，`last_used_at` 最多每小时更新一次。用户正常使用不会遇到过期。令牌带 `label`（如 `Claude Code · macOS`），在「我的 → 已授权的设备」中可辨认与撤销。

### 安全边界

- 服务端只存 `sha256(token)`，不存明文；令牌不写日志、不出现在 URL 中。
- 未登录用户打开 `/device` 链接只能看到登录页，看不到任何账号或行程信息。
- 批准后 10 分钟内未兑换即失效；过期记录由写入路径顺手清理，不新增定时任务。
- Bearer 不会被浏览器自动携带；`sameOrigin` 只对「带 Bearer 且不带 Cookie」的请求跳过，浏览器请求仍然校验来源。
- 不再要求用户手工生成或粘贴令牌；`tt login --token` 仅作为高级兜底保留，不在文档中宣传。

## 3. 服务端实现

| 位置 | 改动 |
| --- | --- |
| `infra/schema/0010_api_tokens.sql` | 新建 `api_tokens` 与 `device_authorizations` 及过期索引 |
| `worker/security/device.ts` | 短码生成、`deviceCode` / `deviceLookup` / `deviceApprove` / `deviceDeny` / `deviceExchange`、限速与过期清理 |
| `worker/accounts/tokens.ts` | `apiTokenIdentity`、`issueApiToken`、`listApiTokens`、`revokeApiToken` |
| `worker/security/session.ts` | 抽出 `verifiedCredential` 与 `bearerToken`，会话与令牌共用签名校验 |
| `worker/auth.ts` | `identity()` 先读 cookie 会话，再回退到 Bearer 令牌；`logout` 同时撤销两种凭据 |
| `worker/index.ts` | `/api/device`、`/api/device/code`、`/api/device/token`、`/api/device/approve`、`/api/device/deny`、`/api/api-tokens` |
| `web/src/app/device/page.tsx`、`web/src/components/device/approval.tsx` | 授权确认页，复用登录页与按钮样式 |
| `web/src/components/profile/api-tokens.tsx` | 「我的 → 已授权的设备」列表与撤销 |

不使用 `sessions` 表承载令牌，避免 `analytics_session` 触发器把助手登录计成 `session_started`。

## 4. CLI 命令与 App 操作对应

| 命令 | 对应 App 操作 |
| --- | --- |
| `tt login` / `logout` / `whoami` | 设备授权登录 |
| `tt trips list/new/use/join/show/update/rm` | 我的行程：列表、创建、切换、口令加入、设置、删除 |
| `tt members list` | 同行成员 |
| `tt invites get/new/revoke` | 6 位同行口令 |
| `tt days` | 完整行程的日期分组 |
| `tt events list/add/update/status/rm` | 安排：查看、新增、修改、标记已结束/已取消/恢复、删除 |
| `tt prep list/add/check/rm` | 准备事项 |
| `tt docs list/upload/rename/link/unlink/rm/download` | 旅行资料与安排关联资料 |
| `tt me docs list/upload/rm` | 个人证件与文件（仅本人可见） |
| `tt expenses list/add/update/rm/summary` | 账本：录入、修改、删除、成员统计 |
| `tt receipts upload/rm` | 支出凭证（私有 R2） |
| `tt share publish/update/revoke/show` | 发布到旅行攻略市场 |
| `tt market search/show/copy` | 市场检索、详情、复制为独立行程 |
| `tt place search` | 地点搜索（服务端代理，密钥不进前端） |
| `tt export` | 导出当前行程为草案 JSON |
| `tt import --dry-run` / `--commit` | 按草案 JSON 批量写入 |
| `tt raw <method> <path>` | 兜底调用任意已鉴权接口 |

## 5. 助手工作流与铁律

工作流：收集信息 → 解析 → 生成草案 JSON → 展示摘要并确认 → `tt import --dry-run` → `tt import --commit` → 汇报结果与未确定项。

草案 JSON 与铁律：金额一律整数分并按币种分开；时间保留 IANA 时区；只有日期没有时间时用 `timeMode: "date"`，不伪造倒计时；地点必须先用 `tt place search` 取坐标与地址；个人证件默认仅本人可见；写操作先 dry-run、经用户确认再提交；令牌与密码永不回显、不写进任何输出；不凭空确定时间、费用或付款人。

## 6. 分阶段实施

1. ✅ 服务端：`0010` 迁移、设备授权接口、`identity` Bearer 支持、`/device` 页面、撤销入口与测试。
2. ⏳ CLI 骨架：`tt login/whoami/logout`、`trips list`、凭据存储与错误处理。
3. ⏳ 写入类命令与 `import` 草案校验、`--dry-run`。
4. ⏳ `SKILL.md`、references、示例与端到端验收。

## 7. 验收

- 阶段 1 已完成：`tests/device.test.ts` 覆盖允许、拒绝、一次性兑换、过期码、撤销与来源校验；`tests/flows/device.spec.ts` 在 Chromium 与 WebKit 覆盖完整浏览器流程。
- 后续阶段：CLI 全量命令对本地实例端到端跑通；对生产只做读取验证。
- 生产发布前补充一次数据基线比对，发布后确认线上账号与行程数量不变。
