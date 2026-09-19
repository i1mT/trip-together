import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, createTrip, eventInput } from "../support/api";
import { selectEvents } from "../../web/src/lib/time";
import type { TripEvent } from "../../web/src/lib/models";

test("结束/取消排除定时、时间待定安排，恢复及历史缺失状态仍兼容", () => {
  const event = { ...eventInput, id: "one", version: 1 } as TripEvent;
  const now = Date.parse(event.start) + 1000;
  for (const status of ["completed", "cancelled"] as const) {
    for (const extra of [
      {},
      { timeMode: "date" as const },
      { endUnspecified: true },
    ]) {
      assert.equal(
        selectEvents([{ ...event, ...extra, status }], now).featured,
        undefined,
      );
      assert.equal(
        selectEvents([{ ...event, ...extra, status }], now).finished,
        true,
      );
    }
  }
  assert.equal(selectEvents([event], now).featured?.id, "one");
  assert.equal(
    selectEvents([{ ...event, status: "planned" }], now).featured?.id,
    "one",
  );
});

test("安排状态权限、并发保护、资料保留、编辑不重置与公开隔离", async () => {
  const owner = await new Client().register(),
    outsider = await new Client().register();
  const trip = await createTrip(owner),
    path = `/trips/${trip}/events`;
  const doc = crypto.randomUUID();
  await owner.upload(`/trips/${trip}/documents/${doc}?category=test`);
  const { id } = await owner.request(path, "POST", {
    ...eventInput,
    documents: [doc],
  });
  await outsider.request(
    `${path}/${id}`,
    "PATCH",
    { status: "completed", version: 1 },
    404,
  );
  await owner.request(
    `${path}/${id}`,
    "PATCH",
    { status: "invalid", version: 1 },
    400,
  );
  await owner.request(`${path}/${id}`, "PATCH", {
    status: "completed",
    version: 1,
  });
  await owner.request(
    `${path}/${id}`,
    "PATCH",
    { status: "cancelled", version: 1 },
    409,
  );
  let data = await owner.request(`/trips/${trip}/data`);
  assert.equal(data.events[0].status, "completed");
  assert.deepEqual(data.events[0].documents, [doc]);
  await owner.request(`${path}/${id}`, "PUT", {
    ...data.events[0],
    title: "更新名称",
    status: "planned",
  });
  data = await owner.request(`/trips/${trip}/data`);
  assert.equal(data.events[0].status, "completed");
  assert.equal(data.events[0].start, eventInput.start);
  await owner.request(`${path}/${id}`, "PATCH", {
    status: "cancelled",
    version: data.events[0].version,
  });
  const draft = await owner.request(`/trips/${trip}/share`);
  assert.equal(draft.snapshot.events[0].status, undefined);
  data = await owner.request(`/trips/${trip}/data`);
  await owner.request(`${path}/${id}`, "PATCH", {
    status: "planned",
    version: data.events[0].version,
  });
  data = await owner.request(`/trips/${trip}/data`);
  assert.equal(data.events[0].status, "planned");
  assert.equal(data.documents.length, 1);
  assert.equal(data.events[0].title, "更新名称");
  const invitation = await owner.request(`/trips/${trip}/invites`, "POST", {});
  await outsider.request("/join", "POST", { token: invitation.token });
  await outsider.request(`${path}/${id}`, "PATCH", {
    status: "completed",
    version: data.events[0].version,
  });
  assert.equal(
    (await owner.request(`/trips/${trip}/data`)).events[0].status,
    "completed",
  );
});
