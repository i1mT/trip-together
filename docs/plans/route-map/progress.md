# 路线图与行程海报进度

## 目标
基于行程安排在 App 内浏览路线图；生成可保存/分享的行程海报图片（发朋友圈等外部渠道）。

## 完成条件
路线图按时间顺序展示有坐标的安排并支持点击查看详情；海报在客户端生成 PNG，不向服务端上传行程数据；本地构建、类型检查、既有测试与新增测试通过；320px 可用；只提交本地。

## 当前基线
通用仓库 trip-together，Web 静态导出 + Worker。行程事件已有 location / departureLocation 结构化坐标（Geoapify 选点写入）。无任何地图库与图片生成依赖。市场公开快照已提供 share 链接（/?share=ID）。

## 阶段进度
| 阶段 | 状态 |
|---|---|
| 01 PRD | in_review |
| 02 路线图视图 | pending |
| 03 行程海报 | pending |

## Todo
- [ ] PRD 审核通过（见 01-prd.md §15 待确认）
- [ ] 路线数据构建与几何计算（含测试）
- [ ] MapLibre v5 + OpenFreeMap 地图视图与详情联动
- [ ] 海报模板与地图截图
- [ ] html-to-image 出图、保存/系统分享
- [ ] 兼容性（iOS 15.5 产物校验）、320px、Chromium/WebKit 流程验证
- [ ] 文档更新并提交

## 核心决策
底图 MapLibre GL JS v5 + OpenFreeMap（硬约束见 AGENTS.md）。海报客户端 DOM 模板 + html-to-image，地图截图取自独立隐藏 MapLibre 实例（preserveDrawingBuffer）。路线 = 按开始时间排序的坐标连线，航班画大圆弧线，其余画直线。底部导航保持五项，路线图入口放完整行程页标题行。

## 风险与处理
OpenFreeMap 无 SLA 且国内访问可能偏慢：样式 URL 集中常量、保留自托管换源能力。坐标覆盖率未知：PRD 审核前先统计真实数据；缺坐标安排在地图页明示，不静默丢弃。

## 实施偏差
- 上一会话在写 PRD 前被推理网关连续报错中断，已接手补完：`01-prd.md` 于本次完成，阶段 01 置为 in_review。
- 坐标覆盖率抽样改为本地预览库执行（生产库不可访问）：7 条安排 5 条有坐标，样本过小，仅确认「必须处理缺坐标」。

## 验证记录
- 2026-09-21 本地预览库 `events.data` 坐标抽样：`location` 5/7 有值、2 条为空；航班另有 `departureLocation`。
- 依赖版本核实：`maplibre-gl` v5 最新 5.24.0（v6 未纳入）、`html-to-image` 1.11.13。
