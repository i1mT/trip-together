import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, createTrip, eventInput, base } from "../support/api";
test("公开作者、唯一口令、介绍上限和撤销后的头像权限", async () => {
  const owner = await new Client().register("攻略作者"),
    reader = new Client();
  await owner.upload("/avatar");
  const trip = await createTrip(owner),
    path = `/trips/${trip}/share`;
  await owner.request(`/trips/${trip}/events`, "POST", eventInput);
  const draft = await owner.request(path);
  const input = {
    hash: draft.hash,
    version: 0,
    publicationId: null,
    confirmed: true,
  };
  await owner.request(
    path,
    "POST",
    { ...input, introduction: "长".repeat(501) },
    400,
  );
  const published = await owner.request(path, "POST", {
    ...input,
    introduction: "适合慢慢旅行\n推荐自由行",
  });
  assert.match(published.code, /^[A-Z2-9]{8}$/);
  assert.equal(published.author.name, "攻略作者");
  assert.equal(published.introduction, "适合慢慢旅行\n推荐自由行");
  assert.ok(!JSON.stringify(published).includes(owner.id));
  assert.ok(!JSON.stringify(published).includes(owner.email));
  let avatar = await fetch(base + published.author.avatar);
  assert.equal(avatar.status, 200);
  assert.match(avatar.headers.get("cache-control") ?? "", /no-store/);
  await reader.file("unrelated-file", 401);
  const market = await reader.request(
    `/market?q=${published.code.toLowerCase()}`,
  );
  assert.equal(market.items[0].id, published.id);
  assert.equal(market.items[0].author.name, "攻略作者");
  const updated = await owner.request(path, "POST", {
    ...input,
    version: published.version,
    publicationId: published.id,
    introduction: "新的介绍",
  });
  assert.equal(updated.code, published.code);
  assert.equal(updated.introduction, "新的介绍");
  await owner.request(path, "DELETE", {
    version: updated.version,
    publicationId: published.id,
  });
  assert.equal(
    (await reader.request(`/market?q=${published.code}`)).items.length,
    0,
  );
  avatar = await fetch(base + published.author.avatar);
  assert.equal(avatar.status, 404);
  const republished = await owner.request(path, "POST", input);
  assert.notEqual(republished.code, published.code);
});
