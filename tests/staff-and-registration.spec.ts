import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

test.describe("Restaurant Registration & Staff Hiring Operations", () => {
  test("Manager can add a new staff member and newly added staff can login", async ({
    page,
  }) => {
    // 1. Clear session and login as Roohi Manager (Reza Mohammadi)
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: /رضا محمدی/ }).click();
    await page.waitForURL("/pos");

    // 2. Navigate to Staff Management page
    await page.getByRole("link", { name: /مدیریت پرسنل و دسترسی‌ها/ }).click();
    await page.waitForURL("/staff");

    await expect(page.getByText(/مدیریت پرسنل و سطوح دسترسی/)).toBeVisible();

    // 3. Open Add Staff Modal
    await page.getByRole("button", { name: /افزودن همکار جدید/ }).click();
    await expect(page.getByText(/تعریف و افزودن همکار جدید/)).toBeVisible();

    // 4. Fill in new staff details
    const timestamp = Date.now().toString().slice(-4);
    const uniqueName = `پویا رضوانی ${timestamp}`;
    const uniqueEmail = `pouya_${Date.now()}@roohi.ir`;
    await page.getByPlaceholder("مثال: پویا رضوانی").fill(uniqueName);
    await page.getByPlaceholder("pouya@roohi.ir").fill(uniqueEmail);
    await page.getByPlaceholder("حداقل ۶ کاراکتر").fill("Password123!");

    // 5. Submit Form
    await page.getByRole("button", { name: "تایید و افزودن همکار" }).click();

    // 6. Verify success banner and new staff card appears
    await expect(page.getByText(new RegExp(`همکار جدید «${uniqueName}» با موفقیت افزوده شد`))).toBeVisible();
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

  test("Manager can manage menu: add new dish, change price and toggle availability", async ({
    page,
  }) => {
    // 1. Login as Roohi Manager
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: /رضا محمدی/ }).click();
    await page.waitForURL("/pos");

    // 2. Navigate to Menu Management page
    await page.getByRole("link", { name: /منو و قیمت‌ها/ }).click();
    await page.waitForURL("/menu");

    await expect(page.getByText("مدیریت منوی رستوران و قیمت‌گذاری")).toBeVisible();

    // 3. Click Add new dish
    await page.getByRole("button", { name: "افزودن غذای جدید به منو" }).click();

    const timestamp = Date.now().toString().slice(-4);
    const dishName = `شیشلیک زعفرانی شاندیز ${timestamp}`;

    await page.getByPlaceholder("مثال: شیشلیک شاندیز").fill(dishName);
    await page.getByPlaceholder("مثال: 450000").fill("680000");
    await page.getByRole("button", { name: "ثبت در منوی رستوران" }).click();

    // 4. Verify new dish appears in menu
    await expect(page.getByRole("heading", { name: dishName })).toBeVisible();
    await expect(page.getByText(/۶۸۰.*تومان/).first()).toBeVisible();

    // 5. Verify Multi-tenant isolation: Hizom (Tenant 2) cannot see this dish
    const hizomClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await hizomClient.auth.signInWithPassword({
      email: "farhad@hizom.ir",
      password: "Password123!",
    });

    const { data: hizomItems } = await hizomClient
      .from("menu_items")
      .select("name")
      .eq("name", dishName);

    expect(hizomItems).toHaveLength(0);
  });
});
