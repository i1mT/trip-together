# 部署与维护

## 创建独立资源

通过 Wrangler 登录自己的 Cloudflare 账号，然后新建数据库和私有文件桶：

```bash
npx wrangler login
npx wrangler d1 create trip-together
npx wrangler r2 bucket create trip-together-private
```

不要使用包含其他应用数据的数据库。此版本的 schema 面向空白部署，不会迁移已有固定行程版本。

复制 `infra/wrangler.jsonc` 为 `infra/wrangler.production.jsonc`（已经被 Git 忽略），填写自己的 `account_id`、D1 `database_id`，并根据实际创建资源更新 Worker 名称、数据库名称和 R2 桶名。保留 `migrations_dir: "schema"`。

使用自己的域名设置 `routes`，并加入：

```json
{
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "travel.example.com", "custom_domain": true }]
}
```

将示例域名替换为自己 Cloudflare 账号中的域名。R2 桶必须关闭 r2.dev，且没有任何启用的 R2 Custom Domain。域名连接 Worker，不连接 R2。

## 配置邮箱验证码

在 Cloudflare 控制台进入 Compute → Email Service → Email Sending，使用 Onboard Domain 配置自己的发件域名，并完成服务要求的 DNS 验证。接入步骤见 [Cloudflare Email Sending 官方文档](https://developers.cloudflare.com/email-service/get-started/send-emails/)。

建议为产品使用独立发件子域。配置 Email Sending 时保留现有主域收信记录；检查发件子域的 SPF、DKIM、DMARC 和 `cf-bounce` MX。Worker 发布成功只代表 EMAIL binding 存在，不代表发件域名已经验证，必须完成实际收件测试后才开放注册。

通过 API 管理发件域名时，部署 Token 的 Workers 权限不等于 DNS 或 Email Sending 权限。遇到 `10000 Authentication error` 应检查对应服务权限与资源范围；不要将 Token 写入聊天或日志，也不能通过关闭线上邮箱验证解决发信失败。

Wrangler 4.131.2 提供 `email sending` 管理命令。环境变量 `CLOUDFLARE_API_TOKEN` 会优先于已有 OAuth 登录；如该 Token 缺少邮件权限，先用 `env -u CLOUDFLARE_API_TOKEN npx wrangler whoami` 检查已有 OAuth 账号及其 `email_sending:write` 权限。确认同一账号后可使用：

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler email sending enable travel.example.com
env -u CLOUDFLARE_API_TOKEN npx wrangler email sending settings travel.example.com
env -u CLOUDFLARE_API_TOKEN npx wrangler email sending dns get travel.example.com
```

替换示例为自己的发件域名。启用后等待配置生效，再通过应用验证码接口验证真实投递。`dns get` 返回预期记录，本身不能证明公共 DNS 已经完成传播。

在生产配置中设置：

```json
{
  "vars": {
    "APP_ENV": "production",
    "EMAIL_FROM": "noreply@example.com"
  },
  "send_email": [{
    "name": "EMAIL",
    "allowed_sender_addresses": ["noreply@example.com"]
  }]
}
```

将发件地址替换为已验证域名下的实际地址。不要设置 `destination_address` 或 `allowed_destination_addresses`，注册用户需要接收各自的验证码。Worker 使用原生 `EMAIL.send()`，无需额外的邮件 API Token。详情见 [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)。

登录只验证邮箱与密码。生产环境的注册、重置密码与旧账号绑定邮箱要求一次性验证码。验证码有效期为 10 分钟，同一邮箱和用途的发送间隔为 60 秒，最多尝试 5 次。邮件发送失败会显示错误，不能绕过邮箱验证。

本地运行 `npm run setup`，会在忽略文件 `infra/.dev.vars` 中设置 `APP_ENV=local`。本地 HTTP loopback 或局域网地址跳过验证码，不发送邮件；仍然要求有效邮箱格式与密码。不要将本地端口通过隧道公开，也不要配置 `send_email.remote=true`。生产配置必须使用 `APP_ENV=production`，发布脚本会检查。

从此前的通用账号版本升级时，migration 保留原成员 ID、行程和资料，删除恢复码字段。原 username 账号通过登录页的“旧账号绑定邮箱”输入原账号、原密码和新邮箱；生产环境还需验证新邮箱。完成后使用邮箱登录。旧的固定六人版本不适用这项 migration。

## 设置密钥与发布

生成至少 32 字符的随机密钥，通过 Wrangler 交互输入，避免将密钥写入代码或命令参数：

```bash
npx wrangler secret put SESSION_SIGNING_KEY --config infra/wrangler.production.jsonc
```

部署前设置 `CLOUDFLARE_API_TOKEN` 环境变量。发布脚本用它检查 Worker Secret 和 R2 公开状态，Token 需要对应账号的 Workers Scripts 与 R2 Storage 权限，并具有 Wrangler 发布及 D1 migrations 所需权限。不要提交 Token 或在日志中输出。

```bash
npm run verify
npm run build
npm run deploy
```

部署脚本先检查配置与 R2 私有状态、执行 dry-run，然后应用 D1 schema、发布 Worker，最后再次检查 R2。首次部署成功后由使用者自行注册和创建行程；没有默认管理员和默认密码。

## 日常维护

D1 的 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) 默认启用，恢复窗口依 Workers 套餐为 7 天或 30 天。发布前记录当前 bookmark：

```bash
npx wrangler d1 time-travel info DB --config infra/wrangler.production.jsonc
```

数据库恢复会覆盖当前数据，需要先确定恢复时间与受影响用户。Time Travel 不备份 R2 文件；文件备份必须另行配置并验证恢复，不能仅凭数据库恢复功能声称全量备份已经完成。

生产模板启用 Worker Observability，可通过 Cloudflare 的 Worker Logs 与 Metrics 检查异常和使用量。现有验证码发送、登录及邀请尝试包含频率限制。日志可查询不等于主动告警，主动告警需要单独配置并验证接收渠道。

- 备份 D1 与 R2，存放在私有位置。数据库包含证件信息，不应作为公开问题附件或日志内容。
- 常规发布保留全部用户数据，不运行 seed 或清空数据库。
- 修改 `SESSION_SIGNING_KEY` 会使现有会话失效，用户需要重新登录。
- 用户通过当前密码修改密码，或使用邮箱验证码重置密码。两种方式都会撤销旧会话。
- 行程创建者可以撤销邀请或删除整个行程；删除会清理该行程的文件和业务数据，个人账号和个人证件保留。
- 如上传对象清理遇到网络错误，页面会报告失败，可以重试。生产环境应通过 Cloudflare 使用量与日志监控上传存储量和错误率。
- 回滚代码前确认数据库 schema 兼容，不直接将此版本部署到旧固定行程应用的资源。

## 开源仓库

当前分支可能继承含有私人资料的历史。应使用 `npm run export:source` 导出当前干净快照，解压后创建新仓库；不要直接 push 旧历史到公开仓库。

升级至 0004 migration 后移除待核对预订表与支出关联字段；已记录支出、金额和成员保持不变，原凭证关联保留为 source_document_id。升级后不再提供待核对预订接口或登录验证码发送接口。

## 地点搜索

安排通过服务端调用 [Geoapify Geocoding](https://apidocs.geoapify.com/docs/geocoding/)，前端仅请求本站 `/api/places`，不依赖用户浏览器访问 Google。搜索需要登录，限制每个账号 15 分钟 120 次，8 秒超时，不使用 IP 推测位置。没有 Key 时搜索显示暂不可用，其余安排录入仍可使用。

先按照完整文字搜索；没有匹配结果时，再使用同样关键词按城市名称查询。最多两次上游调用，共用 8 秒超时；已有匹配时不增加调用，服务错误仍然显示失败。结果最多 6 个，不默认限制国家或根据 IP 排序。

在 Geoapify 创建项目后，本地将 `GEOAPIFY_API_KEY` 设置到忽略文件 `infra/.dev.vars`，重启预览；生产环境通过 `npx wrangler secret put GEOAPIFY_API_KEY --config infra/wrangler.production.jsonc` 配置，并将该名称加入生产配置 `secrets.required`。不要把值写入 vars、源码或前端。请求仅包含用户主动提交的地点关键词，不发送账号或行程信息。

用户确认候选地点后保存名称、地址、WGS84 经纬度和来源；旧文字地址仍然保留。数据署名显示 Geoapify / OpenStreetMap。不同地区与中文别名的覆盖存在差异，没有精确结果时可尝试城市名及当地名称，或稍后补充。导航使用 Apple Maps 坐标路线链接，旧文字地址使用搜索链接；不将 WGS84 坐标直接当作高德 GCJ-02 坐标使用。
