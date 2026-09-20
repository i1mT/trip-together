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

test("中文 POI 搜索并行合并高德与 Geoapify；city 模式与外文直接走 Geoapify", async () => {
  const { findPlaces } = await import("../worker/places/provider");
  const amapPoi = {
    id: "B0K6ASO8ZD",
    name: "Yoho·羊玉小院(潮州古城牌坊街店)",
    address: "太平路牌坊街羊玉巷9号",
    location: "116.649335,23.665522",
    pname: "广东省",
    cityname: "潮州市",
    adcode: "445102",
  };
  const geoapifyPlace = {
    place_id: "test-geo",
    name: "Tokyo Tower",
    formatted: "Tokyo Tower, Tokyo, Japan",
    lat: 35.6586,
    lon: 139.7454,
    country_code: "jp",
  };
  const hosts: Record<string, unknown> = {
    "restapi.amap.com": { status: "1", pois: [amapPoi] },
    "api.geoapify.com": { results: [geoapifyPlace] },
  };
  const mock = (url: URL) => Response.json(hosts[url.hostname] ?? {});
  // 中文 POI 查询：两路并行合并，高德在前；坐标从 GCJ-02 转回 WGS84。
  const hit = await findPlaces(
    "潮州市yoho羊玉小院",
    "test-key",
    mock,
    "amap-key",
  );
  assert.equal(hit[0].provider, "amap");
  assert.equal(hit[0].name, amapPoi.name);
  assert.equal(hit[0].address, "广东省潮州市太平路牌坊街羊玉巷9号");
  assert.equal(hit[0].countryCode, "cn");
  assert.ok(hit[0].longitude < 116.649335, "GCJ-02 应转回 WGS84");
  assert.equal(hit.length, 2);
  assert.equal(hit[1].provider, "geoapify");
  // 高德故障不影响 Geoapify 结果；仅当两路都失败时才抛错。
  const fallbackOn = await findPlaces(
    "西湖",
    "test-key",
    (url) =>
      url.hostname === "restapi.amap.com"
        ? Response.json({ status: "0", info: "DAILY_QUERY_OVER_LIMIT" })
        : Response.json({ results: [geoapifyPlace] }),
    "amap-key",
  );
  assert.equal(fallbackOn[0].provider, "geoapify");
  await assert.rejects(() =>
    findPlaces(
      "西湖",
      "test-key",
      () => new Response(null, { status: 503 }),
      "amap-key",
    ),
  );
  // city 模式（目的地选择）：不调用高德，保持 Geoapify 城市查询行为。
  let amapCalls = 0;
  const cityMode = await findPlaces(
    "东京",
    "test-key",
    (url) => {
      if (url.hostname === "restapi.amap.com") amapCalls++;
      return Response.json({ results: [geoapifyPlace] });
    },
    "amap-key",
    "city",
  );
  assert.equal(amapCalls, 0);
  assert.equal(cityMode[0].provider, "geoapify");
  // 纯外文：不调用高德。
  amapCalls = 0;
  await findPlaces(
    "Tokyo Tower",
    "test-key",
    (url) => {
      if (url.hostname === "restapi.amap.com") amapCalls++;
      return Response.json({ results: [geoapifyPlace] });
    },
    "amap-key",
  );
  assert.equal(amapCalls, 0);
  // 无高德 key：中文关键词也走 Geoapify。
  const noKey = await findPlaces("杭州", "test-key", () =>
    Response.json({ results: [] }),
  );
  assert.equal(noKey.length, 0);
});

test("GCJ-02 转 WGS84：境内收敛在米级内，出境坐标原样返回", async () => {
  const { gcj02ToWgs84, delta } = await import("../worker/places/coord");
  const cases = [
    { lon: 116.649335, lat: 23.665522 }, // 潮州
    { lon: 120.15507, lat: 30.274085 }, // 杭州
    { lon: 116.397428, lat: 39.90923 }, // 北京
    { lon: 113.264385, lat: 23.129112 }, // 广州
  ];
  for (const { lon, lat } of cases) {
    const wgs = gcj02ToWgs84(lon, lat);
    assert.ok(
      Math.abs(wgs.lon - lon) < 0.01,
      "偏移应在 0.01 度（约 1 公里）内",
    );
    assert.ok(Math.abs(wgs.lat - lat) < 0.01);
    // 往返收敛：对逆变换结果再做一次正向偏移应回到原 GCJ-02 点（亚米级）。
    const d = delta(wgs.lon, wgs.lat);
    assert.ok(Math.abs(wgs.lon + d.dLon - lon) < 0.00002);
    assert.ok(Math.abs(wgs.lat + d.dLat - lat) < 0.00002);
  }
  // 出境坐标不偏移。
  assert.deepEqual(gcj02ToWgs84(139.7454, 35.6586), {
    lon: 139.7454,
    lat: 35.6586,
  });
  assert.deepEqual(gcj02ToWgs84(2.2945, 48.8583), {
    lon: 2.2945,
    lat: 48.8583,
  });
});
