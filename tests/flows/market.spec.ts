import { test, expect } from "@playwright/test";
import { Client, createTrip, eventInput } from "../support/api";
test("手机公开发布、匿名预览、登录返回并复制为独立行程", async ({
  page,
  browser,
  browserName,
}) => {
  const owner = await new Client().register("旅行作者"),
    trip = await createTrip(owner);
  await owner.request(`/trips/${trip}/events`, "POST", {
    ...eventInput,
    title: "市场演示航班",
    note: "不应公开的私人备注",
  });
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(owner.email);
  await page.getByLabel("密码", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /我的行程.*创建/ }).click();
  await page.getByRole("button", { name: "管理行程：测试旅行" }).click();
  await page.getByRole("button", { name: /分享我的行程攻略/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("市场演示航班")).toBeVisible();
  await expect(dialog.getByText("不应公开的私人备注")).toHaveCount(0);
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "公开发布", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "确认分享攻略" }),
  ).toBeVisible();
  await dialog.getByLabel("公开名称").fill("巴黎慢游");
  await dialog
    .getByLabel("行程介绍")
    .fill("适合第一次来旅行的朋友。\n每天慢慢逛，不赶路。");
  await expect(dialog.getByLabel("行程介绍")).toHaveAttribute(
    "maxlength",
    "500",
  );
  await dialog.getByRole("button", { name: "返回预览" }).click();
  await expect(dialog.getByText("市场演示航班")).toBeVisible();
  await dialog.getByRole("button", { name: "公开发布", exact: true }).click();
  await expect(dialog.getByLabel("公开名称")).toHaveValue("巴黎慢游");
  await dialog
    .getByRole("button", { name: "确认公开发布", exact: true })
    .click();
  await dialog.getByRole("button", { name: /这个行程已经公开/ }).click();
  await expect(dialog.getByLabel("公开分享口令")).toBeVisible();
  const code = await dialog.getByLabel("公开分享口令").inputValue();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  await page.screenshot({ path: `.local/share-publish-${browserName}.png` });
  const other = await browser.newContext({
      viewport: { width: 375, height: 812 },
    }),
    preview = await other.newPage(),
    reader = await new Client().register();
  await preview.goto(new URL("/", page.url()).href);
  await preview.getByRole("button", { name: "先看看旅行攻略市场" }).click();
  await preview.getByLabel("搜索公开行程").fill(code.toLowerCase());
  await preview.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(preview.locator(".market-card")).toHaveCount(1);
  await expect(preview.getByText("旅行作者", { exact: true })).toBeVisible();
  await expect(preview.locator(".market-introduction-excerpt")).toHaveCSS(
    "white-space",
    "nowrap",
  );
  await preview.getByRole("button", { name: /巴黎慢游/ }).click();
  await expect(preview.locator(".market-speech-bubble")).toContainText(
    "每天慢慢逛，不赶路。",
  );
  await expect(
    preview.getByRole("heading", { name: "行程预览", exact: true }),
  ).toBeVisible();
  await expect(preview.getByText("市场演示航班")).toBeVisible();
  await preview.screenshot({
    path: `.local/market-preview-${browserName}.png`,
    fullPage: true,
  });
  await preview.getByRole("button", { name: "登录后复制行程" }).click();
  await preview.getByLabel("邮箱", { exact: true }).fill(reader.email);
  await preview.getByLabel("密码", { exact: true }).fill(reader.password);
  await preview.getByRole("button", { name: "登录", exact: true }).click();
  await preview
    .getByRole("button", { name: "复制为我的行程", exact: true })
    .click();
  await preview.getByLabel("我的出发日期").fill("2030-06-05");
  await preview.route(
    "**/api/market/*/copy",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "登录已过期" }),
      });
    },
    { times: 1 },
  );
  await preview.getByRole("button", { name: "确认复制", exact: true }).click();
  await expect(preview.getByLabel("邮箱", { exact: true })).toBeVisible();
  await preview.getByLabel("邮箱", { exact: true }).fill(reader.email);
  await preview.getByLabel("密码", { exact: true }).fill(reader.password);
  await preview.getByRole("button", { name: "登录", exact: true }).click();
  await preview
    .getByRole("button", { name: "复制为我的行程", exact: true })
    .click();
  await preview.route(
    "**/api/market/*/copy",
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await preview.getByRole("button", { name: "确认复制", exact: true }).click();
  await expect(preview.getByRole("alert")).toContainText("网络连接失败");
  await preview.getByRole("button", { name: "关闭", exact: true }).click();
  await preview
    .getByRole("button", { name: "复制为我的行程", exact: true })
    .click();
  await expect(preview.getByLabel("我的出发日期")).toHaveValue("2030-06-05");
  await preview.route(
    "**/api/market/*/copy",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "登录已过期" }),
      });
    },
    { times: 1 },
  );
  await preview.getByRole("button", { name: "确认复制", exact: true }).click();
  await preview.getByLabel("邮箱", { exact: true }).fill(reader.email);
  await preview.getByLabel("密码", { exact: true }).fill(reader.password);
  await preview.getByRole("button", { name: "登录", exact: true }).click();
  await preview
    .getByRole("button", { name: "复制为我的行程", exact: true })
    .click();
  await preview.route(
    "**/api/bootstrap",
    async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "登录已过期" }),
      });
    },
    { times: 1 },
  );
  await preview.getByRole("button", { name: "确认复制", exact: true }).click();
  await expect(preview.getByLabel("邮箱", { exact: true })).toBeVisible();
  await preview.getByLabel("邮箱", { exact: true }).fill(reader.email);
  await preview.getByLabel("密码", { exact: true }).fill(reader.password);
  await preview.getByRole("button", { name: "登录", exact: true }).click();
  await preview
    .getByRole("button", { name: "复制为我的行程", exact: true })
    .click();

  await preview
    .getByRole("button", { name: "打开已经复制的行程", exact: true })
    .click();
  await expect(
    preview.getByRole("heading", { name: "完整行程" }),
  ).toBeVisible();
  const boot = await reader.request("/bootstrap");
  expect(boot.trips).toHaveLength(1);
  expect(boot.trips[0].start_date).toBe("2030-06-05");
  expect(boot.trips[0].id).not.toBe(trip);
  await preview.getByRole("button", { name: "我的", exact: true }).click();
  await preview.getByRole("button", { name: /我的行程.*创建/ }).click();
  await preview.getByRole("button", { name: /旅行攻略市场/ }).click();
  await preview.getByLabel("搜索公开行程").fill("巴黎慢游");
  await preview.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: /巴黎慢游/ }).first(),
  ).toBeVisible();
  await preview.setViewportSize({ width: 320, height: 740 });
  expect(
    await preview.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await other.close();
});
