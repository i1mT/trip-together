import { chooseTime, chooseZone } from "../support/event-controls";
import { test, expect } from "@playwright/test";
import { Client, createTrip, png } from "../support/api";
async function login(page: import("@playwright/test").Page, account: Client) {
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
test("活动只需名称和日期；住宿、上传关联、头像与昵称保存；草稿关闭保护", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register();
  const id = await createTrip(account);
  await login(page, account);
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.getByRole("button", { name: /第 2 天/ }).click();
  await page.getByRole("button", { name: "添加安排", exact: true }).click();
  await page.screenshot({ path: `.local/event-step-one-${browserName}.png` });
  await page.getByLabel("活动名称").fill("公园散步");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue(
    "2030-06-02",
  );
  await expect(page.getByLabel("开始时间", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(page.getByLabel("活动名称")).toHaveValue("公园散步");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByText("还有未保存的内容，要继续编辑吗？"),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByLabel("活动名称")).toHaveValue("公园散步");
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const compactBox = await page.getByRole("dialog").boundingBox();
  expect(compactBox!.height).toBeLessThan(650);
  await page.screenshot({ path: `.local/simple-event-${browserName}.png` });
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "添加活动", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /公园散步.*查看详情/ }),
  ).toBeVisible();
  let data = await account.request(`/trips/${id}/data`);
  expect(data.events[0].timeMode).toBe("date");
  await page.getByRole("button", { name: "添加安排", exact: true }).click();
  await page.getByRole("button", { name: "住宿", exact: true }).click();
  await page.getByLabel("酒店名称").fill("湖边酒店");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("switch", { name: "时间段" }).click();
  await page.getByLabel("退房日期").fill("2030-06-04");
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "上传并关联资料" }).click();
  await page.getByLabel("选择照片或文件").setInputFiles([
    { name: "酒店订单.png", mimeType: "image/png", buffer: png },
    { name: "入住说明.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("button", { name: "上传 2 份资料" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByLabel("酒店订单.png", { exact: true })).toBeChecked();
  const tile = page.getByRole("checkbox", {
    name: "酒店订单.png",
    exact: true,
  });
  await expect(tile.locator(".file-icon")).toHaveCSS("border-top-width", "3px");
  expect(
    await tile
      .locator(".file-icon")
      .evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe("none");
  await expect(page.locator(".event-document-section")).toBeVisible();
  const fixedHeight = await page.getByRole("dialog").boundingBox();
  expect(fixedHeight!.height).toBeLessThanOrEqual(844 * 0.92 + 1);
  expect(
    await page
      .locator(".event-entry-sheet > .sheet-body")
      .evaluate((el) => getComputedStyle(el).overflowY),
  ).toBe("auto");
  await expect(tile.locator("img")).toHaveAttribute("src", /\/api\/files\//);
  await tile.click();
  await expect(tile).not.toBeChecked();
  await tile.click();
  await expect(tile).toBeChecked();
  await page.screenshot({ path: `.local/document-choices-${browserName}.png` });
  await page.getByRole("button", { name: "添加住宿", exact: true }).click();
  data = await account.request(`/trips/${id}/data`);
  expect(
    data.events.find((e: any) => e.title === "湖边酒店").documents,
  ).toHaveLength(2);
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "编辑个人资料" }).click();
  await page.getByLabel("昵称", { exact: true }).fill("新的昵称");
  await page
    .getByLabel("上传头像", { exact: true })
    .setInputFiles({ name: "头像.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible();
  await expect(page.getByLabel("昵称", { exact: true })).toHaveValue(
    "新的昵称",
  );
  await page.getByRole("button", { name: "保存个人资料" }).click();
  await expect(page.getByRole("heading", { name: "新的昵称" })).toBeVisible();
});
test("新增目的地与币种采用中文；失败重试不重复上传成功文件", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register();
  const tripId = await createTrip(account);
  await login(page, account);
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page.getByRole("button", { name: "上传旅行资料", exact: true }).click();
  await page.getByLabel("资料分类", { exact: true }).fill("旅行保险");
  await page.getByText("新建分类「旅行保险」", { exact: true }).last().click();
  await expect(
    page.getByText("可以选择已有分类，也可以直接输入名称新建分类。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "仅自己可见", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("可见范围：同行成员可见", { exact: true }),
  ).toBeVisible();
  let releaseUpload!: () => void;
  const pendingUpload = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let fail = true;
  await page.route("**/documents/*", async (route) => {
    if (route.request().method() === "PUT") await pendingUpload;
    if (
      route.request().method() === "PUT" &&
      decodeURIComponent(route.request().headers()["x-file-name"] ?? "") ===
        "失败后重试.png" &&
      fail
    ) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "网络繁忙，请重试" }),
      });
    } else await route.continue();
  });
  await page.getByLabel("选择照片或文件").setInputFiles([
    { name: "已完成.png", mimeType: "image/png", buffer: png },
    { name: "失败后重试.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("button", { name: "上传 2 份资料" }).click();
  const progress = page.getByRole("progressbar", {
    name: "已完成.png上传进度",
  });
  await expect(progress).toBeVisible();
  await expect(progress.locator("svg.ant-progress-circle")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加照片或文件", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: `.local/document-upload-${browserName}.png` });
  releaseUpload();
  await expect(page.getByText("网络繁忙，请重试")).toBeVisible();
  await page.getByRole("button", { name: "重试未完成的文件" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看已完成.png", exact: true }),
  ).toHaveCount(1);
  const uploaded = (await account.request(`/trips/${tripId}/data`)).documents;
  expect(uploaded).toHaveLength(2);
  expect(
    uploaded.every(
      (d: any) => d.category === "旅行保险" && d.owner_id === null,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "上传旅行资料", exact: true }).click();
  await page.getByRole("combobox", { name: "资料分类", exact: true }).click();
  await expect(
    page.locator(".ant-select-item-option").filter({ hasText: /^旅行保险$/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page.getByRole("button", { name: "上传旅行资料", exact: true }).click();
  const category = page.getByRole("combobox", {
    name: "资料分类",
    exact: true,
  });
  await category.click();
  await expect(
    page.locator(".ant-select-item-option").filter({ hasText: /^旅行保险$/ }),
  ).toBeVisible();
  await page
    .locator(".ant-select-item-option")
    .filter({ hasText: /^旅行保险$/ })
    .click();
  await expect(page.locator(".category-field .ant-select")).toContainText(
    "旅行保险",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "账本", exact: true }).click();
  await page.getByRole("button", { name: "新增支出" }).click();
  const switchCurrency = page.getByRole("button", {
    name: "当前币种：欧元，切换为人民币",
    exact: true,
  });
  await expect(switchCurrency).toBeVisible();
  await switchCurrency.click();
  await page
    .getByRole("button", { name: "当前币种：人民币，切换为欧元", exact: true })
    .click();
  await expect(switchCurrency).toBeVisible();
  await expect(page.getByLabel("搜索币种")).toHaveCount(0);
  await page.getByLabel("金额", { exact: true }).fill("300");
  await page.getByLabel("支出名称", { exact: true }).fill("午餐");
  await page.getByRole("button", { name: "保存支出", exact: true }).click();
  await page.getByRole("button", { name: "欧元", exact: true }).click();
  await expect(page.getByText("午餐", { exact: true })).toBeVisible();
});
test("目的地搜索、多城市保存和跨时区航班时间", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register();
  await login(page, account);
  await page.getByRole("button", { name: "创建行程", exact: true }).click();
  await page.getByLabel("搜索目的地", { exact: true }).fill("东京");
  await page.getByRole("button", { name: "搜索目的地结果" }).click();
  await page.getByRole("button", { name: /东京/ }).first().click();
  await page.getByRole("button", { name: "＋ 添加其他目的地" }).click();
  await page.getByLabel("搜索目的地", { exact: true }).fill("曼谷");
  await page.getByRole("button", { name: "搜索目的地结果" }).click();
  await page.getByRole("button", { name: /曼谷/ }).first().click();
  await page.getByLabel("出发日期", { exact: true }).fill("2030-06-01");
  await page.getByLabel("返回日期", { exact: true }).fill("2030-06-07");
  await expect(
    page.getByText("使用日元 · 东京 · 日本", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `.local/simple-trip-${browserName}.png` });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建行程", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "还没有行程安排" }),
  ).toBeVisible();
  const trip = (await account.request("/bootstrap")).trips[0];
  expect(trip.destinations).toHaveLength(2);
  expect(trip.currency).toBe("JPY");
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.getByRole("button", { name: "添加安排", exact: true }).click();
  await page.getByRole("button", { name: "航班", exact: true }).click();
  await page.getByLabel("安排名称", { exact: true }).fill("上海 → 东京");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await chooseTime(page, "起飞时间", "09", "00");
  await page.getByRole("switch", { name: "时间段" }).click();
  await chooseTime(page, "落地时间", "12", "00");
  await chooseZone(page, "当地时间", "北京 · 中国");
  await chooseZone(page, "到达地当地时间", "东京 · 日本");
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "添加航班", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const event = (await account.request(`/trips/${trip.id}/data`)).events[0];
  expect(event.start).toBe("2030-06-01T01:00:00.000Z");
  expect(event.end).toBe("2030-06-01T03:00:00.000Z");
  expect(event.title).toBe("上海 → 东京");
});
