# 路线图与行程海报

- [进度](progress.md)：状态、决策、验证证据唯一来源。
- [产品需求文档（PRD）](01-prd.md)

每阶段完成后记录测试证据并提交。改变范围前记录原因。中断前记录当前步骤与下一步，恢复时先读取进度。最终检查最初目标，不将计划完成当作功能完成。

## 代码入口

- 路线数据纯函数与单测：`web/src/lib/route-geometry.ts`、`tests/events/route-geometry.test.ts`
- 地图图层复用：`web/src/components/map/route-layer.ts`
- 路线图全屏视图：`web/src/components/map/route-map-sheet.tsx`
- 海报模板与出图：`web/src/components/map/poster-template.tsx`、`poster-sheet.tsx`
- 样式：`web/src/styles/components/route-map.css`
- 底图来源常量与 CSP：`shared/map-source.ts`、`worker/http.ts`

## 硬约束

- 浏览器兼容：必须使用 `maplibre-gl` v5（当前 5.24.0）。v6 预编译产物包含 class static block（Safari 16.4+ 语法），违反项目 `safari >= 15.4` 红线，会被 `scripts/check-browser-support.mjs` 拦截；升级前必须重新验证产物语法。
- 底图使用 OpenFreeMap 公共实例（无 key、无注册），样式 URL 常量集中在 `shared/map-source.ts`，Worker CSP 复用同一来源常量；地图不显示底图署名。
- 海报仅在客户端生成，不上传任何行程数据；内容遵守市场白名单精神：不含成员、账本、资料、电话、预订编号、私人备注。
- 地理编码密钥（Geoapify）不得进入前端；如需服务端能力（如 v2 真实路径）必须经 Worker 代理。
- 海报出图不得用 `fetch(dataURL)`（会被 connect-src 拦截）；下载用 `URL.createObjectURL`。
