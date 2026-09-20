# 数据模型

所有金额都是整数分；所有时间都是带偏移的 ISO 8601 字符串；日期是 `YYYY-MM-DD`；时区是 IANA 名称（如 `Asia/Tokyo`）。

## 行程 `trip`

```json
{
  "title": "东京五日",
  "start_date": "2031-03-01",
  "end_date": "2031-03-05",
  "timezone": "Asia/Tokyo",
  "home_timezone": "Asia/Shanghai",
  "currency": "JPY",
  "home_currency": "CNY",
  "destinations": [
    { "name": "东京 · 日本", "timezone": "Asia/Tokyo", "currency": "JPY" }
  ]
}
```

- `timezone` / `currency`：行程目的地的当地时区与币种；`home_*` 是常住地。
- `destinations` 最多 20 个，第一项会作为默认时区与币种来源。
- 修改行程时若不带 `version`，CLI 会自动读取最新版本；并发冲突会返回 409。
- 币种使用 ISO 代码（`CNY`、`JPY`、`EUR`、`NZD`…），服务端只接受受支持的币种。

## 安排 `event`

```json
{
  "title": "到达东京",
  "subtitle": "CA929",
  "kind": "flight",
  "timeMode": "timed",
  "timeRange": true,
  "start": "2031-03-01T09:00:00+08:00",
  "end": "2031-03-01T13:00:00+09:00",
  "timezone": "Asia/Shanghai",
  "endTimezone": "Asia/Tokyo",
  "certainty": "confirmed",
  "place": "成田国际机场",
  "address": "日本千叶县成田市",
  "location": {
    "id": "geoapify:xxx",
    "name": "成田国际机场",
    "address": "日本千叶县成田市",
    "latitude": 35.772,
    "longitude": 140.3929,
    "countryCode": "jp",
    "provider": "geoapify"
  },
  "from": "上海浦东",
  "to": "东京成田",
  "code": "CA929",
  "phone": "",
  "source": "携程订单 1234",
  "note": "提前 3 小时到机场",
  "documents": ["已上传资料的 uuid"]
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 最多 150 字 |
| `kind` | 是 | `flight` 航班、`drive` 自驾、`stay` 住宿、`explore` 活动、`transfer` 交通 |
| `start` / `end` | 是 | 带偏移的 ISO 时间，`end` 必须晚于 `start` |
| `timezone` / `endTimezone` | 是 / 跨时区时 | 出发与到达的当地时区 |
| `certainty` | 是 | `confirmed` 已确认、`suggested` 建议 |
| `timeMode` | 否 | `timed`（默认）或 `date`（只确定日期） |
| `endUnspecified` | 否 | 结束时间待定时为 `true` |
| `subtitle` / `place` / `address` / `note` / `source` | 否 | 自由文本，`note` 最多 3000 字 |
| `location` | 否 | 地点搜索结果对象，来自 `tt place` |
| `documents` | 否 | 关联的旅行资料 uuid，最多 30 个 |

住宿用 `kind: "stay"`，`start` 是入住时间、`end` 是退房时间，`place` 写住宿名称。

## 准备事项 `preparation`

```json
{ "group_name": "证件", "title": "护照有效期确认", "note": "" }
```

勾选状态按成员保存：`tt prep check <编号>` 勾选，加 `--off` 取消。

## 旅行资料 `document`

上传后返回 `{ "id": "…" }`，在行程数据里表现为：

```json
{ "id": "…", "name": "去程机票", "category": "机票", "owner_id": null, "mime": "application/pdf", "size": 123456 }
```

- `category` 由上传时的查询参数决定，默认「行程」；已有自定义分类可以直接复用。
- `--private` 上传的资料只有上传者本人可见，其他成员看不到，也不能关联到安排。
- 支持 PNG、JPEG、WebP、PDF，单个文件不超过 10 MB。
- 把资料关联到安排：把它的 `id` 放进安排的 `documents` 数组后再次 `event update`。

## 支出 `expense`

```json
{
  "title": "机场快线",
  "amount": 3000,
  "currency": "JPY",
  "payerId": "成员 uuid",
  "date": "2031-03-01",
  "participants": ["成员 uuid", "…"],
  "note": "",
  "receiptIds": ["凭证 uuid"]
}
```

- `amount` 是整数分且必须大于 0；不同币种分别统计。
- `payerId` 必须是当前行程成员；省略 `participants` 时默认全员分摊，但 `payerId` 不允许省略。
- `date` 是支出发生日期（`YYYY-MM-DD`）。
- 修改已有支出时带上它的 `version`，并保持原币种，除非用户明确要换。

## 成员 `member`

`tt data` 返回的 `members` 里每项包含 `id`、`name`、`english_name`、`default_avatar`、`has_avatar`。写支出、分摊时使用这些 `id`；不要让用户手动输入 uuid，用姓名或昵称对应过去。

## 个人证件

仅本人可见，接口与前缀独立的编号：

```bash
node scripts/tt.mjs me doc upload ./护照.jpg
node scripts/tt.mjs me doc list
node scripts/tt.mjs me doc rm personal-xxxx --yes
```

## 公开攻略

`tt market copy <编号>` 会复制成一份独立行程（不加入源行程、不会随源行程更新），复制后记得 `tt trip use <新行程编号>` 再继续录入。
