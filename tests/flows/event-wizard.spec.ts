import { chooseTime, chooseZone } from "../support/event-controls";
import { test, expect } from "@playwright/test";
import { Client, createTrip, png } from "../support/api";
const paris = {
  id: "test-paris",
  name: "埃菲尔铁塔",
  address: "Paris, France",
  latitude: 48.8584,
  longitude: 2.2945,
  countryCode: "fr",
  provider: "geoapify",
};
test("四步录入保留草稿、分钟时间与浮层选择、地点搜索和资料上传", async ({
  page,
  browserName,
}) => {
  const account = await new Client().register(),
    id = await createTrip(account);
  let searches = 0;
  let releaseSearch!: () => void;
  const pendingSearch = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  await page.route("**/api/places?*", async (route) => {
    if (++searches === 1) {
      await pendingSearch;
      await route.fulfill({
        status: 503,
        json: { error: "地点搜索暂时失败，请重试" },
      });
    } else await route.fulfill({ json: { places: [paris] } });
  });
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.getByRole("button", { name: "添加安排", exact: true }).click();
  await expect(page.locator(".entry-step")).toHaveCount(0);
  await expect(page.getByText("安排已确认", { exact: true })).toHaveCount(0);
  await page.getByLabel("活动名称").fill("午后参观");
  const next = () =>
    page.getByRole("button", { name: "下一步", exact: true }).click();
  await next();
  await chooseTime(page, "开始时间", "09", "17");
  await page.getByRole("switch", { name: "时间段", exact: true }).click();
  await chooseTime(page, "结束时间", "10", "42");
  const dialog = page.getByRole("dialog");
  const height = (await dialog.boundingBox())!.height;
  await chooseZone(page, "当地时间", "北京 · 中国");
  expect((await dialog.boundingBox())!.height).toBeCloseTo(height, 0);
  await chooseZone(page, "到达地当地时间", "北京 · 中国");
  await page.screenshot({ path: `.local/wizard-time-${browserName}.png` });
  await page.getByRole("switch", { name: "时间段", exact: true }).click();
  await page.getByRole("switch", { name: "时间段", exact: true }).click();
  await expect(page.getByLabel("结束时间", { exact: true })).toHaveValue(
    "10:42",
  );
  await next();
  await page.getByLabel("搜索地点", { exact: true }).fill("巴黎 铁塔");
  await page.getByRole("button", { name: "搜索地点结果" }).click();
  const searchButton = page.getByRole("button", { name: "搜索地点结果" });
  await expect(searchButton).toBeDisabled();
  await expect(searchButton).toHaveAttribute("aria-busy", "true");
  await expect(searchButton.locator(".place-search-spinner")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(searchButton.locator(".place-search-spinner")).toHaveCSS(
    "animation-name",
    "place-search-spin",
  );
  releaseSearch();

  await expect(
    page.getByRole("alert").filter({ hasText: "地点搜索暂时失败" }),
  ).toBeVisible();
  await expect(page.getByLabel("搜索地点", { exact: true })).toHaveValue(
    "巴黎 铁塔",
  );
  await page.getByRole("button", { name: "搜索地点结果" }).click();
  await page.getByRole("button", { name: /埃菲尔铁塔.*Paris/ }).click();
  await next();
  await page.getByRole("button", { name: "上传并关联资料" }).click();
  await page.getByRole("combobox", { name: "资料分类" }).fill("景点门票");
  await page.getByText("新建分类「景点门票」", { exact: true }).click();
  await page.getByLabel("选择照片或文件").setInputFiles({
    name: "参观凭证.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "上传 1 份资料" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", { name: "参观凭证.png" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "上传并关联资料" }).click();
  const uploadDialog = page.getByRole("dialog", {
    name: "上传旅行资料",
    exact: true,
  });
  await uploadDialog.getByRole("combobox", { name: "资料分类" }).click();
  await expect(
    uploadDialog
      .locator(".ant-select-item-option")
      .filter({ hasText: /^景点门票$/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await uploadDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({ path: `.local/wizard-documents-${browserName}.png` });
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(page.getByLabel("活动名称")).toHaveValue("午后参观");
  await next();
  await expect(page.getByLabel("开始时间", { exact: true })).toHaveValue(
    "09:17",
  );
  await next();
  await expect(page.getByText("埃菲尔铁塔", { exact: true })).toBeVisible();
  await next();
  await expect(
    page.getByRole("checkbox", { name: "参观凭证.png" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "添加活动", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const event = (await account.request(`/trips/${id}/data`)).events[0];
  expect(event.start).toBe("2030-06-01T01:17:00.000Z");
  expect(event.end).toBe("2030-06-01T02:42:00.000Z");
  expect(event.location).toEqual(paris);
  expect(event.documents).toHaveLength(1);
});
