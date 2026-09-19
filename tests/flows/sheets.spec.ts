import { test, expect } from "@playwright/test";
import { Client, createTrip } from "../support/api";
test("短弹窗自然高度、长表单只滚动内容、底部按钮关联原生表单", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register();
  const tripId = await createTrip(account);
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.getByRole("button", { name: "添加安排", exact: true }).click();
  const dialog = page.getByRole("dialog");
  expect((await dialog.boundingBox())!.height).toBeLessThan(450);
  await expect(
    dialog.locator(".sheet-footer").getByRole("button", { name: "下一步" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 400 });
  await page.getByText("补充说明（选填）", { exact: true }).click();
  const body = dialog.locator(".sheet-body");
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  const save = dialog.getByRole("button", { name: "下一步", exact: true });
  const before = await save.boundingBox();
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect((await save.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  expect(
    await save.evaluate((el) => (el as HTMLButtonElement).form?.id),
  ).toBeTruthy();
  expect(await save.evaluate((el) => el.closest("form"))).toBeNull();
  await save.click();
  await expect(dialog).toBeVisible();
  expect((await account.request(`/trips/${tripId}/data`)).events).toHaveLength(
    0,
  );
  await page.getByLabel("活动名称").fill("未保存的活动");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByRole("heading", { name: "尚未保存" })).toBeVisible();
  expect((await dialog.boundingBox())!.height).toBeLessThan(300);
  await expect(
    dialog
      .locator(".sheet-footer:visible")
      .getByRole("button", { name: "继续编辑" }),
  ).toBeVisible();
  await page.screenshot({
    path: `.local/shared-sheet-confirm-${browserName}.png`,
  });
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByLabel("活动名称")).toHaveValue("未保存的活动");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "放弃修改并关闭" }).click();
  await expect(dialog).toHaveCount(0);
});
