import { test, expect } from "@playwright/test";
import { Client, createTrip } from "../support/api";

async function login(page: import("@playwright/test").Page, account: Client) {
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

test("成员与账本的危险操作使用确认弹窗", async ({ page }) => {
  const owner = await new Client().register("创建者");
  const guest = await new Client().register("已认领成员");
  const tripId = await createTrip(owner);
  const invite = await owner.request(`/trips/${tripId}/invites`, "POST", {});
  await guest.request("/join", "POST", { token: invite.token });
  const placeholder = await owner.request(`/trips/${tripId}/members`, "POST", {
    name: "占位同伴",
  });
  const mergeExpense = {
    id: crypto.randomUUID(),
    title: "占位同伴晚餐",
    amount: 5000,
    currency: "USD",
    date: "2030-06-01",
    payerId: owner.id,
    participants: [placeholder.member.id],
    note: "",
  };
  await owner.request(`/trips/${tripId}/expenses`, "POST", mergeExpense);
  const pending = {
    id: crypto.randomUUID(),
    title: "待结算晚餐",
    amount: 5000,
    currency: "USD",
    date: "2030-06-02",
    payerId: owner.id,
    participants: [owner.id],
    note: "",
  };
  await owner.request(`/trips/${tripId}/expenses`, "POST", pending);
  const locked = {
    id: crypto.randomUUID(),
    title: "已结算晚餐",
    amount: 5000,
    currency: "USD",
    date: "2030-06-03",
    payerId: owner.id,
    participants: [owner.id],
    note: "",
  };
  await owner.request(`/trips/${tripId}/expenses`, "POST", locked);
  await owner.request(`/trips/${tripId}/expenses/${locked.id}/settle`, "POST", {
    amountCny: 36800,
    version: 1,
  });

  await login(page, owner);
  await page.getByRole("button", { name: "我的", exact: true }).click();

  await page.getByRole("button", { name: "解除认领", exact: true }).click();
  await expect(page.getByRole("heading", { name: "解除认领" })).toBeVisible();
  await expect(page.getByText("不会删除账目")).toBeVisible();
  await expect(page.locator(".companion-merge")).toHaveCount(0);
  await page.getByRole("button", { name: "取消", exact: true }).last().click();

  await page.getByRole("button", { name: "合并到…", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "合并占位同伴" }),
  ).toBeVisible();
  await expect(page.getByText("不可撤销")).toBeVisible();
  await expect(page.getByText("操作审计记录")).toBeVisible();
  await expect(page.locator(".companion-merge")).toHaveCount(0);
  await page.getByRole("button", { name: "取消", exact: true }).last().click();

  await page.getByRole("button", { name: "账本", exact: true }).click();
  await page.getByRole("button", { name: "美元", exact: true }).click();
  await page.getByText("待结算晚餐", { exact: true }).click();
  await page
    .getByRole("button", { name: "录入实际人民币", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "录入实际人民币" }),
  ).toBeVisible();
  await expect(page.getByText("这笔账会被锁定")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByText("已结算晚餐", { exact: true }).click();
  await page.getByRole("button", { name: "冲销重记", exact: true }).click();
  await expect(page.getByRole("heading", { name: "冲销重记" })).toBeVisible();
  await expect(page.getByText("审计链路")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
});
