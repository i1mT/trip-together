---
name: trip-together
description: 用命令行把旅行信息录入 Trip Together：创建行程、录入安排与准备事项、上传旅行资料与证件、记录支出、发布或复制公开攻略。当用户说要录入行程、整理机酒订单、导入行程表、记账或找参考攻略，并使用 Trip Together 站点时使用。
---

# Trip Together 旅行助手

`tt` 是 Trip Together Worker API 的命令行客户端，能力与网页端一致：网页能手动做的事，都能在这里做。所有写入都经过服务端校验与成员权限检查。

## 1. 环境

- 需要 Node 18 或更高版本，不需要安装任何依赖。
- 在本目录执行 `node scripts/tt.mjs <命令>`；`chmod +x scripts/tt.mjs` 之后也可以直接 `./scripts/tt.mjs`。
- 站点是官方站点 `https://trip.awell.one`，登录状态保存在本地凭据文件里。

## 2. 首次登录：一定要帮用户打开浏览器

```bash
node scripts/tt.mjs login
```

会打印一个 8 位授权码并尝试打开浏览器：让用户登录站点、核对授权码、点“允许访问”。完成后令牌自动保存到 `~/.config/trip-together/credentials.json`（权限 600），有效期 180 天且自动续期，用户不需要复制粘贴任何东西。

**关键：一定要让用户在浏览器里打开这个授权链接，否则登录无法完成。**

- 首选：`login` 会自动调用系统浏览器打开授权页，直接让用户在弹出的页面里确认。
- 兜底（浏览器没有自动弹出、或在无图形界面/远程环境里）：把 stderr 里打印出来的**完整授权 URL**（形如 `https://trip.awell.one/device?code=XXXXXXXX`）原样发给用户，明确告诉他“请在浏览器打开这个链接、核对授权码后点允许访问”，等他确认。不要只说“打开浏览器登录”，一定要把完整 URL 给出来。
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
- `--trip <编号>` 临时指定行程，默认使用最近一次 `trip use` 或唯一的行程。所有读取类命令（`data`、`event list`、`doc list` 等）都支持 `--trip`，可以先用它验证写入结果落在正确的行程上。

## 4. 工作流

1. **收集**：让用户把机票、订单、截图、行程草稿以及要归档的材料（订单 PDF、酒店确认单、证件照片、支出凭证等）发过来。用户说是什么就按什么录入。
2. **草案**：整理成 JSON（字段见 `references/model.md`，示例见 `examples/trip-draft.json`）；凡是要落库的地点，都要先用 `place` 搜索拿到坐标与地址再写进 `location`。
3. **确认**：把要写入的内容用简洁的中文列给用户，明确标出“时间待定”“金额未确认”的项，等用户确认。
4. **写入**：先建行程（`trip new`），再写安排、准备事项与支出。
5. **上传并关联材料**：把用户给的材料用 `doc upload`（共享资料）、`me doc upload`（个人证件）或 `expense receipt`（支出凭证）传上去，拿到返回的编号后关联到对应对象——资料编号放进安排的 `documents` 数组再 `event update`，凭证编号放进支出的 `receiptIds`。详见第 7 节和 `references/recipes.md`。
6. **验证**：写完后再调用读取类命令核对结果，不要只凭写入接口的返回就当成功。例如用 `data --trip <编号>`（或 `event list`、`doc list`、`expense list`）取回最新数据，确认安排数量、时间、关联的资料/凭证、支出归属都符合预期；发现不符就修正后重新验证。
7. **汇报**：列出创建了什么、每项资料与支出的归属、哪些字段还缺（“时间待定”“金额未确认”），给出行程编号与网页链接。

## 5. 上传并关联材料

录入行程时，别忘了把用户给的材料一并归档并关联到对应对象，这样安排、支出才能一键看到原始订单和凭证。

- **共享资料（订单、机票、酒店确认单等，全体成员可见）**：`doc upload <文件> [--category 分类]`，返回 `{ "id": … }`，可用 `doc rename <编号> <新名称>` 起个易读的名字。把这个编号放进对应安排的 `documents` 数组，再 `event update` 提交。因为更新是整体替换，先用 `data`/`event list` 取出该安排的完整字段，只改 `documents` 后整体提交。
- **个人证件（护照、签证等，仅本人可见）**：`me doc upload <文件>`。个人证件不能关联到安排，只保存在个人资料里。
- **支出凭证**：`expense receipt <文件>` 返回 `receiptId`，把它放进 `expense add` 的 `receiptIds` 数组。
- 每传完一批，用 `doc list` / `expense list` / `data` 复核编号是否都关联到位（见第 4 节验证步骤）。

具体命令序列见 `references/recipes.md` 的“上传资料并关联到安排”“记账并附凭证”。

## 6. 铁律

- 金额一律用整数分（`amount: 3000` 表示 30.00），不同币种分开记录；付款人的 `payerId` 必须是 `data` 里的成员，服务端会校验。
- 时间必须带时区偏移（如 `2031-03-01T09:00:00+08:00`），跨时区安排保留出发与到达当地时间。
- 只确定日期、没有具体时刻时，用 `timeMode: "date"` 并让 `start`/`end` 落在当天。
- 地点用户怎么说都行，但要落库的地点必须先用 `place` 搜索、把结果对象（name/address/latitude/longitude）写进 `location`——录入的是搜索得到的坐标，不是手写地址。
- 个人证件（`me doc`）默认仅本人可见；共享资料上传前向用户说明可见范围。
- 删除类命令都要先向用户确认，再加 `--yes`；`trip rm` 还需要 `--confirm "<行程名称>"`。
- 不要回显令牌，也不要把令牌写进任何文件、日志或聊天内容。
- 发布的公开攻略会公开行程名称、日期、路线、安排与作者昵称；账本、成员、资料、证件、电话和预订编号不会被公开。

## 7. 参考资料

- `references/model.md`：字段模型与各接口的 JSON 结构。
- `references/api.md`：接口路径、方法、权限与错误码。
- `references/recipes.md`：常见编排（整趟旅行录入、资料关联、记账、公开发布）。
- `examples/trip-draft.json`：可复制的草案模板。
