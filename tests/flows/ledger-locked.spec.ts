import { test, expect } from "@playwright/test";
import { Client, createTrip } from "../support/api";

async function login(page: import("@playwright/test").Page, account: Client) {
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

test("锁定账详情页只剩冲销重记，没有任何编辑入口", async ({ page }) => {
  const account = await new Client().register();
  const id = await createTrip(account);
  const expense = {
    id: crypto.randomUUID(),
    title: "外币晚餐",
    amount: 5000,
    currency: "USD",
    date: "2030-06-01",
    payerId: account.id,
    participants: [account.id],
    note: "",
  };
  await account.request(`/trips/${id}/expenses`, "POST", expense);
  await account.request(`/trips/${id}/expenses/${expense.id}/settle`, "POST", {
    amountCny: 36800,
    version: 1,
  });
  await login(page, account);
  await page.getByRole("button", { name: "账本", exact: true }).click();
  await page.getByRole("button", { name: "美元", exact: true }).click();
  await page.getByText("外币晚餐", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "冲销重记", exact: true }),
  ).toBeVisible();
  // A settled expense is immutable: no path back into the editor.
  await expect(page.getByText("尚未添加资料")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑这笔支出", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "录入实际人民币", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: ".local/ledger-locked-detail.png" });
});
