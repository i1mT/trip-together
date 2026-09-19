import { test, expect } from "@playwright/test";
import { Client, tripInput, png } from "../support/api";
test("个人页切换、独立行程管理、非当前行程邀请与原页面标题加号", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register();
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "还没有行程", exact: true }),
  ).toBeVisible();
  for (const [tab, title] of [
    ["行程", "还没有行程安排"],
    ["资料", "还没有行程资料"],
    ["账本", "还没有行程账本"],
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "编辑个人资料" }).click();
  await page.getByLabel("昵称", { exact: true }).fill("我的新昵称");
  await page.getByRole("button", { name: "保存个人资料" }).click();
  await page.getByLabel("上传个人证件").setInputFiles({
    name: "无行程证件.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("button", { name: "查看无行程证件.png" }),
  ).toBeVisible();
  const manage = () =>
    page.getByRole("button", { name: /我的行程.*创建/ }).click();
  await manage();
  await expect(page.getByRole("button", { name: /退出/ })).toHaveCount(0);
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的新昵称" })).toBeVisible();
  await manage();
  await page.getByRole("button", { name: /创建行程/ }).click();
  await page.getByLabel("行程名称（选填）", { exact: true }).fill("当前旅行");
  await page.getByLabel("搜索目的地", { exact: true }).fill("东京");
  await page.getByRole("button", { name: "搜索目的地结果" }).click();
  await page.getByRole("button", { name: /东京/ }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建行程", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "还没有行程安排" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /当前行程：/ })).toHaveCount(0);
  const other = await account.request(
    "/trips",
    "POST",
    { ...tripInput, title: "另一段旅行" },
    201,
  );
  await page.reload();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "当前行程：当前旅行，切换行程" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "行程设置", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "生成同行邀请" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: `.local/profile-trip-controls-${browserName}.png`,
    fullPage: true,
  });
  await manage();
  await page.getByRole("button", { name: "管理行程：另一段旅行" }).click();
  await page.getByRole("button", { name: "生成同行邀请" }).click();
  const token = await page.getByLabel("同行邀请口令").inputValue();
  await page.getByRole("button", { name: "返回我的行程", exact: true }).click();
  await page.getByRole("button", { name: "管理行程：另一段旅行" }).click();
  await expect(page.getByLabel("同行邀请口令")).toHaveValue(token);
  const member = await new Client().register();
  expect((await member.request("/join", "POST", { token })).id).toBe(other.id);
  await page.getByRole("button", { name: /行程设置/ }).click();
  await page
    .getByLabel("行程名称（选填）", { exact: true })
    .fill("另一段旅行更新");
  await page.getByRole("button", { name: "保存行程" }).click();
  await expect(
    page.getByRole("heading", { name: "另一段旅行更新", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `.local/trip-management-${browserName}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "撤销所有邀请" }).click();
  await page.getByRole("button", { name: "确认撤销邀请" }).click();
  await member.request("/join", "POST", { token }, 404);
  await page.getByRole("button", { name: "返回我的行程", exact: true }).click();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "当前行程：当前旅行，切换行程" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "当前行程：当前旅行，切换行程" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /另一段旅行更新/ })
    .click();
  await expect(
    page.getByRole("button", { name: "我的", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "当前行程：另一段旅行更新，切换行程" }),
  ).toBeVisible();
  for (const [tab, title, action] of [
    ["行程", "完整行程", "添加安排"],
    ["资料", "旅行资料", "上传旅行资料"],
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByRole("button", { name: /当前行程：/ })).toHaveCount(
      0,
    );
    const heading = page.getByRole("heading", { name: title, exact: true }),
      button = page.getByRole("button", { name: action, exact: true });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const h = await heading.boundingBox(),
        b = await button.boundingBox();
      expect(b!.x).toBeGreaterThan(h!.x);
      expect(
        Math.abs(b!.y + b!.height / 2 - (h!.y + h!.height / 2)),
      ).toBeLessThan(12);
      expect(await button.textContent()).toBe("");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `.local/title-action-${tab}-${browserName}.png`,
      fullPage: true,
    });
    await button.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "当前行程：另一段旅行更新，切换行程" }),
  ).toBeVisible();
  await manage();
  await page.getByRole("button", { name: "管理行程：另一段旅行更新" }).click();
  await page.getByRole("button", { name: "删除整个行程", exact: true }).click();
  await page.getByLabel("输入行程名称确认").fill("另一段旅行更新");
  await page.getByRole("button", { name: "确认删除整个行程" }).click();
  await expect(
    page.getByRole("heading", { name: "我的行程", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "当前行程：当前旅行，切换行程" }),
  ).toBeVisible();
});
