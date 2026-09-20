import { test, expect } from "@playwright/test";
import { Client, tripInput } from "../support/api";
const prompt = "安装 trip-together 这个 skill";
test("接入 AI 入口覆盖无行程空态、创建行程、完整行程空态和个人页", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__copied", { value: "", writable: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.__copied = text;
        },
      },
    });
  });
  const account = await new Client().register();
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  // 无行程空态
  await page.getByRole("button", { name: "如何接入 AI" }).click();
  await expect(page.getByRole("heading", { name: "接入 AI" })).toBeVisible();
  await page.getByRole("button", { name: "复制这句话" }).click();
  await expect(page.getByRole("button", { name: "已经复制" })).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toContain(prompt);
  expect(await page.evaluate(() => window.__copied)).toContain(
    "https://github.com/i1mT/trip-together",
  );
  await expect(page.getByRole("button", { name: "复制这句话" })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: "我知道了" }).click();
  await expect(page.getByRole("heading", { name: "接入 AI" })).toHaveCount(0);
  // 创建行程标题旁
  await page.getByRole("button", { name: "创建行程", exact: true }).click();
  await expect(page.getByRole("heading", { name: "创建行程" })).toBeVisible();
  await page.getByRole("button", { name: "接入 AI" }).click();
  await expect(page.getByRole("heading", { name: "接入 AI" })).toBeVisible();
  await page.getByRole("button", { name: "我知道了" }).click();
  await page.getByRole("button", { name: "关闭" }).click();
  // 完整行程空态与个人页
  await account.request("/trips", "POST", tripInput, 201);
  await page.goto("/");
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.locator(".day-chip").nth(1).click();
  await expect(
    page.getByRole("heading", { name: "这一天还没有安排" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "如何接入 AI" }).click();
  await expect(page.getByRole("heading", { name: "接入 AI" })).toBeVisible();
  await page.getByRole("button", { name: "我知道了" }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "如何接入 AI" }).click();
  await expect(page.getByRole("heading", { name: "接入 AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "我知道了" })).toBeVisible();
});
