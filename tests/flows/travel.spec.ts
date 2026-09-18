import { test, expect } from "@playwright/test";
import { Client, createTrip, png, tripInput } from "../support/api";
import { mkdir } from "node:fs/promises";
test("从注册到行程、文件、账本、证件和重新登录", async ({
  page,
  browserName,
}) => {
  const email = `ui${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}@example.test`,
    password = `Pw-${crypto.randomUUID()}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "注册新账号" }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await expect(page.getByLabel("昵称", { exact: true })).toHaveCount(0);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByRole("heading", { name: "还没有行程" })).toBeVisible();
  await page.getByRole("button", { name: "创建行程", exact: true }).click();
  await page
    .getByLabel("行程名称（选填）", { exact: true })
    .fill("周末城市旅行");
  await page.getByLabel("出发日期", { exact: true }).fill("2030-06-01");
  await page.getByLabel("返回日期", { exact: true }).fill("2030-06-10");
  await page.getByRole("button", { name: "目的地", exact: true }).click();
  await page.getByRole("button", { name: "巴黎 · 法国", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建行程", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "还没有行程事项" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.getByRole("button", { name: "添加事项", exact: true }).click();
  await page.getByRole("button", { name: "航班", exact: true }).click();
  await page.getByLabel("事项名称", { exact: true }).fill("城市间航班");
  await page.getByText("补充说明（选填）", { exact: true }).click();
  await page.getByLabel("说明", { exact: true }).fill("提前到达机场办理登机");
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "添加航班", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "现在", exact: true }).click();
  await expect(page.getByRole("heading", { name: "城市间航班" })).toBeVisible();

  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page.getByRole("button", { name: "上传旅行资料", exact: true }).click();
  await page.getByLabel("选择照片或文件", { exact: true }).setInputFiles({
    name: "测试机票.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByLabel("资料分类", { exact: true }).fill("交通");
  await page.getByText("交通", { exact: true }).last().click();
  await page
    .getByRole("button", { name: "上传 1 份资料", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看测试机票.png", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "行程", exact: true }).click();
  await page.getByRole("button", { name: /第 1 天/ }).click();
  await page
    .getByRole("button", { name: /城市间航班.*查看详情与资料/ })
    .click();
  await page.getByRole("button", { name: "关联资料", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "关联资料", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存修改", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一步", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByLabel("测试机票.png", { exact: true }).check();
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /准备清单.*出发前/ }).click();
  await page.getByRole("button", { name: "添加准备事项" }).click();
  await page.getByLabel("准备事项", { exact: true }).fill("携带雨伞");
  await page.getByLabel("保存后继续添加").uncheck();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "添加准备事项", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "携带雨伞" }).click();
  await expect(page.getByRole("checkbox", { name: "携带雨伞" })).toBeChecked();
  await page.getByRole("button", { name: "账本", exact: true }).click();
  await page.getByRole("button", { name: "新增支出" }).click();
  await page.getByLabel("金额", { exact: true }).fill("123.45");
  await page.getByLabel("支出名称", { exact: true }).fill("午餐");
  await page.getByLabel("上传支出资料").setInputFiles({
    name: "餐费凭证.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("button", { name: "查看餐费凭证.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存支出", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "欧元", exact: true }).click();
  await expect(page.getByText("午餐", { exact: true })).toBeVisible();
  await page.getByText("午餐", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看餐费凭证.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看餐费凭证.png" }).click();
  await expect(
    page.getByRole("dialog").last().getByRole("img", { name: "餐费凭证.png" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "编辑个人资料" }).click();
  await page.getByText("证件信息（选填，仅自己可见）", { exact: true }).click();
  await page.getByLabel("英文姓名", { exact: true }).fill("Test Traveller");
  await page.getByLabel("护照号码", { exact: true }).fill("TEST-DOCUMENT");
  await page.getByRole("button", { name: "保存个人资料" }).click();
  await page.getByRole("button", { name: "显示证件", exact: true }).click();
  await expect(page.getByText("TEST-DOCUMENT", { exact: true })).toBeVisible();
  await page.getByLabel("上传个人证件", { exact: true }).setInputFiles({
    name: "个人测试文件.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("button", { name: "查看个人测试文件.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /我的行程.*创建/ }).click();
  await page.getByRole("button", { name: "管理行程：周末城市旅行" }).click();
  await page.getByRole("button", { name: "生成同行邀请" }).click();
  await expect(page.getByLabel("同行邀请口令")).toHaveValue(/^[A-HJ-NP-Z]{6}$/);
  await page.getByRole("button", { name: "返回我的行程", exact: true }).click();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "现在", exact: true }).click();
  await mkdir(".local/screenshots", { recursive: true });
  for (const width of [320, 375, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `.local/screenshots/multi-user-${browserName}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "退出当前身份" }).click();
  await page.getByRole("button", { name: "确认退出" }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "城市间航班" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("资料预览改名失败保留输入，保存后按新名称搜索并持久保存", async ({
  page,
}) => {
  const account = await new Client().register();
  const trip = await createTrip(account),
    id = crypto.randomUUID();
  await account.upload(`/trips/${trip}/documents/${id}`);
  await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page
    .getByRole("button", { name: "查看测试图片.png", exact: true })
    .click();
  await page.getByRole("button", { name: "修改名称", exact: true }).click();
  await expect(page.getByLabel("资料名称", { exact: true })).toHaveValue(
    "测试图片.png",
  );
  await page.getByLabel("资料名称", { exact: true }).fill("东京酒店入住凭证");
  let fail = true;
  await page.route("**/documents/*", async (route) => {
    if (route.request().method() === "PATCH" && fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: { error: "保存暂时失败，请重试" },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "保存暂时失败" }),
  ).toBeVisible();
  await expect(page.getByLabel("资料名称", { exact: true })).toHaveValue(
    "东京酒店入住凭证",
  );
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "东京酒店入住凭证", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByLabel("搜索文件").fill("入住凭证");
  await expect(
    page.getByRole("button", { name: "查看东京酒店入住凭证", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "资料", exact: true }).click();
  await page.getByLabel("搜索文件").fill("入住凭证");
  await expect(
    page.getByRole("button", { name: "查看东京酒店入住凭证", exact: true }),
  ).toBeVisible();
});
