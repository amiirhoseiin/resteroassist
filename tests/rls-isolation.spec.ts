import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const ROOHI_RESTAURANT_ID = "11111111-1111-1111-1111-111111111111";
const HIZOM_RESTAURANT_ID = "22222222-2222-2222-2222-222222222222";
const HIZOM_ORDER_ID = "22222222-5555-2222-2222-000000000002";
const HIZOM_BURGER_ITEM_ID = "22222222-4444-2222-2222-000000000001";

test.describe("Multi-Tenant RLS Data Isolation Tests", () => {
  test("Database Kernel RLS: Roohi staff cannot read Hizom restaurant orders or tables", async () => {
    // 1. Authenticate as Roohi Waiter
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: "amir@roohi.ir",
      password: "Password123!",
    });

    expect(authError).toBeNull();
    expect(authData.session).toBeDefined();

    // 2. Query own restaurant data - must succeed
    const { data: roohiOrders, error: roohiErr } = await client
      .from("orders")
      .select("*")
      .eq("restaurant_id", ROOHI_RESTAURANT_ID);

    expect(roohiErr).toBeNull();
    expect(roohiOrders).toBeDefined();
    expect(roohiOrders!.length).toBeGreaterThan(0);

    // 3. Attempt to query Hizom data by ID manipulation - RLS must filter to 0 rows
    const { data: hizomOrders, error: hizomErr } = await client
      .from("orders")
      .select("*")
      .eq("restaurant_id", HIZOM_RESTAURANT_ID);

    expect(hizomErr).toBeNull();
    // Strict RLS: query returns empty array, NOT Hizom's orders!
    expect(hizomOrders).toEqual([]);

    // 4. Attempt to query Hizom dining tables - RLS must return 0 rows
    const { data: hizomTables } = await client
      .from("dining_tables")
      .select("*")
      .eq("restaurant_id", HIZOM_RESTAURANT_ID);

    expect(hizomTables).toEqual([]);
  });

  test("RPC Tenant Guard (SECURITY DEFINER self-check): Roohi staff cannot mutate or add items to Hizom orders", async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await client.auth.signInWithPassword({
      email: "amir@roohi.ir",
      password: "Password123!",
    });

    // Attempt to invoke rpc_add_order_item on Hizom's order ID
    const { data, error } = await client.rpc("rpc_add_order_item", {
      p_order_id: HIZOM_ORDER_ID,
      p_menu_item_id: HIZOM_BURGER_ITEM_ID,
      p_quantity: 1,
    });

    // Must be blocked with error
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Order not found in this restaurant");
  });

  test("UI Tenant Isolation: Switch between Roohi and Hizom shows completely distinct branches and menus", async ({
    page,
  }) => {
    // 1. Visit Login Page
    await page.goto("/login");

    // 2. Click One-Click Roohi Waiter
    await page.getByText("امیرحسین رضایی").click();
    await page.waitForURL("/pos");

    // 3. Verify Roohi branding and tables
    await expect(page.getByText("کافه رستوران روحی")).toBeVisible();
    await expect(page.getByText("شعبه باغ فردوس")).toBeVisible();
    await expect(page.getByText("میز ۴")).toBeVisible();
    await expect(page.getByText("میز ۱۲")).toBeVisible();

    // 4. Logout
    await page.locator("button[title='خروج از حساب']").click();
    await page.waitForURL("/login");

    // 5. Click Hizom Manager (Tenant 2)
    await page.getByText("فرهاد رحیمی").click();
    await page.waitForURL("/pos");

    // 6. Verify Hizom branding and separate tables
    await expect(page.getByText("برگر زغالی هیزم")).toBeVisible();
    await expect(page.getByText("شعبه ونک")).toBeVisible();
    await expect(page.getByText("میز ۲")).toBeVisible();
    // Ensure Roohi's Table 12 does NOT exist in Hizom
    await expect(page.getByText("میز ۱۲")).not.toBeVisible();
  });
});

