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
- 方向箭头改为「每段一个、放在靠近终点处、方向由该段走向计算」：用点 symbol 图层 + `icon-rotate: ["get","bearing"]`（`icon-rotation-alignment: "map"`），不再依赖 `symbol-placement: "line"`（后者会沿线重复放置且朝向沿线的法线）。
- 交通贴纸按段类型（flight → 飞机，其余 → 车辆）取段中点放置，`icon-size` 随缩放插值并参与碰撞取舍；贴纸图片在运行时从 `web/public/art/travel-stickers.png` 图集裁切注册（`stickers.ts`，坐标与 `base.css` 的 `.travel-sticker` 保持一致）。
- 播放改为「从零开始画」：开场把静态路线/箭头/贴纸/站点全部隐藏，载具（航段飞机、其余车辆）从起点拖着新线逐段画出；走完一段才用 `index` 过滤放出该段箭头与贴纸，站点按首次到达距离逐个点亮；镜头每帧 `jumpTo` 保持载具居中，缩放按当前段起终点 `cameraForBounds`（padding 64）并做逐帧插值；播放中给地图容器加 `pointer-events: none` 锁定交互，结束后恢复完整路线并回到全程取景。
- 海报弹窗通过 `Sheet` 新增的 `headerless` 选项去掉标题栏与内边距（`Dialog.Title` 用 `sr-only` 保留可访问名称），关闭按钮改为海报左上角悬浮；腰封去掉圆角并压缩高度与字号，移除弹窗底部说明文案。
- 海报尺寸改为 9:16（1080×1920）；腰封最后一行左侧显示产品品牌与当前站点域名（运行时取 `window.location.host`，避免硬编码域名），右侧保留极小的 `© OpenStreetMap` 以满足授权要求（用户要求去掉地图来源，这里只保留最小合规署名并已说明）。
- 海报加载态：截图完成前渲染与海报等高的加载占位（转圈 + 文案），不再显示地点文字列表；预览缩放同时受弹窗宽度与可用高度约束，保证整张可见且弹窗不出现内部滚动，加载前后高度不变。
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
- 2026-09-22 更新：箭头改为每段一个并修正方向、海报改为全屏地图 + 无圆角腰封并去掉标题栏/内边距/说明文案后，`npm run typecheck`、50 项单测、`npm run build`（14 个 chunk 通过 iOS 15.5 校验）通过；`route-map.spec.ts` Chromium/WebKit 通过；全量 e2e 18 项全部通过（Geoapify 当时已恢复可达）。截图：`.local/arrows-v2.png`、`.local/poster-v2.png`、`.local/poster-v2-full.png`。
- 2026-09-22 再次更新：播放改为从零逐段画出 + 镜头跟随，海报改为 9:16（1080×1920）并加品牌腰封与等高加载占位后，`typecheck`、50 项单测、`build`、`route-map.spec.ts`（Chromium/WebKit，含 1080×1920 尺寸校验）与全量 e2e 18 项全部通过。截图：`.local/play-start.png`、`.local/play-early.png`、`.local/poster-loading.png`、`.local/poster-fit.png`、`.local/poster-fit-full.png`。
