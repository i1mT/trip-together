import { test, expect } from "@playwright/test";
import { Client } from "../support/api";
test("邮箱登录错误位于按钮上方、本地无需验证码并可重置密码", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "注册新账号" })).toHaveClass(
    "secondary-button",
  );
  await expect(page.getByLabel("邮箱验证码")).toHaveCount(0);
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const error = page.locator("form").getByRole("alert"),
    submit = page.getByRole("button", { name: "登录", exact: true });
  await expect(error).toHaveText("邮箱或密码不正确");
  const a = await error.boundingBox(),
    b = await submit.boundingBox();
  expect(a!.y + a!.height).toBeLessThan(b!.y);
  await page.screenshot({
    path: `.local/login-${browserName}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "忘记密码", exact: true }).click();
  await page.getByLabel("新密码").fill(account.password + "new");
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "密码已经更新，请重新登录。",
  );
  await page.getByLabel("密码", { exact: true }).fill(account.password + "new");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "还没有行程" })).toBeVisible();
});
test("次要按钮行按数量自适应宽度，不出现半行空白", async ({ page }) => {
  async function sizes() {
    const row = page.locator(".login-secondary-row"),
      box = (await row.boundingBox())!,
      buttons = await Promise.all(
        (await row.getByRole("button").all()).map((button) =>
          button.boundingBox(),
        ),
      );
    return {
      width: box.width,
      buttons: buttons.map((button) => button!.width),
    };
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const pair = await sizes();
    expect(pair.buttons).toHaveLength(2);
    expect(Math.abs(pair.buttons[0] - pair.buttons[1])).toBeLessThan(1);
    await page.getByRole("button", { name: "注册新账号" }).click();
    const single = await sizes();
    expect(single.buttons).toHaveLength(1);
    expect(single.buttons[0]).toBeGreaterThan(single.width - 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
});
test("线上认证页面展示邮箱验证码和发送倒计时", async ({
  page,
  browserName,
}) => {
  await page.route("**/api/auth-config", (route) =>
    route.fulfill({ json: { emailVerificationRequired: true } }),
  );
  await page.route("**/api/email-code", (route) =>
    route.fulfill({ json: { ok: true, retryAfter: 60 } }),
  );
  await page.goto("/");
  await expect(page.getByLabel("邮箱验证码")).toHaveCount(0);
  await page.getByRole("button", { name: "注册新账号" }).click();
  await page.getByLabel("邮箱", { exact: true }).fill("preview@example.test");
  await page.getByRole("button", { name: "发送验证码", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "验证码已经发送，请查看邮箱。",
  );
  await expect(page.getByRole("button", { name: /秒后重发/ })).toBeDisabled();
  await expect(page.getByLabel("邮箱验证码")).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `.local/login-email-${browserName}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "返回登录" }).click();
  await expect(page.getByLabel("邮箱验证码")).toHaveCount(0);
  await page.getByRole("button", { name: "注册新账号" }).click();
  await expect(page.getByLabel("邮箱验证码")).toBeVisible();
  await page.getByRole("button", { name: "忘记密码", exact: true }).click();
  await expect(page.getByLabel("邮箱验证码")).toBeVisible();
});
