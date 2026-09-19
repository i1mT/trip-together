# OpenPanel 产品统计进度

状态：in_progress

## 目标

以 OpenPanel 采集匿名业务行为，提供历史总量与新增趋势的产品指标；根据平台支持的能力配置私有看板。

## 完成条件

事件采集、数据库总量、重试与停用验证通过；真实平台接收通过；生产开启和私有看板完成后交付链接。不得把方案文件描述成已创建的平台看板。

## 当前基线

通用仓库 trip-together。上一版 Umami 集成已提交但未发布。用户因额度问题改为 OpenPanel；本次仅更换适配层，不更改业务表或统计口径。0006 迁移已用于本地预览，尚未应用生产。

## 阶段进度

| 阶段 | 状态 | 门禁 |
|---|---|---|
| 01 指标 | completed | 总量与新增、活动类型、多人与活跃口径清楚 |
| 02 采集与发送 | completed | OpenPanel 协议、数据最小化、重试与本地停用验证 |
| 03 看板 | in_progress | 官方创建接口缺失，尚未建立平台看板；生产尚未启用 |

## Todo

- [x] 指标和业务成功事件设计
- [x] 凭据保存至被 Git 忽略的本地文件，权限 600
- [x] 从 Umami 切换至 OpenPanel /track 与客户端凭据
- [x] HMAC profileId/deviceId、原始事件时间、固定页面路径
- [x] 真实 integration_check 接口返回 200 和 sessionId
- [x] 看板方案、配置脚本与文档更新
- [x] 类型检查和 4 项统计测试通过
- [x] 发布生产配置、Secret 与增量迁移
- [x] 核验首次生产定时发送（修复后成功）
- [ ] 在 OpenPanel 创建私有看板并读回验证

## 核心决策

- 总量从 D1 查询，历史账号不会伪装成今天注册；OpenPanel 访问人数不等于注册账号数。
- 生产采集只需要 write 客户端；不为了查询看板给采集服务 root 权限。
- 不把累计总量作为事件次数求和；通过受保护 summary 查看总量。
- 官方当前只提供看板列表和报告查询，没有创建接口；撤除 Umami 自动创建及 TextBlock 同步代码，不猜测平台内部 API。

## 风险与处理

- 真实采集接口确认成功，管理接口返回 401。尚未从 Events/报表读回；读取需要 read/root 客户端和 projectId。
- 至少一次投递，响应丢失可能重复，保留 delivery_id；精确业务总量使用 D1。
- 不转发真实 IP / UA，服务端地域、设备和会话数据不能解释真实用户来源。
- 本地文件不会自动部署；仍需生产 Secret、配置和增量迁移。

## 实施偏差

- 用户切换平台后，原来的 Umami 看板创建 API 不再适用。已提供 OpenPanel 报告方案，实际看板创建受平台 API 能力限制；没有声称完成。
- 本次没有发布生产或推送 GitHub，不更改现有生产数据。

## 验证记录

2026-09-18：凭据文件被 Git 忽略，权限 600；Track API HTTP 200 且返回 deviceId/sessionId；Manage API HTTP 401。只发送一条 source=integration_test 的 integration_check，不包含真实用户信息。
类型检查、4 项统计测试通过，覆盖失败重试、并发租约、匿名标识、时间与请求格式、本地停用、历史总量和事件去重。完整 npm run verify 通过：生产构建、25 项测试、Chromium 和 WebKit 各 11 项流程测试；源码审计、凭据泄漏扫描与 git diff --check 通过。单独执行 npm test 时曾因未启动 8791 测试服务失败，使用项目 verify 脚本启动隔离环境后全部通过。

## 业务节点全量统计任务

- [x] 从注册、验证、行程、安排、资料、记账成功事件附加全量统计
- [x] 后台采样、持久保存与重试一致性，不修改认证流程
- [x] 验证历史数据、并发、失败隔离与前端白名单
- [x] 更新指标说明、执行测试并提交

验证结果：类型检查、生产构建、28 项业务与统计测试、Chromium / WebKit 各 11 项流程测试全部通过；源码审计与 git diff --check 通过。没有修改注册、验证码、会话代码和业务数据库 schema。新增全量只在后台采样、持久保存并发送；生产尚未部署。

## 生产发布与 GitHub 同步

- [x] 核实通用版独立 D1 / 私有 R2，保存本地数据库备份
- [x] 配置 OpenPanel write Secret、独立匿名密钥和统计读取令牌
- [x] 应用 0006 增量迁移并发布生产，启用每 5 分钟 Cron
- [x] 首页、认证配置、埋点启用检查通过；统计无令牌 403、业务未登录 401
- [x] 发布前后历史业务数量一致；本地埋点仍关闭
- [x] 首次 Cron 的 integration_check 探针确认成功
- [x] 提交发布记录，随通用版同步 GitHub main

上述“未部署”描述属于实施阶段记录；截至本节，生产已经发布。探针只写入分析队列，使用匿名测试身份，不创建账号或修改旅行数据。私密配置与备份保持在 Git 忽略目录。

生产发布代码：314159b；线上版本已核实。Cron 已配置，发布后首次检查探针尚未执行（attempts=0），不将此描述为投递成功；后续可通过分析队列 delivered_at / last_status 核验。看板创建及从 OpenPanel 报表读回仍未完成。

## 生产发送故障排查

- [x] 确认登录事件写入，历史队列尚未发送且 HTTP 状态为 0
- [x] 增加无凭据、无个人信息的发送阶段与异常类型日志
- [x] 确认根因并修复生产发送
- [x] 核验历史队列发送成功并同步 GitHub

Production verification: 2026-09-18 07:00 UTC cron successfully drained pending events (failed=0). D1 confirmed HTTP 200 and delivered_at for login, page, activity and integration-check events. Previous pending-delivery notes are historical; dashboard configuration and report read-back remain pending.

Root cause: workerd Request rejects redirect:error before any outbound request. Use manual and reject non-2xx without forwarding credentials. Added actual workerd request construction and 302 rejection tests plus safe error-stage logs. Full verification passed: typecheck, build, 30 tests, 11 Chromium and 11 WebKit flows. No authentication or travel business data changed.
