import { expect, type Page } from "@playwright/test";
// 滚轮式选择器(antd-mobile):点击输入框打开底部弹层,点滚轮项选中,点「确定」提交。
async function openWheel(page: Page, label: string) {
  const trigger = page.getByRole("button", { name: label, exact: true });
  await trigger.click();
  const popup = page
    .locator(".adm-picker-popup:not(.adm-popup-closed) .adm-popup-body")
    .locator("visible=true");
  // 等待滑入动画结束:transform 归零后滚轮才可交互。
  await expect(popup).toHaveAttribute(
    "style",
    /transform: translate\(0px, 0%\)|translate\(0px,0%\)/,
    { timeout: 5000 },
  );
  return popup;
}
export async function chooseTime(
  page: Page,
  label: string,
  hour: string,
  minute: string,
) {
  const popup = await openWheel(page, label);
  const columns = popup.locator(".adm-picker-view-column-wheel");
  // 5 列:年/月/日/时/分。滚轮项点击即选中;连点间等弹簧动画稳定。
  await clickWheelItem(columns.nth(3), hour);
  await page.waitForTimeout(300);
  const hourActive = await columns
    .nth(3)
    .locator(".adm-picker-view-column-item-active .adm-picker-view-column-item-label")
    .textContent();
  await clickWheelItem(columns.nth(4), minute);
  await page.waitForTimeout(300);
  const minuteActive = await columns
    .nth(4)
    .locator(".adm-picker-view-column-item-active .adm-picker-view-column-item-label")
    .textContent();
  if (hourActive !== hour.padStart(2, "0") || minuteActive !== minute.padStart(2, "0")) {
    throw new Error(`滚轮选中异常: 时=${hourActive} 分=${minuteActive}`);
  }
  await confirmWheel(page, popup);
}
export async function chooseDate(
  page: Page,
  label: string,
  date: string,
) {
  const popup = await openWheel(page, label);
  const columns = popup.locator(".adm-picker-view-column-wheel");
  const [year, month, day] = date.split("-");
  await clickWheelItem(columns.nth(0), String(Number(year)));
  await page.waitForTimeout(100);
  await clickWheelItem(columns.nth(1), String(Number(month)));
  await page.waitForTimeout(100);
  await clickWheelItem(columns.nth(2), String(Number(day)));
  await page.waitForTimeout(100);
  await confirmWheel(page, popup);
}
async function clickWheelItem(
  column: ReturnType<Page["locator"]>,
  text: string,
) {
  // 滚轮容器的 touch 手势会 preventDefault 吞掉合成 tap 的 click,
  // 直接派发 DOM click 走 React onClick 选择目标项。
  await column
    .getByText(text, { exact: true })
    .evaluate((el) => (el as HTMLElement).click());
}
async function confirmWheel(page: Page, popup: ReturnType<Page["locator"]>) {
  await popup.getByRole("button", { name: "确定" }).click();
  await expect(popup).toBeHidden({ timeout: 5000 });
}
export async function chooseZone(page: Page, label: string, name: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await expect(input).toHaveAttribute("readonly", "");
  await input.click();
  const dropdown = page.locator(".ant-select-dropdown:visible");
  const option = dropdown
    .locator(".ant-select-item-option")
    .filter({ hasText: name });
  for (let i = 0; i < 30 && !(await option.count()); i++) {
    await dropdown
      .locator(".ant-select-dropdown-list-holder")
      .evaluate((el) => {
        el.scrollTop += 160;
      });
    await page.waitForTimeout(30);
  }
  await option.click();
}
