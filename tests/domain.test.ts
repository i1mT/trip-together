import { test } from "node:test";
import assert from "node:assert/strict";
import { selectEvents, countdown } from "../web/src/lib/time";
import { splitAmount } from "../web/src/lib/money";
import { zonedInstant, localInput } from "../web/src/lib/zoned-input";
import { eventInput } from "./support/api";
import type { TripEvent } from "../web/src/lib/models";
test("日期由真实安排决定，空行程不会误报结束", () => {
  assert.equal(selectEvents([], Date.now()).finished, false);
  const e = { ...eventInput, id: "event", version: 1 } as TripEvent;
  assert.equal(selectEvents([e], Date.parse(e.start)).current?.id, e.id);
  assert.equal(selectEvents([e], Date.parse(e.end)).finished, true);
  assert.equal(countdown(e.start, Date.parse(e.start) - 1000), "00:00:01");
});
test("分摊整数分守恒，支持超过六人", () => {
  for (let n = 1; n < 30; n++) {
    const values = Object.values(
      splitAmount(
        10001,
        Array.from({ length: n }, (_, i) => String(i)),
      ),
    );
    assert.equal(
      values.reduce((a, b) => a + b, 0),
      10001,
    );
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
  }
});
test("跨时区输入和夏令时缺失、重复时刻", () => {
  assert.equal(
    zonedInstant("2030-06-01T09:00", "Asia/Shanghai"),
    "2030-06-01T01:00:00.000Z",
  );
  assert.equal(
    localInput("2030-06-01T01:00:00Z", "Asia/Shanghai"),
    "2030-06-01T09:00",
  );
  assert.throws(
    () => zonedInstant("2030-03-10T02:30", "America/New_York"),
    /不存在/,
  );
  assert.throws(
    () => zonedInstant("2030-11-03T01:30", "America/New_York"),
    /两次/,
  );
  assert.equal(
    zonedInstant("2030-11-03T01:30", "America/New_York", "-05:00"),
    "2030-11-03T06:30:00.000Z",
  );
});
test("日期安排不产生虚假倒计时或提前结束，未知结束时间保留当天安排", () => {
  const dated = {
    ...eventInput,
    id: "date",
    version: 1,
    kind: "explore",
    timeMode: "date",
    start: "2030-06-01T00:00:00+08:00",
    end: "2030-06-02T00:00:00+08:00",
  } as TripEvent;
  const noon = Date.parse("2030-06-01T12:00:00+08:00");
  assert.equal(selectEvents([dated], noon).current, undefined);
  assert.equal(selectEvents([dated], noon).featured?.id, "date");
  assert.equal(selectEvents([dated], noon).finished, false);
  assert.equal(selectEvents([dated], Date.parse(dated.end)).finished, true);
  const partial = {
    ...dated,
    timeMode: "timed",
    endUnspecified: true,
    end: "2030-06-01T00:00:00.001+08:00",
  } as TripEvent;
  assert.equal(selectEvents([partial], noon).featured?.id, "date");
  assert.equal(selectEvents([partial], noon).current, undefined);
});

test("安排时间支持分钟、单点、跨日跨区时间段及待定日期", async () => {
  const { resolveTiming } =
    await import("../web/src/components/editors/event/timing");
  const base = {
    date: "2030-06-01",
    endDate: "2030-06-02",
    startTime: "23:47",
    endTime: "03:12",
    timezone: "Asia/Shanghai",
    endTimezone: "Asia/Tokyo",
    timeMode: "timed" as const,
    range: false,
    firstChoice: "",
    lastChoice: "",
  };
  const single = resolveTiming(base, "explore");
  assert.equal(single.start, "2030-06-01T15:47:00.000Z");
  assert.equal(single.endUnspecified, true);
  assert.equal(single.endTimezone, "Asia/Shanghai");
  assert.equal(single.dateEnd, "2030-06-01");
  const range = resolveTiming({ ...base, range: true }, "flight");
  assert.equal(range.end, "2030-06-01T18:12:00.000Z");
  assert.equal(range.endUnspecified, false);
  assert.throws(
    () => resolveTiming({ ...base, range: true, endTime: "" }, "flight"),
    /结束时间/,
  );
  assert.throws(
    () => resolveTiming({ ...base, range: true, endDate: base.date }, "flight"),
    /晚于/,
  );
  const dated = resolveTiming(
    { ...base, startTime: "", endTime: "", timeMode: "date", range: true },
    "stay",
  );
  assert.equal(dated.end, "2030-06-01T15:00:00.000Z");
});
test("地点坐标验证与导航保持 WGS84 坐标顺序", async () => {
  const { placeSchema, mapLink } = await import("../shared/places");
  const p = {
    id: "test",
    name: "测试地点",
    address: "Paris",
    latitude: 48.85,
    longitude: 2.29,
    provider: "geoapify",
  };
  assert.equal(placeSchema.safeParse({ ...p, latitude: 91 }).success, false);
  assert.equal(
    new URL(mapLink(placeSchema.parse(p))).searchParams.get("daddr"),
    "48.85,2.29",
  );
});
