import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, createTrip, eventInput } from "../support/api";

test("公开分享白名单、匿名预览、独立复制、重试幂等及取消分享", async () => {
  const owner = await new Client().register(),
    visitor = new Client(),
    reader = await new Client().register();
  const trip = await createTrip(owner),
    path = `/trips/${trip}/share`,
    doc = crypto.randomUUID();
  await owner.upload(`/trips/${trip}/documents/${doc}?category=test`);
  const event = await owner.request(`/trips/${trip}/events`, "POST", {
    ...eventInput,
    documents: [doc],
    note: "PRIVATE-NOTE",
    source: "PRIVATE-SOURCE",
    phone: "PRIVATE-PHONE",
    code: "PRIVATE-BOOKING",
    subtitle: "PRIVATE-SUBTITLE",
  });
  const draft = await owner.request(path);
  const serialized = JSON.stringify(draft.snapshot);
  for (const secret of [
    doc,
    owner.id,
    "PRIVATE-NOTE",
    "PRIVATE-SOURCE",
    "PRIVATE-PHONE",
    "PRIVATE-BOOKING",
    "PRIVATE-SUBTITLE",
  ])
    assert.ok(!serialized.includes(secret));
  await reader.request(path, "GET", undefined, 404);
  const publish = () =>
    owner.request(path, "POST", {
      hash: draft.hash,
      version: 0,
      publicationId: null,
      confirmed: true,
    });
  const publicTrip = await publish();
  assert.equal(
    (await visitor.request(`/market/${publicTrip.id}`)).snapshot.events.length,
    1,
  );
  assert.ok(
    (await visitor.request("/market?q=" + encodeURIComponent(eventInput.title)))
      .items.length === 0,
  ); // Search only titles/destinations, never private event text.
  await visitor.request(`/market/${publicTrip.id}/copy`, "POST", {}, 401);
  const payload = {
    requestId: crypto.randomUUID(),
    version: publicTrip.version,
    start_date: "2030-06-02",
  };
  const [a, b] = await Promise.all([
    reader.request(`/market/${publicTrip.id}/copy`, "POST", payload),
    reader.request(`/market/${publicTrip.id}/copy`, "POST", payload),
  ]);
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, trip);
  const copied = await reader.request(`/trips/${a.id}/data`);
  assert.equal(copied.trip.owner_id, reader.id);
  assert.equal(copied.members.length, 1);
  for (const field of [
    "documents",
    "expenses",
    "receipts",
    "packing",
    "preparation",
  ])
    assert.equal(copied[field].length, 0);
  assert.equal(copied.events.length, 1);
  assert.notEqual(copied.events[0].id, event.id);
  assert.deepEqual(copied.events[0].documents, []);
  assert.equal(copied.events[0].note, "");
  assert.equal(copied.events[0].certainty, "suggested");
  assert.equal(copied.events[0].start, "2030-06-02T01:00:00.000Z");
  await owner.request(`/trips/${trip}/events/${event.id}`, "PUT", {
    ...eventInput,
    title: "PRIVATE CHANGE",
    version: 1,
  });
  assert.equal(
    (await visitor.request(`/market/${publicTrip.id}`)).snapshot.events[0]
      .title,
    eventInput.title,
  );
  await owner.request(
    path,
    "POST",
    {
      hash: draft.hash,
      version: publicTrip.version,
      publicationId: publicTrip.id,
      confirmed: true,
    },
    409,
  );
  const updatedDraft = await owner.request(path);
  const updated = await owner.request(path, "POST", {
    hash: updatedDraft.hash,
    version: publicTrip.version,
    publicationId: publicTrip.id,
    confirmed: true,
  });
  await reader.request(
    `/market/${publicTrip.id}/copy`,
    "POST",
    { ...payload, requestId: crypto.randomUUID() },
    409,
  );
  await owner.request(path, "DELETE", {
    version: updated.version,
    publicationId: updated.id,
  });
  await visitor.request(`/market/${updated.id}`, "GET", undefined, 404);
  assert.equal((await reader.request(`/trips/${a.id}/data`)).events.length, 1);
  const again = await owner.request(path, "POST", {
    hash: updatedDraft.hash,
    version: 0,
    publicationId: null,
    confirmed: true,
  });
  assert.notEqual(again.id, updated.id);
  await owner.request(
    path,
    "DELETE",
    { version: again.version, publicationId: updated.id },
    409,
  );
  await owner.request(path, "DELETE", {
    version: again.version,
    publicationId: again.id,
  });
});

test("空行程不可发布，成员无权发布，源行程删除后公开链接失效", async () => {
  const owner = await new Client().register(),
    member = await new Client().register(),
    trip = await createTrip(owner),
    path = `/trips/${trip}/share`;
  const empty = await owner.request(path);
  assert.equal(empty.snapshot, null);
  await owner.request(
    path,
    "POST",
    { hash: empty.hash, version: 0, publicationId: null, confirmed: true },
    400,
  );
  const invite = await owner.request(`/trips/${trip}/invites`, "POST", {});
  await member.request("/join", "POST", { token: invite.token });
  await member.request(path, "GET", undefined, 403);
  await owner.request(`/trips/${trip}/events`, "POST", eventInput);
  const draft = await owner.request(path);
  const published = await owner.request(path, "POST", {
    hash: draft.hash,
    version: 0,
    publicationId: null,
    confirmed: true,
  });
  await owner.request(`/trips/${trip}`, "DELETE", { title: "测试旅行" });
  await new Client().request(`/market/${published.id}`, "GET", undefined, 404);
});
