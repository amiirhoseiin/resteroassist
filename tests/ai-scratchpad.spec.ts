import { test, expect } from "@playwright/test";

test.describe("AI Smart Scratchpad: conversational Persian parsing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByText("امیرحسین رضایی").click();
    await page.waitForURL("/pos");
    await page.getByText("میز ۴").click();
    await expect(page.getByRole("heading", { name: "سفارش میز ۴" })).toBeVisible();
  });

  test("multi-item note: correct quantities, scoped notes, and clean confirm", async ({ page }) => {
    await page
      .locator("textarea")
      .first()
      .fill(
        "دو تا کباب لقمه زعفرانی با کره اضافه و یه دوغ محلی کوزه‌ای بدون نعنا و یه ته‌چین مرغ و بادمجان"
      );

    await page.getByRole("button", { name: "شناسایی هوشمند اقلام" }).click();

    const modal = page.getByTestId("ai-preview-modal");
    await expect(modal).toBeVisible();

    const rows = modal.getByTestId("ai-preview-item");
    await expect(rows).toHaveCount(3);

    // تعداد و یادداشت هر قلم باید به خودش تعلق داشته باشد
    const kebabRow = rows.filter({ hasText: "کباب لقمه" });
    await expect(kebabRow.getByTestId("ai-qty")).toHaveText("۲ پرس");
    await expect(kebabRow.getByTestId("ai-note")).toHaveValue("کره اضافه");

    const dooghRow = rows.filter({ hasText: "دوغ محلی" });
    await expect(dooghRow.getByTestId("ai-qty")).toHaveText("۱ پرس");
    await expect(dooghRow.getByTestId("ai-note")).toHaveValue("بدون نعنا");

    // یادداشت نباید به اقلام دیگر سرایت کند
    const tahchinRow = rows.filter({ hasText: "بادمجان" });
    await expect(tahchinRow.getByTestId("ai-note")).toHaveValue("");

    // هیچ بخشی از یادداشت نباید بی‌صدا حذف شود
    await expect(modal.getByTestId("ai-unmatched")).toHaveCount(0);

    await modal.getByRole("button", { name: "تأیید و ثبت در سفارش میز" }).click();

    await expect(page.getByTestId("ai-preview-modal")).toHaveCount(0);
    // یادداشت قلم تازه باید روی صورت‌حساب میز ۴ دیده شود
    // (.first برای اجراهای تکراری روی دیتابیس تمیزشده‌نشده که چند قلم با همین یادداشت دارند)
    await expect(page.getByText("بدون نعنا", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("unmatched words are surfaced instead of being silently dropped", async ({ page }) => {
    await page
      .locator("textarea")
      .first()
      .fill("یه ته‌چین مرغ و بادمجان و سه تا پرس جوجه کباب");

    await page.getByRole("button", { name: "شناسایی هوشمند اقلام" }).click();

    const modal = page.getByTestId("ai-preview-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("ai-preview-item")).toHaveCount(1);
    await expect(modal.getByTestId("ai-unmatched")).toContainText("جوجه کباب");

    await modal.getByRole("button", { name: "انصراف" }).click();
    await expect(page.getByTestId("ai-preview-modal")).toHaveCount(0);
  });
});
