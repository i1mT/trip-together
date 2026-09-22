import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoute, greatCircle } from "../../web/src/lib/route-geometry";
import type { TripEvent } from "../../web/src/lib/models";

type Point = { name: string; latitude: number; longitude: number };

function place(point: Point) {
  return {
    id: point.name,
    name: point.name,
    address: "",
    latitude: point.latitude,
    longitude: point.longitude,
    countryCode: "",
    provider: "geoapify" as const,
  };
}

function event(overrides: Partial<TripEvent>): TripEvent {
  return {
    id: "e0",
    title: "安排",
    subtitle: "",
    kind: "explore",
    start: "2030-06-01T09:00:00+08:00",
    end: "2030-06-01T10:00:00+08:00",
    timezone: "Asia/Shanghai",
    certainty: "confirmed",
    place: "",
    source: "",
    note: "",
    documents: [],
    version: 1,
    ...overrides,
  };
}

const shanghai = place({ name: "上海", latitude: 31.23, longitude: 121.47 });
const tokyo = place({ name: "东京", latitude: 35.68, longitude: 139.69 });

test("按开始时间排序连线，航班使用大圆弧", () => {
  const route = buildRoute([
    event({
      id: "late",
      kind: "explore",
      start: "2030-06-03T09:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: tokyo,
    }),
    event({
      id: "early",
      kind: "flight",
      start: "2030-06-01T09:00:00+08:00",
      timezone: "Asia/Shanghai",
      endTimezone: "Asia/Tokyo",
      location: tokyo,
      departureLocation: shanghai,
    }),
  ]);
  assert.deepEqual(
    route.stops.map((stop) => stop.name),
    ["上海", "东京"],
  );
  assert.equal(route.segments.length, 1);
  assert.equal(route.segments[0].arc, true);
  assert.ok(route.segments[0].coordinates.length > 2);
});

test("非航班段使用两点直线", () => {
  const route = buildRoute([
    event({
      id: "a",
      start: "2030-06-01T09:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: tokyo,
    }),
    event({
      id: "b",
      kind: "explore",
      start: "2030-06-02T09:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: place({ name: "京都", latitude: 35.01, longitude: 135.77 }),
    }),
  ]);
  assert.equal(route.segments.length, 1);
  assert.equal(route.segments[0].arc, false);
  assert.deepEqual(route.segments[0].coordinates, [
    [139.69, 35.68],
    [135.77, 35.01],
  ]);
});

test("缺坐标安排进入 missing，不被静默丢弃", () => {
  const route = buildRoute([
    event({ id: "a", location: shanghai }),
    event({
      id: "no-place",
      title: "待定活动",
      location: null,
      departureLocation: null,
    }),
  ]);
  assert.equal(route.stops.length, 1);
  assert.equal(route.missing.length, 1);
  assert.equal(route.missing[0].eventId, "no-place");
  assert.equal(route.missing[0].title, "待定活动");
});

test("连续相同坐标合并，保留多条安排引用", () => {
  const route = buildRoute([
    event({
      id: "a",
      start: "2030-06-01T09:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: tokyo,
    }),
    event({
      id: "b",
      start: "2030-06-01T12:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: tokyo,
    }),
  ]);
  assert.equal(route.stops.length, 1);
  assert.deepEqual(route.stops[0].eventIds, ["a", "b"]);
  assert.equal(route.segments.length, 0);
});

test("已取消的安排不参与路线", () => {
  const route = buildRoute([
    event({ id: "a", location: shanghai }),
    event({ id: "cancelled", status: "cancelled", location: tokyo }),
  ]);
  assert.equal(route.stops.length, 1);
  assert.equal(route.missing.length, 0);
});

test("往返回到出发地时路线仍按顺序，站点不重复", () => {
  const route = buildRoute([
    event({
      id: "out",
      kind: "flight",
      start: "2030-06-01T09:00:00+08:00",
      timezone: "Asia/Shanghai",
      departureLocation: shanghai,
      location: tokyo,
    }),
    event({
      id: "back",
      kind: "flight",
      start: "2030-06-05T09:00:00+09:00",
      timezone: "Asia/Tokyo",
      departureLocation: tokyo,
      location: shanghai,
    }),
  ]);
  assert.deepEqual(
    route.points.map((point) => point.name),
    ["上海", "东京", "上海"],
  );
  assert.deepEqual(
    route.stops.map((stop) => stop.name),
    ["上海", "东京"],
  );
  assert.equal(route.segments.length, 2);
  assert.equal(route.segments[1].arc, true);
  assert.equal(route.points.at(-1)!.name, "上海");
  assert.deepEqual(route.stops[0].eventIds, ["out", "back"]);
  assert.deepEqual(route.stops[0].dates, ["2030-06-01", "2030-06-05"]);
});

test("连续同一个地点合并为一次停留", () => {
  const route = buildRoute([
    event({
      id: "arrive",
      kind: "flight",
      start: "2030-06-01T09:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: tokyo,
    }),
    event({
      id: "hotel",
      kind: "stay",
      start: "2030-06-01T15:00:00+09:00",
      timezone: "Asia/Tokyo",
      location: tokyo,
    }),
  ]);
  assert.equal(route.points.length, 1);
  assert.equal(route.stops.length, 1);
  assert.equal(route.segments.length, 0);
  assert.deepEqual(route.stops[0].eventIds, ["arrive", "hotel"]);
});

test("大圆插值两端与端点重合", () => {
  const points = greatCircle([121.47, 31.23], [139.69, 35.68], 16);
  assert.equal(points.length, 17);
  assert.ok(Math.abs(points[0][0] - 121.47) < 1e-6);
  assert.ok(Math.abs(points.at(-1)![1] - 35.68) < 1e-6);
});

test("无坐标安排时返回空路线与空边界", () => {
  const route = buildRoute([event({ id: "a", location: null })]);
  assert.deepEqual(route.stops, []);
  assert.deepEqual(route.segments, []);
  assert.equal(route.bounds, null);
  assert.equal(route.missing.length, 1);
});
