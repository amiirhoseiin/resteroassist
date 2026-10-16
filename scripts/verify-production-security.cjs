/* Production gate check — proves the HOSTED deployment rejects direct client writes.
 *
 * SAFE BY DESIGN: the probe performs a no-op PATCH (sets discount_toman to the value it
 * already has). Nothing changes on the target either way — but the RESPONSE tells us
 * whether a signed-in waiter JWT can write to the financial tables directly:
 *
 *   exit 0 -> HARDENED   (write rejected; migration 20261017000000 is live)
 *   exit 1 -> STILL OPEN (write accepted; apply the migration, then redeploy)
 *   exit 2 -> setup/connection problem
 *
 * Usage: node scripts/verify-production-security.cjs   (reads NEXT_PUBLIC_SUPABASE_URL
 *        and NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local)
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (line.trim().startsWith("#")) continue;
  const m = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(2);
}

(async () => {
  console.log(`Target: ${url}`);
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { error: authError } = await client.auth.signInWithPassword({
    email: "amir@roohi.ir",
    password: "Password123!",
  });
  if (authError) {
    console.error("sign-in failed:", authError.message);
    process.exit(2);
  }

  // Prefer an 'open' order (never disturb the settling demo bill first).
  let target = null;
  for (const status of ["open", "settling"]) {
    const { data, error } = await client
      .from("orders")
      .select("id,discount_toman,status")
      .eq("status", status)
      .limit(1);
    if (error) {
      console.error("read probe failed:", error.message);
      process.exit(2);
    }
    if (data && data.length) {
      target = data[0];
      break;
    }
  }
  if (!target) {
    console.error("no active order found to probe");
    process.exit(2);
  }

  const { data: updated, error: updateError } = await client
    .from("orders")
    .update({ discount_toman: target.discount_toman }) // no-op value: current == new
    .eq("id", target.id)
    .select("id");

  if (updateError) {
    console.log(`HARDENED: direct PATCH rejected (${updateError.message}).`);
    console.log("The server-authoritative write model is live on this deployment.");
    process.exit(0);
  }

  console.log(
    `STILL OPEN: a waiter JWT PATCHed order ${target.id} (status=${target.status}) directly — no-op value, nothing changed.`
  );
  console.log("Apply supabase/migrations/20261017000000_security_hardening.sql, then redeploy and re-run this check.");
  process.exit(updated && updated.length ? 1 : 1);
})().catch((e) => {
  console.error("probe failed:", e.message);
  process.exit(2);
});
