/* Security regression battery — migration 20261017000000_security_hardening.sql.
 *
 * Verifies that the adversarial-audit findings (SECURITY_AUDIT_REPORT.md §10) stay closed:
 * deny-matrices, cooking-lock state×role matrix, settle preconditions, paid-invoice
 * immutability (attacked via service role), race-safe order creation, and the
 * server-authoritative item-details path.
 *
 * Usage (LOCAL stack only — this battery MUTATES data; never aim it at a deployment):
 *    npx supabase start
 *    npx supabase db reset
 *    npm run test:security          (or: node scripts/security-probe.cjs)
 * Expected: `23/23 checks passed`, exit code 0.
 */

const { createClient } = require("@supabase/supabase-js");

const URL = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const PASSWORD = "Password123!";

const RID = "11111111-1111-1111-1111-111111111111"; // Roohi restaurant
const ORDER4 = "11111111-5555-1111-1111-000000000004"; // open
const ORDER12 = "11111111-5555-1111-1111-000000000012"; // settling (seed v2)
const ORDER101 = "11111111-5555-1111-1111-000000000101"; // paid
const DOOGH = "11111111-4444-1111-1111-000000000004";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + String(detail).slice(0, 140) : ""}`);
}

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

(async () => {
  const waiter = await signIn("amir@roohi.ir");
  const kitchen = await signIn("hassan@roohi.ir");
  const cashier = await signIn("sara@roohi.ir");
  const manager = await signIn("reza@roohi.ir");
  const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- 1. Direct DML revoked (F-01 / F-02 / F-06) --------------------------
  {
    const { error } = await waiter.from("orders").update({ discount_toman: 999999 }).eq("id", ORDER4).select();
    record("F-01a authenticated direct UPDATE orders denied", !!error, error?.message);
  }
  {
    const { error } = await waiter
      .from("order_items")
      .insert({ order_id: ORDER4, restaurant_id: RID, menu_item_id: DOOGH, quantity: 1, unit_price_toman: 1 })
      .select();
    record("F-01b authenticated direct INSERT order_items denied", !!error, error?.message);
  }
  {
    const { error } = await waiter
      .from("order_events")
      .insert({ restaurant_id: RID, order_id: ORDER4, event_type: "forged", actor_id: "00000000-0000-0000-0000-000000000000" })
      .select();
    record("F-06 authenticated direct INSERT order_events denied", !!error, error?.message);
  }

  // ---- 2. Cooking-lock matrix (F-04 / F-07) --------------------------------
  const { data: fresh, error: addErr } = await waiter.rpc("rpc_add_order_item", {
    p_order_id: ORDER4,
    p_menu_item_id: DOOGH,
    p_quantity: 1,
    p_notes: "security probe item",
  });
  record("setup: rpc_add_order_item (SECURITY DEFINER) works", !addErr && !!fresh, addErr?.message);

  {
    const { error } = await waiter.rpc("rpc_update_item_status", {
      p_item_id: fresh.id,
      p_new_status: "served",
      p_expected_version: fresh.version,
    });
    record("F-04a pending -> served jump rejected", !!error, error?.message);
  }
  {
    const { error } = await waiter.rpc("rpc_update_item_status", {
      p_item_id: fresh.id,
      p_new_status: "cancelled",
      p_expected_version: fresh.version,
    });
    record("F-04b cancel via update_item_status rejected", !!error, error?.message);
  }

  const { data: prep, error: prepErr } = await kitchen.rpc("rpc_update_item_status", {
    p_item_id: fresh.id,
    p_new_status: "preparing",
    p_expected_version: fresh.version,
  });
  record("happy: kitchen pending -> preparing", !prepErr && prep?.status === "preparing", prepErr?.message);

  {
    const { error } = await waiter.rpc("rpc_cancel_order_item", {
      p_item_id: fresh.id,
      p_reason: "probe",
      p_expected_version: prep.version,
    });
    record("F-04c waiter cancel cooking blocked", !!error && /Kitchen has already started cooking/i.test(error.message), error?.message);
  }
  {
    const { error } = await cashier.rpc("rpc_cancel_order_item", {
      p_item_id: fresh.id,
      p_reason: "probe",
      p_expected_version: prep.version,
    });
    record("F-07 cashier cancel cooking blocked", !!error && /Kitchen has already started cooking/i.test(error.message), error?.message);
  }

  const { data: mCancel, error: mCancelErr } = await manager.rpc("rpc_cancel_order_item", {
    p_item_id: fresh.id,
    p_reason: "probe-manager",
    p_expected_version: prep.version,
  });
  record("happy: manager cancel cooking allowed", !mCancelErr && mCancel?.status === "cancelled", mCancelErr?.message);

  {
    const { error } = await waiter.rpc("rpc_update_item_status", {
      p_item_id: fresh.id,
      p_new_status: "preparing",
      p_expected_version: mCancel.version,
    });
    record("F-04d cancelled item cannot be reactivated", !!error, error?.message);
  }

  // ---- 3. Free table discovery + kitchen cannot create orders --------------
  const { data: tables } = await manager.from("dining_tables").select("id").eq("restaurant_id", RID);
  const { data: actives } = await manager.from("orders").select("table_id").in("status", ["open", "settling"]);
  const activeSet = new Set((actives || []).map((o) => o.table_id));
  const freeTable = (tables || []).find((t) => !activeSet.has(t.id));

  if (freeTable) {
    const { error } = await kitchen.rpc("rpc_create_order", { p_table_id: freeTable.id });
    record("F-07b kitchen cannot create orders", !!error && /Kitchen staff cannot create orders/.test(error.message), error?.message);
  } else {
    record("F-07b kitchen cannot create orders", false, "no free table found");
  }

  // ---- 4. Settle preconditions (F-02 / F-14.4) ------------------------------
  const { data: ord4 } = await cashier.from("orders").select("id,status,version").eq("id", ORDER4).single();
  {
    const { error } = await cashier.rpc("rpc_settle_order", { p_order_id: ORDER4, p_expected_version: ord4.version });
    record("F-02a settle from 'open' rejected", !!error && /locked for checkout/i.test(error.message), error?.message);
  }
  {
    const { error } = await cashier.rpc("rpc_settle_order", { p_order_id: ORDER12, p_expected_version: 999 });
    record("F-02b settle with stale version rejected", !!error && /conflict/i.test(error.message), error?.message);
  }
  {
    const { error } = await cashier.rpc("rpc_settle_order", { p_order_id: ORDER12 });
    record("F-02c settle without expected version rejected", !!error && /expected/i.test(error.message), error?.message);
  }

  // ---- 5. Paid immutability — proven via SERVICE ROLE (bypasses RLS+grants) -
  {
    const { error } = await svc.from("orders").update({ discount_toman: 1 }).eq("id", ORDER101).select();
    record("F-03a service-role UPDATE paid order blocked by trigger", !!error && /PAID_ORDER_IMMUTABLE/.test(error.message), error?.message);
  }
  {
    const { error } = await svc
      .from("order_items")
      .insert({ order_id: ORDER101, restaurant_id: RID, menu_item_id: DOOGH, quantity: 1, unit_price_toman: 0 })
      .select();
    record("F-03b service-role INSERT item into paid order blocked", !!error && /PAID_ORDER_IMMUTABLE/.test(error.message), error?.message);
  }

  // ---- 6. Concurrent create race (F-05) -------------------------------------
  if (freeTable) {
    const [r1, r2] = await Promise.all([
      waiter.rpc("rpc_create_order", { p_table_id: freeTable.id }),
      manager.rpc("rpc_create_order", { p_table_id: freeTable.id }),
    ]);
    const same = !!r1.data?.id && r1.data.id === r2.data?.id;
    record("F-05 concurrent creates converge to one order", !r1.error && !r2.error && same, r1.error?.message || r2.error?.message);
    const { data: act } = await manager
      .from("orders")
      .select("id")
      .eq("table_id", freeTable.id)
      .in("status", ["open", "settling"]);
    record("F-05b exactly one active order for the table", (act || []).length === 1, `count=${(act || []).length}`);
  }

  // ---- 7. rpc_update_item_details (new server-authoritative path) -----------
  {
    let { data: pend } = await waiter
      .from("order_items")
      .select("id,status,version")
      .eq("order_id", ORDER4)
      .eq("status", "pending")
      .limit(1);
    let target = pend && pend[0];
    if (!target) {
      const { data: tmp } = await waiter.rpc("rpc_add_order_item", {
        p_order_id: ORDER4,
        p_menu_item_id: DOOGH,
        p_quantity: 1,
        p_notes: "probe-edit-target",
      });
      target = tmp;
    }
    const { data: upd, error: uErr } = await waiter.rpc("rpc_update_item_details", {
      p_item_id: target.id,
      p_quantity: 2,
      p_notes: "probe-edit",
      p_expected_version: target.version,
    });
    record("happy: rpc_update_item_details works", !uErr && upd?.quantity === 2 && upd?.version === target.version + 1, uErr?.message);

    const { error: uErr2 } = await waiter.rpc("rpc_update_item_details", {
      p_item_id: target.id,
      p_quantity: 3,
      p_notes: null,
      p_expected_version: target.version,
    });
    record("details: stale version rejected", !!uErr2 && /conflict/i.test(uErr2.message), uErr2?.message);

    const { data: ordAfter } = await waiter.from("orders").select("version").eq("id", ORDER4).single();
    record("details: order version bumped for checkout guard", !!ordAfter && ordAfter.version > ord4.version, `order v=${ordAfter?.version}`);
  }

  // ---- 8. Anonymous read is empty (RLS intact) ------------------------------
  {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.from("orders").select("id").limit(5);
    record("anon SELECT orders returns nothing", !error && (data || []).length === 0, error?.message);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("probe crashed:", err);
  process.exit(2);
});
