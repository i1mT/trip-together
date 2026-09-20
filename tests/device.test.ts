import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, base, tripInput } from "./support/api";

const ip = `${crypto.randomUUID()}`;

async function start() {
  // 命令行助手不带 Origin，设备授权端点必须照常可用。
  const response = await fetch(`${base}/api/device/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify({ label: "测试助手" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.user_code, /^[A-Z2-9]{8}$/);
  assert.match(body.device_code, /^[a-f0-9]{64}$/);
  assert.equal(new URL(body.verification_url).origin, base);
  assert.match(body.verification_url, new RegExp(body.user_code));
  return body;
}
async function poll(device_code: string, expected = 200) {
  const response = await fetch(`${base}/api/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ device_code }),
  });
  assert.equal(response.status, expected);
  return response.json();
}
function bearer(token: string, path: string, method = "GET", body?: unknown) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("设备授权：浏览器允许后助手拿到长期令牌", async () => {
  const owner = await new Client().register(),
    device = await start();
  const lookup = await fetch(
    `${base}/api/device?code=${device.user_code.toLowerCase()}`,
  );
  assert.deepEqual(await lookup.json(), { valid: true, label: "测试助手" });
  assert.equal((await fetch(`${base}/api/device?code=ABCDEFGH`)).status, 200);
  assert.deepEqual(
    await (await fetch(`${base}/api/device?code=ABCDEFGH`)).json(),
    { valid: false, label: "" },
  );
  assert.equal((await poll(device.device_code)).status, "pending");
  const anonymous = await fetch(`${base}/api/device/approve`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ code: device.user_code }),
  });
  assert.equal(anonymous.status, 401);
  await owner.request("/device/approve", "POST", { code: device.user_code });
  const granted = await poll(device.device_code);
  assert.equal(granted.status, "approved");
  assert.equal(granted.member.id, owner.id);
  assert.match(granted.token, /^[a-f0-9]{64}\.[a-f0-9]{64}$/);
  assert.equal((await bearer(granted.token, "/bootstrap")).status, 200);
  const identity = await (await bearer(granted.token, "/bootstrap")).json();
  assert.equal(identity.me.id, owner.id);
  const created = await bearer(granted.token, "/trips", "POST", tripInput);
  assert.equal(created.status, 201);
  const crossSite = await fetch(`${base}/api/trips`, {
    method: "POST",
    headers: {
      Origin: "https://example.invalid",
      Cookie: owner.cookie,
      Authorization: `Bearer ${granted.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tripInput),
  });
  assert.equal(crossSite.status, 403);
  assert.equal(
    (await bearer("0".repeat(64) + "." + "1".repeat(64), "/bootstrap")).status,
    401,
  );
  await poll(device.device_code, 400);
  const tokens = (await owner.request("/api-tokens", "GET")).tokens;
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].label, "测试助手");
  await owner.request(`/api-tokens/${tokens[0].id}`, "DELETE");
  assert.equal((await bearer(granted.token, "/bootstrap")).status, 401);
  assert.equal((await owner.request("/api-tokens", "GET")).tokens.length, 0);
});

test("设备授权：拒绝、过期与一次性兑换", async () => {
  const owner = await new Client().register(),
    denied = await start();
  await owner.request("/device/deny", "POST", { code: denied.user_code });
  const result = await poll(denied.device_code);
  assert.equal(result.status, "denied");
  assert.equal(result.token, undefined);
  await poll(denied.device_code, 400);
  const fresh = await start();
  await owner.request("/device/approve", "POST", { code: "ZZZZZZZZ" }, 400);
  await poll(fresh.device_code);
  await owner.request("/device/approve", "POST", { code: fresh.user_code });
  const granted = await poll(fresh.device_code);
  assert.equal(granted.status, "approved");
  await bearer(granted.token, "/logout", "POST", {});
  assert.equal((await bearer(granted.token, "/bootstrap")).status, 401);
});
