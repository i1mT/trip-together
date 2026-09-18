import { test, expect } from "@playwright/test";
import { Client, createTrip, eventInput } from "../support/api";
test("手机结束与取消从首页移除、完整行程保留标签、详情恢复", async ({
  page,
  browserName,
}) => {
  const owner = await new Client().register(),
    trip = await createTrip(owner);
  for (const [title, kind, start, end] of [
    [
      "游览花园",
      "explore",
      "2030-06-01T09:00:00+08:00",
      "2030-06-01T10:00:00+08:00",
    ],
    [
      "湖边住宿",
      "stay",
      "2030-06-01T15:00:00+08:00",
      "2030-06-02T10:00:00+08:00",
    ],
  ])
    await owner.request(`/trips/${trip}/events`, "POST", {
      ...eventInput,
      title,
      kind,
      start,
      end,
      endTimezone: "Asia/Shanghai",
    });
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(owner.email);
  await page.getByLabel("密码", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "查看游览花园详情" }).click();
  await page.getByRole("button", { name: "标记已结束" }).click();
  await expect(page.getByRole("button", { name: "恢复安排" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByText("游览花园", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查看湖边住宿详情" }).click();
  await page.getByRole("button", { name: "取消事项", exact: true }).click();
  await expect(page.getByRole("button", { name: "恢复安排" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByText("湖边住宿", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("游览花园", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查看完整行程", exact: true }).click();
  await page.getByRole("button", { name: /第 1 天/ }).click();
  await expect(page.getByText("已结束", { exact: true })).toBeVisible();
  await expect(page.getByText("已取消", { exact: true })).toBeVisible();
  await page.screenshot({ path: `.local/event-status-${browserName}.png` });
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "游览花园" }) })
    .click();
  await page.getByRole("button", { name: "恢复安排" }).click();
  await expect(page.getByRole("button", { name: "标记已结束" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByText("已结束", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "现在", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看游览花园详情" }),
  ).toBeVisible();
  await expect(page.getByText("湖边住宿", { exact: true })).toHaveCount(0);
});
