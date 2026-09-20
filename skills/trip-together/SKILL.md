---
name: trip-together
description: 用命令行把旅行信息录入 Trip Together：创建行程、录入安排与准备事项、上传旅行资料与证件、记录支出、发布或复制公开攻略。当用户说要录入行程、整理机酒订单、导入行程表、记账或找参考攻略，并使用 Trip Together 站点时使用。
---

# Trip Together 旅行助手

`tt` 是 Trip Together Worker API 的命令行客户端，能力与网页端一致：网页能手动做的事，都能在这里做。所有写入都经过服务端校验与成员权限检查。

## 1. 环境

- 需要 Node 18 或更高版本，不需要安装任何依赖。
- 在本目录执行 `node scripts/tt.mjs <命令>`；`chmod +x scripts/tt.mjs` 之后也可以直接 `./scripts/tt.mjs`。
- 默认站点是 `https://trip.awell.one`。自建站点用 `--base https://你的域名` 或环境变量 `TT_BASE` 指定，每个站点各自保存一份登录状态。

## 2. 首次登录：让用户在浏览器里确认一次

```bash
node scripts/tt.mjs login
```

会打印一个 8 位授权码并打开浏览器：让用户登录站点、核对授权码、点“允许访问”。完成后令牌自动保存到 `~/.config/trip-together/credentials.json`（权限 600），有效期 180 天且自动续期，用户不需要复制粘贴任何东西。

- 浏览器没有自动打开时，把打印出来的链接发给用户，让他自己打开。
- 用户拒绝或超时都不会留下凭据，重新运行 `login` 即可。
- `node scripts/tt.mjs whoami` 查看当前账号；`node scripts/tt.mjs logout` 撤销本机令牌（不影响网页登录）。

## 3. 命令

| 命令 | 作用 |
| --- | --- |
| `whoami` | 当前账号与行程列表 |
| `trip list` / `trip show [编号]` / `trip use <编号>` | 列出、查看、切换当前行程 |
| `trip new --data '{…}'` / `trip update [编号] --data '{…}'` | 创建、修改行程 |
| `trip rm <编号> --confirm "<行程名称>"` | 删除行程（不可恢复） |
| `trip join <6 位口令>` | 用同行口令加入行程 |
| `data` | 当前行程的全部数据：安排、资料、账本、准备事项、成员 |
| `event list` / `event add --data '{…}'` / `event update <编号> --data '{…}'` | 查看、新增、修改安排 |
| `event status <编号> <planned\|completed\|cancelled>` | 标记已结束、已取消或恢复 |
| `event rm <编号> --yes` | 删除安排 |
| `prep list` / `prep add --data '{…}'` / `prep check <编号> [--off]` / `prep rm <编号> --yes` | 准备事项与勾选 |
| `doc list` / `doc upload <文件> [--category 分类] [--private]` | 旅行资料：列表与上传 |
| `doc rename <编号> <新名称>` / `doc rm <编号> --yes` / `doc download <编号> <路径>` | 资料改名、删除、下载 |
| `me doc list` / `me doc upload <文件>` / `me doc rm <编号> --yes` | 仅本人可见的个人证件 |
| `expense list` / `expense add --data '{…}'` / `expense rm <编号> --yes` | 账本 |
| `expense receipt <文件>` | 先上传凭证，再把返回的 receiptId 放进支出的 receiptIds |
| `place <地点名称>` | 服务端代理的地点搜索，返回坐标与地址 |
| `market list [关键词]` / `market show <编号>` / `market copy <编号>` | 旅行攻略市场：检索、预览、复制成自己的行程 |
| `raw <METHOD> <路径> [--data '{…}']` | 兜底调用任意已鉴权接口 |

约定：

- `--data` 接收 JSON，可写成 `--data '{…}'`、`--data @file.json` 或从标准输入 `--data -`。
- 标准输出只有一行 JSON 结果，进度与提示走标准错误，可以直接接管道。加 `--pretty` 输出缩进 JSON。
- `--trip <编号>` 临时指定行程，默认使用最近一次 `trip use` 或唯一的行程。

## 4. 工作流

1. **收集**：让用户把机票、订单、截图或行程草稿发过来，不要自己编造时间、金额或付款人。
2. **草案**：整理成 JSON（字段见 `references/model.md`，示例见 `examples/trip-draft.json`），地点先用 `place` 搜索取到坐标。
3. **确认**：把要写入的内容用简洁的中文列给用户，明确标出“时间待定”“金额未确认”的项，等用户确认。
4. **写入**：先建行程（`trip new`），再写安排、准备事项、资料与支出。
5. **汇报**：列出创建了什么、哪些字段还缺，给出行程编号与网页链接。

## 5. 铁律

- 金额一律用整数分（`amount: 3000` 表示 30.00），不同币种分开记录；付款人必须来自 `data` 里的成员，不确定就先问用户，禁止默认成某个人。
- 时间必须带时区偏移（如 `2031-03-01T09:00:00+08:00`），跨时区安排保留出发与到达当地时间。
- 只知道日期不知道时间时，用 `timeMode: "date"` 并让 `start`/`end` 落在当天，不要编造具体时刻。
- 地点必须来自 `place` 的搜索结果（保存 name/address/latitude/longitude），不要自己写地址。
- 个人证件（`me doc`）默认仅本人可见；共享资料上传前说明可见范围。
- 删除类命令都要先向用户确认，再加 `--yes`；`trip rm` 还需要 `--confirm "<行程名称>"`。
- 不要回显令牌，也不要把令牌写进任何文件、日志或聊天内容。
- 发布的公开攻略会公开行程名称、日期、路线、安排与作者昵称；账本、成员、资料、证件、电话和预订编号不会被公开。

## 6. 参考资料

- `references/model.md`：字段模型与各接口的 JSON 结构。
- `references/api.md`：接口路径、方法、权限与错误码。
- `references/recipes.md`：常见编排（整趟旅行录入、资料关联、记账、公开发布）。
- `examples/trip-draft.json`：可复制的草案模板。
