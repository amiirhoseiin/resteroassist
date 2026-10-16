import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

test.describe("Full Live Shift Operations: Waiter -> KDS -> Cashier Loop", () => {
  test("Complete Order-to-Cash Workflow with Concurrency, Cooking Lock, and 10% VAT", async ({
    page,
  }) => {
    // -------------------------------------------------------------
    // PHASE 1: Waiter takes order at Table 4
    // -------------------------------------------------------------
    await page.goto("/login");
    await page.getByText("امیرحسین رضایی").click();
    await page.waitForURL("/pos");

    // Open Table 4 Order Drawer
    await page.getByText("میز ۴").click();
    await expect(page.getByRole("heading", { name: "سفارش میز ۴" })).toBeVisible();

    // Verify AI Scratchpad is ready
    await expect(page.getByText("ثبت سریع سفارش با هوش مصنوعی")).toBeVisible();

    // -------------------------------------------------------------
    // PHASE 2: Cooking Lock Invariant Test (DB Kernel & RPC)
    // -------------------------------------------------------------
    const waiterClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await waiterClient.auth.signInWithPassword({
      email: "amir@roohi.ir",
      password: "Password123!",
    });

    // Add a new item for test: Doogh Mahalli Koozeei
    const addRes = await waiterClient.rpc("rpc_add_order_item", {
      p_order_id: "11111111-5555-1111-1111-000000000004",
      p_menu_item_id: "11111111-4444-1111-1111-000000000004",
      p_quantity: 1,
      p_notes: "تست قفل پخت آشپزخانه",
    });
    expect(addRes.error).toBeNull();
    const testItemId = addRes.data.id;

    // Kitchen logs in and transitions item to 'preparing'
    const kitchenClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await kitchenClient.auth.signInWithPassword({
      email: "hassan@roohi.ir",
      password: "Password123!",
    });

    const prepRes = await kitchenClient.rpc("rpc_update_item_status", {
      p_item_id: testItemId,
      p_new_status: "preparing",
      p_expected_version: 1,
    });
    expect(prepRes.error).toBeNull();
    expect(prepRes.data.status).toBe("preparing");

    // NOW: Waiter attempts to unilaterally cancel the preparing item!
    const cancelRes = await waiterClient.rpc("rpc_cancel_order_item", {
      p_item_id: testItemId,
      p_reason: "مشتری پشیمان شد",
      p_expected_version: prepRes.data.version,
    });

    // The Cooking Lock MUST reject the cancellation!
    expect(cancelRes.error).not.toBeNull();
    expect(cancelRes.error?.message).toContain("Kitchen has already started cooking");

    // Kitchen marks item as ready
    const readyRes = await kitchenClient.rpc("rpc_update_item_status", {
      p_item_id: testItemId,
      p_new_status: "ready",
      p_expected_version: prepRes.data.version,
    });
    expect(readyRes.error).toBeNull();
    expect(readyRes.data.status).toBe("ready");

    // -------------------------------------------------------------
    // PHASE 3: Cashier views bill, applies discount & calculates 10% VAT
    // -------------------------------------------------------------
    // Navigate to Cashier as Sara Kazemi
    await page.goto("/login");
    await page.getByText("سارا کاظمی").click();
    await page.waitForURL("/cashier");


    // Verify Cashier UI elements
    await expect(page.getByRole("heading", { name: "صندوق و تسویه" })).toBeVisible();
    await expect(page.getByText("مالیات بر ارزش افزوده (۱۰٪)")).toBeVisible();

    // Verify Table 12 is in settling queue (from seed data)
    await expect(page.getByText("میز ۱۲").first()).toBeVisible();
    await page.getByText("میز ۱۲").first().click();


    // Verify calculated bill for Table 12
    await expect(page.getByText("صورت‌حساب میز ۱۲")).toBeVisible();

    // Settle Order for Table 12 via Cashier RPC
    const cashierClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await cashierClient.auth.signInWithPassword({
      email: "sara@roohi.ir",
      password: "Password123!",
    });

    const settleRes = await cashierClient.rpc("rpc_settle_order", {
      p_order_id: "11111111-5555-1111-1111-000000000012",
      p_discount_toman: 50000,
    });

    expect(settleRes.error).toBeNull();
    expect(settleRes.data.order_id).toBe("11111111-5555-1111-1111-000000000012");
    expect(settleRes.data.status).toBe("paid");

    // Verify statutory VAT calculation:
    // Subtotal = (2 * 510,000) + (2 * 65,000) + (1 * 120,000) = 1,020,000 + 130,000 + 120,000 = 1,270,000
    // Discount = 50,000
    // Net = 1,220,000
    // VAT 10% = 122,000
    // Grand Total = 1,342,000
    expect(settleRes.data.subtotal_toman).toBe(1270000);
    expect(settleRes.data.discount_toman).toBe(50000);
    expect(settleRes.data.vat_toman).toBe(122000);
    expect(settleRes.data.grand_total_toman).toBe(1342000);

    // Refresh Cashier page and verify Table 12 moved to Paid Orders
    await page.reload();
    await expect(page.getByText("فاکتورهای تسویه شده شیفت")).toBeVisible();
  });
});
