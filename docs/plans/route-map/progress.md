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
| 01 PRD | done |
| 02 路线图视图 | done |
| 03 行程海报 | done |

## Todo
- [x] PRD 完成（01-prd.md；§15 待确认项按 PRD 默认执行）
- [x] 路线数据构建与几何计算（含测试）
- [x] MapLibre v5 + OpenFreeMap 地图视图与详情联动
- [x] 海报模板与地图截图
- [x] html-to-image 出图、保存/系统分享
- [x] 兼容性（iOS 15.5 产物校验）、320px、Chromium/WebKit 流程验证
- [x] 文档更新并提交

## 核心决策
底图 MapLibre GL JS v5 + OpenFreeMap（硬约束见 AGENTS.md）。海报客户端 DOM 模板 + html-to-image，地图截图取自独立隐藏 MapLibre 实例（preserveDrawingBuffer）。路线 = 按开始时间排序的坐标连线，航班画大圆弧线，其余画直线。底部导航保持五项，路线图入口放完整行程页标题行；海报入口在路线图标题右侧与「我的行程 → 行程管理 → 分享」区域各一处。

实现补充决策：
- 路线几何区分「行程顺序的点」(`points`，允许重复到达同一地点) 与「去重地点」(`stops`，仅用于地图标记与地点数量)。往返行程回到出发地时，`points` 保留返程段，海报起终点取 `points` 首末，避免终点显示为最后一个新地点、返程段丢失。
- 方向箭头用 `symbol-placement: "line"` 自动沿线段排布；交通贴纸按段类型（flight → 飞机，其余 → 车辆）取段中点放置，`icon-size` 随缩放插值并参与碰撞取舍；贴纸图片在运行时从 `web/public/art/travel-stickers.png` 图集裁切注册（`stickers.ts`，坐标与 `base.css` 的 `.travel-sticker` 保持一致）。箭头图层不加 `minzoom`，因为海报全屏地图的取景缩放可能低于 3。
- 播放为纯前端 rAF 动画：把各段坐标拼成完整轨迹（累计距离 + 每点所属段类型），已走段用高亮 line 图层与移动的贴纸 marker 表现，播放中禁用日期筛选，结束/停止后恢复底图透明度。
- 海报改为全屏地图 + 底部腰封：隐藏地图实例尺寸与海报一致（360×480 @3x），`fitBounds` 预留 `bottom: 222` 避免路线被腰封遮挡。
- 底图来源集中在 `shared/map-source.ts`（`mapTilesOrigin` / `mapStyleUrl`），前端地图与 Worker CSP 共用，方便换源自托管。
- 地图容器 ref 用回调 ref 存 state：Radix `Dialog.Content` 经 Presence 挂载，`useRef` 在同一轮 effect 中可能尚未就绪，回调 ref 触发的地图初始化更稳。
- 海报里的地图截图必须在 `load` 后才 `ensureRouteLayers` + `fitRouteBounds`，再等 `idle` 截图；12s 超时兜底，截图失败降级为无地图版式。
- data URL → Blob 自行解码，不用 `fetch(dataURL)`（会被 connect-src 拦截）；下载用 `URL.createObjectURL`。
- 隐藏地图截图后会置空实例，避免组件卸载时二次 `remove()` 报错。

## 风险与处理
OpenFreeMap 无 SLA 且国内访问可能偏慢：样式 URL 集中常量、保留自托管换源能力。坐标覆盖率：本地预览库 7 条安排 5 条有坐标，缺坐标安排在地图页明示并列出，不静默丢弃。CSP：`img-src` / `connect-src` 增加底图源，新增 `worker-src 'self' blob:'`（MapLibre 需要 blob worker）。

## 实施偏差
- 上一会话在写 PRD 前被推理网关连续报错中断，已接手补完：`01-prd.md` 完成，功能一并实现。
- 坐标覆盖率抽样改为本地预览库执行（生产库不可访问）：7 条安排 5 条有坐标，样本过小，仅确认「必须处理缺坐标」。
- PRD §15 待确认项未逐条回复，按 PRD 默认值实现：海报不展示成员、两个入口都保留、淡紫票券风格。
- 三个既有 e2e（navigation / simple-entry 目的地搜索 / travel）在本机失败，原因是 `api.geoapify.com` 在当前网络不可达（curl 超时、Worker 返回 503），与本次改动无关；其余 e2e 与全部单测通过。

## 验证记录
- 2026-09-21 本地预览库 `events.data` 坐标抽样：`location` 5/7 有值、2 条为空；航班另有 `departureLocation`。
- 依赖版本核实：`maplibre-gl` 5.24.0（产物无 class static block）、`html-to-image` 1.11.13。
- `npm run typecheck` 通过；`npm test` 48 项通过（含新增 7 项路线几何测试）。
- `npm run build` 通过，`scripts/check-browser-support.mjs` 报 13 个 chunk 均可在 iOS 15.5 Safari 解析（含 maplibre 动态 chunk）。
- `tests/flows/route-map.spec.ts` 在 Chromium 与 WebKit 通过：打开路线图、3 个站点标记、缺坐标提示展开、海报生成 1080×1440 PNG（Chromium 读取下载文件 IHDR 校验尺寸）、行程管理入口生成海报。
- 截图：`.local/route-map-{chromium,webkit}.png`、`.local/trip-poster-{chromium,webkit}.png`。
- 全量 e2e：15 通过 / 3 失败（均为 Geoapify 网络不可达导致，见实施偏差）。
