import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Client, createTrip, eventInput } from "../support/api";

// 底图服务（OpenFreeMap）会对自定义请求头触发 CORS 预检，
// 这里清空通用请求头，避免本地验证被跨域预检拦截。
test.use({ extraHTTPHeaders: {} });

const shanghai = {
  id: "place-shanghai",
  name: "上海",
  address: "上海市",
  latitude: 31.2304,
  longitude: 121.4737,
  countryCode: "cn",
  provider: "geoapify" as const,
};
const tokyo = {
  id: "place-tokyo",
  name: "东京",
  address: "日本东京",
  latitude: 35.6762,
  longitude: 139.6503,
  countryCode: "jp",
  provider: "geoapify" as const,
};
const kyoto = {
  id: "place-kyoto",
  name: "京都",
  address: "日本京都",
  latitude: 35.0116,
  longitude: 135.7681,
  countryCode: "jp",
  provider: "geoapify" as const,
};

test("路线图展示站点与缺坐标提示，并生成行程海报", async ({
  page,
  browserName,
}) => {
  const owner = await new Client().register();
  const trip = await createTrip(owner);
  await owner.request(`/trips/${trip}/events`, "POST", {
    ...eventInput,
    title: "上海飞东京",
    start: "2030-06-01T09:00:00+08:00",
    end: "2030-06-01T13:00:00+09:00",
    timezone: "Asia/Shanghai",
    endTimezone: "Asia/Tokyo",
    departureLocation: shanghai,
    location: tokyo,
  });
  await owner.request(`/trips/${trip}/events`, "POST", {
    ...eventInput,
    title: "京都散步",
    kind: "explore",
    start: "2030-06-03T09:00:00+09:00",
    end: "2030-06-03T12:00:00+09:00",
    timezone: "Asia/Tokyo",
    departureLocation: null,
    location: kyoto,
  });
  await owner.request(`/trips/${trip}/events`, "POST", {
    ...eventInput,
    title: "待定活动",
    kind: "explore",
    start: "2030-06-04T09:00:00+09:00",
    end: "2030-06-04T10:00:00+09:00",
    timezone: "Asia/Tokyo",
    departureLocation: null,
    location: null,
  });

  const issues: string[] = [];
  page.on("pageerror", (error) => issues.push(error.message));
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(owner.email);
  await page.getByLabel("密码", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "行程", exact: true }).click();

  // 320px 下标题行新增地图入口后仍不溢出，且加号仍与标题垂直对齐。
  await page.setViewportSize({ width: 320, height: 844 });
  const heading = page.getByRole("heading", { name: "完整行程", exact: true });
  const addButton = page.getByRole("button", { name: "添加安排", exact: true });
  const h = await heading.boundingBox(),
    b = await addButton.boundingBox();
  expect(b!.x).toBeGreaterThan(h!.x);
  expect(Math.abs(b!.y + b!.height / 2 - (h!.y + h!.height / 2))).toBeLessThan(
    12,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole("button", { name: "查看路线图", exact: true }).click();

  const mapDialog = page.getByRole("dialog");
  await expect(
    mapDialog.getByRole("heading", { name: "行程路线" }),
  ).toBeVisible();
  const canvas = mapDialog.locator(".route-map-canvas");
  await expect(canvas).toHaveAttribute("data-map-ready", "true", {
    timeout: 30000,
  });
  // 查看状态：每个地点一个圆点加地名，线段上有交通工具贴纸。
  await expect(canvas).toHaveAttribute("data-visible-stops", "3");
  await expect(canvas).not.toHaveAttribute("data-visible-stickers", "0");
  await expect(mapDialog.getByText("1 项安排没有坐标")).toBeVisible();
  await mapDialog.getByRole("button", { name: /1 项安排没有坐标/ }).click();
  await expect(mapDialog.getByText("待定活动")).toBeVisible();

  // 按日期只看某一天：只保留当天线段与两端站点，并缩放到当天范围。
  await mapDialog.locator(".route-day-filter button").nth(2).click();
  await expect(canvas).toHaveAttribute("data-visible-stops", "2");
  await mapDialog.getByRole("button", { name: "全程", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-visible-stops", "3");

  // 播放：逐段前进，可中途停止；播放中只有移动的载具贴纸。
  await mapDialog.getByRole("button", { name: "播放路线" }).click();
  await expect(canvas).toHaveAttribute("data-map-playing", "true");
  await expect(mapDialog.locator(".route-runner")).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-visible-stickers", "0");
  // 播放期间隐藏全部控件，录屏画面只留地图；点屏幕恢复控件后才能停止。
  await expect(mapDialog.locator(".sheet-header")).toBeHidden();
  await expect(mapDialog.locator(".route-day-filter")).toBeHidden();
  await expect(mapDialog.locator(".route-play")).toBeHidden();
  await page.waitForTimeout(1200);
  await mapDialog.locator(".route-immersive-catch").click();
  await expect(mapDialog.locator(".route-play")).toBeVisible();
  await mapDialog.getByRole("button", { name: "停止播放" }).click();
  await expect(canvas).toHaveAttribute("data-map-playing", "false");
  await expect(mapDialog.locator(".route-runner")).toHaveCount(0);
  await expect(mapDialog.locator(".sheet-header")).toBeVisible();
  await expect(canvas).not.toHaveAttribute("data-visible-stickers", "0");
  await page.screenshot({ path: `.local/route-map-${browserName}.png` });

  await mapDialog.getByRole("button", { name: "生成海报" }).click();
  await expect(page.getByRole("heading", { name: "行程海报" })).toBeVisible();
  await expect(page.locator(".poster")).toBeVisible();
  await expect(page.locator(".poster-title")).toHaveText(/测试旅行/);
  const generate = page.getByRole("button", { name: "保存 / 分享海报" });
  await expect(generate).toBeEnabled({ timeout: 40000 });
  const download = page
    .waitForEvent("download", { timeout: 40000 })
    .catch(() => null);
  await generate.click();
  await expect(page.getByText(/海报已保存为图片|海报已分享/)).toBeVisible({
    timeout: 40000,
  });
  if (browserName === "chromium") {
    const file = await download;
    const path = file && (await file.path());
    if (path) {
      const buffer = await readFile(path);
      expect(buffer.readUInt32BE(16)).toBe(1080);
      expect(buffer.readUInt32BE(20)).toBe(1920);
    }
  }
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `.local/trip-poster-${browserName}.png` });
  await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /我的行程.*创建/ }).click();
  await page.getByRole("button", { name: "管理行程：测试旅行" }).click();
  await page.getByRole("button", { name: /生成行程海报/ }).click();
  await expect(page.getByRole("heading", { name: "行程海报" })).toBeVisible();
  await expect(page.locator(".poster-title")).toHaveText(/测试旅行/);
  await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();

  // WebKit 会把 MapLibre 内部 ResizeObserver 的良性提示当成 pageerror，这里忽略。
  expect(issues.filter((issue) => !/ResizeObserver loop/.test(issue))).toEqual(
    [],
  );
});
