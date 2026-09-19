import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture";
import { deliverEvents } from "../../worker/analytics/delivery";
import { totalFields } from "../../worker/analytics/totals";

test("注册与验证事件携带历史全量；失败重试保留同一快照，新事件更新人数", async () => {
  const f = await fixture(async (db) => {
    await db
      .prepare(
        "INSERT INTO members(id,email,name,password_hash,salt,email_verified_at) VALUES ('old','old@example.test','Old','hash','salt',1)",
      )
      .run();
  });
  const original = globalThis.fetch;
  try {
    await f.member("new", true);
    const sent: Array<{ name: string; properties: Record<string, unknown> }> =
      [];
    globalThis.fetch = async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)).payload);
      return new Response("unavailable", { status: 503 });
    };
    assert.deepEqual(await deliverEvents(f.env), { sent: 0, failed: 2 });
    assert.deepEqual(sent.map((e) => e.name).sort(), [
      "account_registered",
      "email_verified",
    ]);
    for (const event of sent) {
      assert.equal(event.properties.total_users, 2);
      assert.equal(event.properties.total_verified_users, 2);
      assert.equal(event.properties.total_trip_creators, 0);
      assert.ok(event.properties.totals_sampled_at);
      for (const field of totalFields)
        assert.equal(typeof event.properties[`total_${field}`], "number");
    }
    const prior = new Map(
      sent.map((e) => [e.properties.delivery_id, e.properties]),
    );
    await f.member("later");
    await f.DB.prepare("UPDATE analytics_events SET next_attempt_at=0").run();
    sent.length = 0;
    globalThis.fetch = async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)).payload);
      return Response.json({ sessionId: "accepted" });
    };
    await deliverEvents(f.env);
    for (const event of sent) {
      const before = prior.get(event.properties.delivery_id);
      if (before) assert.deepEqual(event.properties, before);
      else assert.equal(event.properties.total_users, 3);
    }
    // The failed provider never rolled back registration or verification.
    assert.equal(
      (await f.DB.prepare(
        "SELECT count(*) n FROM members WHERE email_verified_at IS NOT NULL",
      ).first())!.n,
      2,
    );
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

test("全量查询失败只推迟上报，业务数据保留，下一次发送可以恢复", async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  try {
    await f.member("registered", true);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ sessionId: "ok" });
    };
    const failedDB = new Proxy(f.DB, {
      get(target, prop) {
        if (prop === "prepare")
          return (sql: string) => {
            if (sql.includes("AS sampled_at"))
              throw Error("Simulated analytics query failure");
            return target.prepare(sql);
          };
        return Reflect.get(target, prop);
      },
    });
    assert.deepEqual(await deliverEvents({ ...f.env, DB: failedDB }), {
      sent: 0,
      failed: 2,
    });
    assert.equal(calls, 0);
    const member = await f.DB.prepare(
      "SELECT email_verified_at FROM members WHERE id='registered'",
    ).first();
    assert.ok(member?.email_verified_at);
    await f.DB.prepare("UPDATE analytics_events SET next_attempt_at=0").run();
    assert.deepEqual(await deliverEvents(f.env), { sent: 2, failed: 0 });
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

test("多人、安排总量共享一次采样；浏览事件不附带全量", async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  try {
    await f.member("a");
    await f.member("b");
    await f.trip("t", "a");
    await f.DB.prepare(
      "INSERT INTO trip_members VALUES ('t','b',CURRENT_TIMESTAMP)",
    ).run();
    await f.DB.prepare(
      "INSERT INTO events(id,trip_id,data,created_by) VALUES ('e','t','{\"kind\":\"explore\"}','a')",
    ).run();
    await f.DB.prepare(
      "INSERT INTO analytics_events(name,actor_id,data) VALUES ('page_viewed','a','{\"page\":\"today\"}')",
    ).run();
    let reads = 0;
    const countedDB = new Proxy(f.DB, {
      get(target, prop) {
        if (prop === "prepare")
          return (sql: string) => {
            if (sql.includes("AS sampled_at")) reads++;
            return target.prepare(sql);
          };
        return Reflect.get(target, prop);
      },
    });
    globalThis.fetch = async (_url, init) => {
      const { payload } = JSON.parse(String(init?.body));
      if (payload.name === "screen_view")
        assert.equal(payload.properties.total_users, undefined);
      else {
        assert.equal(payload.properties.total_trip_creators, 1);
        assert.equal(payload.properties.total_multiplayer_trips, 1);
        assert.equal(payload.properties.total_events, 1);
        assert.equal(payload.properties.total_activities, 1);
      }
      return Response.json({ sessionId: "ok" });
    };
    const result = await deliverEvents({ ...f.env, DB: countedDB });
    assert.equal(result.failed, 0);
    assert.equal(reads, 1);
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});
