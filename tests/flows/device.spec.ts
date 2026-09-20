import { test, expect } from "@playwright/test";
import { Client, base } from "../support/api";
async function open() {
  const response = await fetch(`${base}/api/device/code`, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "CF-Connecting-IP": crypto.randomUUID(),
    },
    body: JSON.stringify({ label: "端到端助手" }),
  });
  expect(response.status).toBe(200);
  return response.json();
}
test("助手授权页：登录后确认授权，助手拿到令牌", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register(),
    device = await open();
  await page.goto(`/device?code=${device.user_code}`);
  await expect(page.getByText(device.user_code, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "旅行计划" })).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "授权旅行助手" }),
  ).toBeVisible();
  await page.screenshot({
    path: `.local/device-approve-${browserName}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "允许访问" }).click();
  await expect(
    page.getByRole("heading", { name: "已允许助手访问" }),
  ).toBeVisible();
  const granted = await (
    await fetch(`${base}/api/device/token`, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        "CF-Connecting-IP": crypto.randomUUID(),
      },
      body: JSON.stringify({ device_code: device.device_code }),
    })
  ).json();
  expect(granted.status).toBe("approved");
  const bootstrap = await fetch(`${base}/api/bootstrap`, {
    headers: { Authorization: `Bearer ${granted.token}` },
  });
  expect(bootstrap.status).toBe(200);
  expect((await bootstrap.json()).me.email).toBe(account.email);
  await page.goto("/");
  await page.getByRole("button", { name: "我的" }).click();
  await expect(
    page.getByRole("button", { name: "已授权的设备" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "已授权的设备" }).click();
  await expect(page.getByText("端到端助手")).toBeVisible();
  await page.getByRole("button", { name: "撤销 端到端助手" }).click();
  await page.getByRole("button", { name: "确认撤销" }).click();
  await expect(page.getByText("没有已授权的设备")).toBeVisible();
  expect(
    (
      await fetch(`${base}/api/bootstrap`, {
        headers: { Authorization: `Bearer ${granted.token}` },
      })
    ).status,
  ).toBe(401);
});
test("助手授权页：拒绝与无效授权码都给出明确结果", async ({ page }) => {
  const account = await new Client().register(),
    device = await open();
  await page.goto(`/device?code=${device.user_code}`);
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "拒绝" }).click();
  await expect(
    page.getByRole("heading", { name: "已拒绝助手访问" }),
  ).toBeVisible();
  const result = await (
    await fetch(`${base}/api/device/token`, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        "CF-Connecting-IP": crypto.randomUUID(),
      },
      body: JSON.stringify({ device_code: device.device_code }),
    })
  ).json();
  expect(result.status).toBe("denied");
  await page.goto("/device?code=ABCDEFGH");
  await expect(
    page.getByRole("heading", { name: "授权码不可用" }),
  ).toBeVisible();
  await expect(
    page.getByText("这个授权码无效或已经过期，请在助手中重新发起登录。"),
  ).toBeVisible();
  await page.goto("/device");
  await expect(
    page.getByRole("heading", { name: "授权码不可用" }),
  ).toBeVisible();
});
