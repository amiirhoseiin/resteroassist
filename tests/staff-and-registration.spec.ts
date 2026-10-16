import { test, expect } from "@playwright/test";

test.describe("Restaurant Registration & Staff Hiring Operations", () => {
  test("Manager can hire a new staff member and newly hired staff can login", async ({
    page,
  }) => {
    // 1. Clear session and login as Roohi Manager (Reza Mohammadi)
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: /رضا محمدی/ }).click();
    await page.waitForURL("/pos");

    // 2. Navigate to Staff Management page
    await page.getByRole("link", { name: /پرسنل و استخدام/ }).click();
    await page.waitForURL("/staff");

    await expect(page.getByText("مدیریت پرسنل و استخدام همکاران مجموعه")).toBeVisible();

    // 3. Open Hire Staff Modal
    await page.getByRole("button", { name: /استخدام پرسنل جدید/ }).click();
    await expect(page.getByText("استخدام پرسنل جدید برای این رستوران")).toBeVisible();

    // 4. Fill in new staff details
    const timestamp = Date.now().toString().slice(-4);
    const uniqueName = `پویا رضوانی ${timestamp}`;
    const uniqueEmail = `pouya_${Date.now()}@roohi.ir`;
    await page.getByPlaceholder("مثال: پویا رضوانی").fill(uniqueName);
    await page.getByPlaceholder("pouya@roohi.ir").fill(uniqueEmail);
    await page.getByPlaceholder("حداقل ۶ کاراکتر").fill("Password123!");

    // 5. Submit Hire Form
    await page.getByRole("button", { name: "تایید و استخدام" }).click();

    // 6. Verify success banner and new staff card appears
    await expect(page.getByText(`پرسنل جدید «${uniqueName}» با موفقیت افزوده شد`)).toBeVisible();
    await expect(page.getByRole("heading", { name: uniqueName })).toBeVisible();

    // 7. Verify new staff member can login
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByPlaceholder("name@roohi.ir").fill(uniqueEmail);
    await page.getByPlaceholder("••••••••").fill("Password123!");
    await page.getByRole("button", { name: "ورود به سامانه" }).click();

    // Should redirect to /pos as a waiter
    await page.waitForURL("/pos");
    await expect(page.getByText("کافه رستوران روحی")).toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();

  });

  test("New restaurant owner can register a restaurant and access isolated dashboard", async ({
    page,
  }) => {
    // 1. Clear cookies and visit Registration Page
    await page.context().clearCookies();
    await page.goto("/register");
    await expect(page.getByText("افتتاح شعبه و عضویت در رسترو اسیست")).toBeVisible();

    // 2. Fill in registration form
    const timestamp = Date.now();
    const testRestName = `کافه رستوران باران ${timestamp}`;
    const testOwnerEmail = `baran_${timestamp}@baran.ir`;

    await page.getByPlaceholder("مثال: کافه رستوران بامداد").fill(testRestName);
    await page.getByPlaceholder("مثال: شعبه فرمانیه").fill("شعبه نیاوران");
    await page.getByPlaceholder("مثال: آرش پرتو").fill("فرزاد رستمی");
    await page.getByPlaceholder("owner@bamdad.ir").fill(testOwnerEmail);
    await page.getByPlaceholder("حداقل ۶ کاراکتر").fill("Password123!");

    // 3. Submit
    await page.getByRole("button", { name: "افتتاح و شروع کار در سامانه" }).click();

    // 4. Verify onboarding success message
    await expect(page.getByText("با موفقیت راه‌اندازی شد!")).toBeVisible();

    // 5. Redirects to dashboard
    await page.waitForURL("/pos", { timeout: 15000 });
    await expect(page.getByText(testRestName)).toBeVisible();
    await expect(page.getByText("شعبه نیاوران")).toBeVisible();
    await expect(page.getByText("فرزاد رستمی")).toBeVisible();
  });
});
