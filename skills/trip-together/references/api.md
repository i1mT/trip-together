# 接口参考

所有请求都打到 `https://<站点>/api`，鉴权用 `Authorization: Bearer <令牌>`（CLI 自动附加）。除了设备授权两个端点外，写请求必须带与站点一致的 `Origin` 头——CLI 已经处理，用 `curl` 手工调试时需要自己加。

## 设备授权

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/device/code` | 申请授权码，返回 `user_code`、`device_code`、`verification_url`、`expires_in`、`interval`；可带 `{ "label": "设备名称" }` |
| GET | `/device?code=XXXXXXXX` | 授权页校验短码，返回 `{ valid, label }` |
| POST | `/device/approve` | 浏览器里登录后确认授权，body `{ "code": "短码" }` |
| POST | `/device/deny` | 拒绝授权 |
| POST | `/device/token` | 轮询兑换：`{ "device_code": "…" }` → `{ status: "pending" }` 或 `{ status: "approved", token, expires_in, member }`；只能兑换一次 |

## 账号

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/bootstrap` | 当前账号、行程列表、未关联行程的个人资料 |
| POST | `/logout` | 撤销当前令牌或会话 |
| PUT | `/profile` | 修改昵称与证件字段（需要 `version`） |
| PUT | `/password` | 修改密码 |
| PUT/DELETE | `/avatar` | 上传或删除头像 |
| GET | `/api-tokens` / `DELETE /api-tokens/:id` | 查看与撤销已授权设备（网页端使用） |

## 行程

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/trips/:id/data` | 行程全量数据：`trip`、`me`、`members`、`events`、`documents`、`expenses`、`packing`、`receipts`、`preparation` |
| POST | `/trips` | 创建行程 |
| PUT | `/trips/:id` | 修改行程（`version` 不匹配返回 409） |
| DELETE | `/trips/:id` | 删除行程，body 必须是 `{ "title": "与行程名称完全一致" }` |
| POST | `/join` | 用 6 位口令加入，body `{ "token": "ABC123" }` |
| GET/POST/DELETE | `/trips/:id/invites` | 查看、生成、撤销同行口令 |
| GET/POST/DELETE | `/trips/:id/share` | 公开发布与撤销 |

## 安排与准备事项

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/trips/:id/events` | 新增安排，返回 `{ id }` |
| PUT | `/trips/:id/events/:eventId` | 修改安排，需要 `version` |
| PATCH | `/trips/:id/events/:eventId` | 只改状态：`{ "status": "completed", "version": n }` |
| DELETE | `/trips/:id/events/:eventId` | 删除安排，body 需要 `{ "version": n }`（CLI 自动获取） |
| POST | `/trips/:id/preparation` | 新增准备事项，返回 `{ id }` |
| DELETE | `/trips/:id/preparation/:itemId` | 删除准备事项 |
| PUT | `/trips/:id/packing` | 勾选：`{ "itemId": "…", "checked": true }` |

## 资料与凭证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PUT | `/trips/:id/documents/:uuid?category=机票&private=1` | 上传资料：body 是文件原始字节，`Content-Type` 为图片或 PDF，`X-File-Name` 是 URL 编码的文件名 |
| PATCH | `/trips/:id/documents/:uuid` | 改名：`{ "name": "新名称", "previousName": "旧名称" }` |
| DELETE | `/trips/:id/documents/:uuid` | 删除资料并解除安排关联 |
| GET | `/files/:uuid` | 读取资料（需要成员权限；个人证件仅本人） |
| PUT/DELETE | `/trips/:id/receipts/:uuid` | 上传或删除支出凭证 |
| PUT/DELETE | `/personal-documents/personal-:uuid` | 上传或删除个人证件 |

上传前先本地生成 uuid 作为资料编号，重复上传同一编号是幂等的。

## 账本

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/trips/:id/expenses` | 新增支出 |
| PUT | `/trips/:id/expenses/:expenseId` | 修改支出，需要 `version` |
| DELETE | `/trips/:id/expenses/:expenseId` | 删除支出，body 需要 `{ "version": n }`（CLI 自动获取） |

## 地点与市场

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/places?q=东京站` | 服务端代理的地点搜索：中文 POI 查询并行用高德与 Geoapify 合并，目的地等城市意图加 `&mode=city` 仅用 Geoapify；密钥不进入客户端 |
| GET | `/market?q=关键词&page=0` | 公开攻略列表（按名称或 8 位口令匹配） |
| GET | `/market/:id` | 公开攻略详情（字段白名单快照） |
| POST | `/market/:id/copy` | 复制成自己的独立行程，返回新行程编号 |

## 错误

- `401` 未登录或令牌过期 → 重新 `tt login`。
- `403` 不是该行程成员，或来源校验失败。
- `409` 版本冲突（行程、安排、支出、资料被他人改动）→ 重新 `tt data` 取最新版本再重试。
- `413` 上传文件过大或请求体过大（文件 10 MB、JSON 12 KB）。
- `429` 触发限速 → 稍后重试。
