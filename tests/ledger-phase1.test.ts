import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, tripInput } from "./support/api";
import { estimateCny, referencePpm } from "../shared/fx";

test("参考汇率把原币整数分换成人民币分", () => {
  assert.equal(
    estimateCny(5000, referencePpm("USD")),
    Math.round((5000 * referencePpm("USD")) / 1_000_000),
  );
  assert.equal(referencePpm("CNY"), 1_000_000);
  assert.ok(estimateCny(5000, referencePpm("USD")) > 0);
});

test("占位同伴可以记账，认领只改用户且邀请口令才看得到金额", async () => {
  const owner = await new Client().register("小林");
  const { id } = await owner.request("/trips", "POST", tripInput, 201);
  const created = await owner.request(`/trips/${id}/members`, "POST", {
    name: "阿哲",
  });
  assert.equal(created.member.status, "placeholder");
  assert.equal(created.member.user_id, null);
  const again = await owner.request(`/trips/${id}/members`, "POST", {
    name: "阿哲",
  });
  assert.equal(again.duplicate, true);
  const expenseId = crypto.randomUUID();
  await owner.request(`/trips/${id}/expenses`, "POST", {
    id: expenseId,
    title: "晚餐",
    amount: 5000,
    currency: "USD",
    date: "2030-06-01",
    payerId: created.member.id,
    participants: [created.member.id],
    note: "",
  });
  const before = await owner.request(`/trips/${id}/data`);
  const expense = before.expenses.find(
    (item: { id: string }) => item.id === expenseId,
  );
  assert.equal(expense.payer_id, created.member.id);
  assert.equal(expense.settle_status, "estimated");
  assert.equal(expense.settlement_locked, 0);
  assert.equal(
    expense.amount_cny_estimated,
    estimateCny(5000, referencePpm("USD")),
  );
  const token = (await owner.request(`/trips/${id}/invites`, "POST", {})).token;
  const guest = await new Client().register("阿哲");
  await guest.request("/join/preview", "POST", { token: "AAAAAA" }, 404);
  const preview = await guest.request("/join/preview", "POST", { token });
  assert.equal(preview.placeholders.length, 2);
  const shown = preview.placeholders.find(
    (item: { id: string }) => item.id === created.member.id,
  );
  assert.equal(shown.expenseCount, 1);
  assert.equal(shown.shareCny, expense.amount_cny_estimated);
  assert.equal(shown.approximate, true);
  const claimed = await guest.request("/claim", "POST", {
    token,
    memberId: created.member.id,
  });
  assert.equal(claimed.memberId, created.member.id);
  const after = await guest.request(`/trips/${id}/data`);
  const same = after.expenses.find(
    (item: { id: string }) => item.id === expenseId,
  );
  assert.equal(same.payer_id, created.member.id);
  const person = after.members.find(
    (item: { id: string }) => item.id === created.member.id,
  );
  assert.equal(person.user_id, guest.id);
  assert.equal(person.status, "claimed");
  await guest.request(
    `/trips/${id}/members/${created.member.id}/unclaim`,
    "POST",
    {},
    403,
  );
  await owner.request(
    `/trips/${id}/members/${created.member.id}/unclaim`,
    "POST",
    {},
  );
  const restored = await owner.request(`/trips/${id}/data`);
  assert.equal(
    restored.members.find(
      (item: { id: string }) => item.id === created.member.id,
    ).status,
    "placeholder",
  );
  await guest.request(`/trips/${id}/data`, "GET", undefined, 404);
  await owner.request(
    `/trips/${id}/members/${created.member.id}`,
    "DELETE",
    undefined,
    409,
  );
  const other = restored.members.find(
    (item: { id: string }) => item.user_id === owner.id,
  );
  await owner.request(
    `/trips/${id}/members/${created.member.id}/merge`,
    "POST",
    {
      targetId: other.id,
    },
  );
  const merged = await owner.request(`/trips/${id}/data`);
  assert.equal(
    merged.members.some(
      (item: { id: string }) => item.id === created.member.id,
    ),
    false,
  );
  assert.equal(
    merged.expenses.find((item: { id: string }) => item.id === expenseId)
      .payer_id,
    other.id,
  );
});

test("外币账锁定后不能改金额，冲销保留原账", async () => {
  const owner = await new Client().register();
  const { id } = await owner.request("/trips", "POST", tripInput, 201);
  const expense = {
    id: crypto.randomUUID(),
    title: "晚餐",
    amount: 5000,
    currency: "USD",
    date: "2030-06-01",
    payerId: owner.id,
    participants: [owner.id],
    note: "",
  };
  await owner.request(`/trips/${id}/expenses`, "POST", expense);
  await owner.request(`/trips/${id}/expenses/${expense.id}/settle`, "POST", {
    amountCny: 36800,
    version: 1,
  });
  const locked = (await owner.request(`/trips/${id}/data`)).expenses[0];
  assert.equal(locked.settlement_locked, 1);
  assert.equal(locked.amount_cny_settled, 36800);
  assert.equal(locked.amount, 5000);
  await owner.request(
    `/trips/${id}/expenses/${expense.id}`,
    "PUT",
    { ...expense, amount: 5100, version: 2 },
    409,
  );
  const companion = (
    await owner.request(`/trips/${id}/members`, "POST", { name: "阿哲" })
  ).member.id;
  for (const change of [
    { title: "改过的标题" },
    { date: "2030-06-02" },
    { note: "改过的备注" },
    { participants: [companion] },
  ]) {
    await owner.request(
      `/trips/${id}/expenses/${expense.id}`,
      "PUT",
      { ...expense, ...change, version: 2 },
      409,
    );
  }
  const untouched = (await owner.request(`/trips/${id}/data`)).expenses.find(
    (item: { id: string }) => item.id === expense.id,
  );
  assert.equal(untouched.title, "晚餐");
  assert.equal(untouched.date, "2030-06-01");
  assert.equal(untouched.note, "");
  await owner.request(
    `/trips/${id}/expenses/${expense.id}`,
    "DELETE",
    { version: 2 },
    409,
  );
  const reversal = await owner.request(
    `/trips/${id}/expenses/${expense.id}/reverse`,
    "POST",
    {
      version: 2,
    },
  );
  await owner.request(
    `/trips/${id}/expenses/${expense.id}/reverse`,
    "POST",
    { version: 2 },
    409,
  );
  const data = await owner.request(`/trips/${id}/data`);
  assert.equal(data.expenses.length, 2);
  const offset = data.expenses.find(
    (item: { id: string }) => item.id === reversal.id,
  );
  assert.equal(offset.entry_type, "reversal");
  assert.equal(offset.amount_cny_settled, 36800);
  assert.equal(offset.reversal_of, expense.id);
  const kept = data.expenses.find(
    (item: { id: string }) => item.id === expense.id,
  );
  assert.equal(kept.amount, 5000);
  assert.equal(kept.settlement_locked, 1);
});
