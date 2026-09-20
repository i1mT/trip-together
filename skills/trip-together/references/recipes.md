# 常用编排

先 `node scripts/tt.mjs whoami` 确认登录状态；没有登录就先 `login` 让用户在浏览器确认。

## 1. 录入一趟完整旅行

```bash
# 1) 找地点，拿到坐标与地址
node scripts/tt.mjs place "东京站"

# 2) 建行程
node scripts/tt.mjs trip new --data '{
  "title": "东京五日",
  "start_date": "2031-03-01",
  "end_date": "2031-03-05",
  "timezone": "Asia/Tokyo",
  "home_timezone": "Asia/Shanghai",
  "currency": "JPY",
  "home_currency": "CNY",
  "destinations": [{"name":"东京 · 日本","timezone":"Asia/Tokyo","currency":"JPY"}]
}'

# 3) 记下返回的行程编号
node scripts/tt.mjs trip use <行程编号>
node scripts/tt.mjs trip list

# 4) 逐条写安排
node scripts/tt.mjs event add --data '{ …见 references/model.md… }'
node scripts/tt.mjs data | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).events.length))'
```

先写跨时区航班，再写住宿与活动。每写完一类，用 `event list` 复核数量与顺序。

## 2. 上传资料并关联到安排

```bash
node scripts/tt.mjs doc upload ./CA929.pdf --category 机票     # → {"id":"…"}
node scripts/tt.mjs doc rename <资料编号> "去程机票"
# 取出安排的 version，把资料编号塞进 documents 再更新
node scripts/tt.mjs data
node scripts/tt.mjs event update <安排编号> --data '{
  "title": "到达东京", "kind": "flight",
  "start": "2031-03-01T09:00:00+08:00", "end": "2031-03-01T13:00:00+09:00",
  "timezone": "Asia/Shanghai", "endTimezone": "Asia/Tokyo",
  "certainty": "confirmed", "documents": ["<资料编号>"]
}'
```

`event update` 会保留没写到的字段吗？不会：更新是整体替换，所以先把 `tt data` 里那条安排的内容取出来，改 `documents` 后再整体提交。

## 3. 记账并附凭证

```bash
node scripts/tt.mjs data                     # 取成员 id
node scripts/tt.mjs expense receipt ./taxi.jpg   # → {"receiptId":"…"}
node scripts/tt.mjs expense add --data '{
  "title": "机场快线", "amount": 3000, "currency": "JPY",
  "payerId": "<成员 id>", "date": "2031-03-01",
  "participants": ["<成员 id>"], "receiptIds": ["<receiptId>"]
}'
```

金额是整数分；付款人不确定时先问用户，不要默认填某个人。修改已有支出要带 `version`。

## 4. 准备事项

```bash
node scripts/tt.mjs prep add --data '{"group_name":"证件","title":"护照有效期确认"}'
node scripts/tt.mjs prep list
node scripts/tt.mjs prep check <编号>        # 勾选；--off 取消
```

## 5. 从公开攻略起步

```bash
node scripts/tt.mjs market list 东京
node scripts/tt.mjs market show <公开行程编号>
node scripts/tt.mjs market copy <公开行程编号>   # → 自己的新行程
node scripts/tt.mjs trip use <新行程编号>
```

复制得到的是一份独立行程：不加入原作者的行程，也不会随对方更新。

## 6. 汇报模板

写完以后向用户汇报：行程编号与网页链接、写入的安排数量、每项资料与支出的归属，以及所有“时间待定”“金额未确认”“付款人待确认”的遗留项。不要在汇报里回显令牌。

## 7. 常见问题

- **`401`**：令牌被撤销或站点换了 → 重新 `login`。
- **`409`**：别人刚改过同一条数据 → `tt data` 重新取 `version` 再提交。
- **`429`**：请求太密集 → 等一会儿，不要循环重试。
- **地点搜索失败**：站点没有配置地点服务时，请用户自己确认地址，不要编造坐标。
- **多站点**：`--base` 或 `TT_BASE` 切换站点，凭据按站点分别保存。
