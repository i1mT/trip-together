import { expect, type Page } from "@playwright/test";
// 日期与时间合并为一个 DatePicker(showTime)：面板内选时分后需点「确定」提交。
export async function chooseTime(
  page: Page,
  label: string,
  hour: string,
  minute: string,
) {
  const input = page.getByLabel(label, { exact: true });
  await expect(input).toHaveAttribute("readonly", "");
  await input.click();
  const picker = page.locator(".ant-picker-dropdown:visible");
  await picker
    .locator(".ant-picker-time-panel-column")
    .nth(0)
    .getByText(hour, { exact: true })
    .click();
  await picker
    .locator(".ant-picker-time-panel-column")
    .nth(1)
    .getByText(minute, { exact: true })
    .click();
  await picker.getByRole("button", { name: /确 定|确定/ }).click();
}
// 只改日期不引入时间（时间保持待定）。
export async function chooseDate(
  page: Page,
  label: string,
  date: string,
) {
  const input = page.getByLabel(label, { exact: true });
  await expect(input).toHaveAttribute("readonly", "");
  await input.click();
  const picker = page.locator(".ant-picker-dropdown:visible");
  const cell = picker.locator(`.ant-picker-cell[title='${date}']`);
  // 目标月份不在当前视图时向后翻页。
  for (let i = 0; i < 48 && !(await cell.isVisible()); i++) {
    await picker.locator(".ant-picker-header-next-btn").first().click();
    await page.waitForTimeout(50);
  }
  // 手机视口下日期面板可能超出屏幕，用 DOM 点击代替视口坐标点击。
  await cell.evaluate((el) => (el as HTMLElement).click());
  await picker
    .getByRole("button", { name: /确 定|确定/ })
    .evaluate((el) => (el as HTMLElement).click());
  await expect(input).toHaveValue(date);
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
