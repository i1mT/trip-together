import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, tripInput, eventInput } from "./support/api";
import { currencies } from "../shared/travel-options";
import { money, splitAmount } from "../web/src/lib/money";
test("多个目的地、日元泰铢持久保存，日期安排与未知结束时间可重新读取", async () => {
  const c = await new Client().register();
  const destinations = [
    { name: "东京", timezone: "Asia/Tokyo", currency: "JPY" },
    { name: "曼谷", timezone: "Asia/Bangkok", currency: "THB" },
  ];
  const { id } = await c.request(
    "/trips",
    "POST",
    { ...tripInput, currency: "JPY", destinations },
    201,
  );
  let data = await c.request(`/trips/${id}/data`);
  assert.deepEqual(data.trip.destinations, destinations);
  assert.equal(data.trip.currency, "JPY");
  for (const currency of currencies) {
    await c.request(`/trips/${id}/expenses`, "POST", {
      id: crypto.randomUUID(),
      title: "测试支出",
      amount: 10001,
      currency,
      payerId: c.id,
      date: "2030-06-01",
      participants: [c.id],
      receiptIds: [],
    });
  }
  await c.request(`/trips/${id}/events`, "POST", {
    ...eventInput,
    kind: "explore",
    timeMode: "date",
    dateEnd: "2030-06-01",
    start: "2030-06-01T00:00:00+08:00",
    end: "2030-06-02T00:00:00+08:00",
  });
  data = await c.request(`/trips/${id}/data`);
  assert.equal(data.events[0].timeMode, "date");
  assert.equal(data.expenses.length, currencies.length);
  assert.deepEqual(
    (await c.request("/bootstrap")).trips[0].destinations,
    destinations,
  );
  const split = Object.values(splitAmount(10000, ["a", "b", "c"]));
  assert.equal(
    split.reduce((a, b) => a + b),
    10000,
  );
  assert.match(money(split[0], "JPY"), /33\.34/);
});

test("地点搜索需要登录；选择的坐标持久保存并校验边界", async () => {
  await new Client().request("/places?q=Paris", "GET", undefined, 401);
  const c = await new Client().register();
  await c.request("/places?q=x", "GET", undefined, 400);
  const { id } = await c.request("/trips", "POST", tripInput, 201);
  const location = {
    id: "test-location",
    name: "测试景点",
    address: "Paris, France",
    latitude: 48.85,
    longitude: 2.29,
    countryCode: "fr",
    provider: "geoapify",
  };
  await c.request(`/trips/${id}/events`, "POST", {
    ...eventInput,
    timeRange: true,
    location,
  });
  const data = await c.request(`/trips/${id}/data`);
  assert.deepEqual(data.events[0].location, location);
  assert.equal(data.events[0].timeRange, true);
  await c.request(
    `/trips/${id}/events`,
    "POST",
    { ...eventInput, location: { ...location, latitude: 99 } },
    400,
  );
});

test("地点无结果时按城市查询；已有匹配和请求失败均不额外查询", async () => {
  const { findPlaces } = await import("../worker/places/provider");
  const city = {
    place_id: "test-city",
    name: "杭州市",
    formatted: "杭州市, 浙江省, 中国",
    lat: 30.25,
    lon: 120.2,
    country_code: "cn",
  };
  const calls: URL[] = [];
  const places = await findPlaces("杭州", "test-key", async (url) => {
    calls.push(url);
    return Response.json({ results: calls.length === 1 ? [] : [city] });
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("text"), "杭州");
  assert.equal(calls[1].searchParams.get("city"), "杭州");
  assert.equal(calls[1].searchParams.get("type"), "city");
  assert.equal(calls[1].searchParams.get("bias"), "countrycode:none");
  assert.equal(places[0].name, "杭州市");
  let count = 0;
  assert.equal(
    (
      await findPlaces("杭州市", "test-key", async () => {
        count++;
        return Response.json({ results: [city, { ...city, lat: 100 }] });
      })
    ).length,
    1,
  );
  assert.equal(count, 1);
  count = 0;
  await assert.rejects(() =>
    findPlaces("杭州", "test-key", async () => {
      count++;
      return new Response(null, { status: 503 });
    }),
  );
  assert.equal(count, 1);
});
