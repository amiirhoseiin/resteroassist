# 🔴 Security & Adversarial QA Audit — Resteroassist MVP

**Audit date:** 2026-10-16
**Target:** Resteroassist — Iranian Restaurant Shift Operations Platform (Next.js 15.5.28 / Supabase / OpenRouter)
**Auditor:** OpenCode Red Team (adversarial security + QA)
**Scope:** Full codebase, SQL migrations, RLS policies, RPC layer, Server Actions, AI pipeline, Playwright tests, documentation, local Supabase stack (127.0.0.1:54321), production build on localhost:3000
**Methodology:** Static analysis → threat modeling → dynamic exploitation against the live local stack (PostgREST direct access, JWT manipulation, RLS bypass, race conditions, business-logic abuse, Realtime cross-tenant probing, prompt-injection review) → functional E2E verification.

> **Bottom line:** Multi-tenant *cross-restaurant* isolation is genuinely solid (reads, writes, RPCs, Realtime all verified). But the **server-authoritative financial core is not authoritative at all**. Every business invariant that the RPCs enforce — cooking lock, zero-trust pricing, cashier-only settlement, discount caps, immutable sealed invoices — is bypassable by **any authenticated staff member using the same anon key the app ships to their browser**. This is a revenue-fraud surface wide open to a waiter with DevTools, not an exotic exploitation chain. **Not production-ready.**

---

## 1. Executive Summary

| Metric | Result |
| :--- | :--- |
| Cross-tenant isolation (SELECT / INSERT / UPDATE / RPC / Realtime) | ✅ **Holds** (verified dynamically) |
| Cooking Lock invariant (flagship "senior" feature) | ❌ **Broken — 3 independent bypasses** |
| Zero-trust pricing (DB-only price resolution) | ❌ **Broken — arbitrary prices writable via PostgREST** |
| Cashier-only settlement & discount control | ❌ **Broken — any staff can mark paid + set any discount** |
| Immutable price snapshot / sealed invoices | ❌ **Broken — paid invoices reopenable & editable** |
| Audit trail integrity | ❌ **Forgeable by any staff role; raw mutations unlogged** |
| VAT 10% math (`⌊(subtotal−discount)×0.10⌋`) | ✅ Correct (verified 1,220,000 → 122,000 → 1,342,000) |
| AI guard-rails (300-char clamp, Zod, 4s timeout, fallback, price discard) | ✅ Present (rate limiter **missing** — SCOPE violation) |
| Real-time updates & RLS on Realtime | ✅ Works; 12/12 concurrent channels subscribed |
| Playwright suite | ⚠️ Passes on fresh DB only — **not idempotent** (2nd run fails, reproduced) |
| Dependency hygiene | ⚠️ `npm audit`: 6 high / 3 moderate (mostly build-time) |

**Risk score: 7 / 10 (High).** Breakdown: *tenant isolation 8.5/10, financial integrity 3/10, audit integrity 3/10, authn 7/10, dependency hygiene 6/10, ops resilience 6/10.*

---

## 2. Confirmed Findings

### F-01 — CRITICAL — Zero-Trust Pricing Bypass: anyone can write arbitrary `unit_price_toman`

- **Location:** `supabase/migrations/20261016000000_init_schema_and_rls.sql` — `order_items` INSERT policy (lines 265–270) and UPDATE policy (lines 272–274); contrasts with `rpc_add_order_item` (lines 366–491).
- **Description:** The "zero-trust pricing" invariant lives **only inside the RPC**. The RLS policies permit any waiter to `INSERT`/`UPDATE` `order_items` with any `unit_price_toman` and any `quantity` directly through PostgREST. `SECURITY INVOKER` RPCs do **not** make direct DML impossible — RLS policies do, and these policies have no price/status/role checks. The browser already holds the anon key; DevTools or curl is the only tooling needed.
- **Proof of Concept (verified live):**
  ```http
  POST /rest/v1/order_items
  Authorization: Bearer <waiter JWT>
  {"order_id":"<own open order>","restaurant_id":"11111111-...","menu_item_id":"11111111-4444-1111-1111-000000000001",
   "quantity":5,"unit_price_toman":0,"status":"pending","added_by":"<waiter uid>"}
  → 201 Created — item stored with price 0 (menu price is 480,000)
  ```
  Also confirmed: post-settlement tampering of a **paid** invoice item — `PATCH /order_items?id=eq.<item>` `{"unit_price_toman":1,"quantity":999}` → `200 OK`.
  Evidence: `attack-output.log` records `PRICE-1`, `PRICE-2`.
- **Impact:** Direct revenue theft. A waiter adds 5 kababs at price 0; totals, VAT and the sealed invoice all reflect the forged price. Historical invoices can be rewritten after payment.
- **Remediation:** Remove direct `INSERT/UPDATE` grants on `order_items` for `authenticated` (revoke table privileges; grant only `EXECUTE` on RPCs). If direct writes must stay, add a `BEFORE INSERT OR UPDATE` trigger that rejects any write where `unit_price_toman` differs from `menu_items.price_toman` (on insert) and rejects all updates to `unit_price_toman`/`quantity` after `status='served'` or parent order `paid`. Column-level `GRANT UPDATE (status)` is an alternative for status-only transitions.
- **Status:** **Confirmed** (exploited).

---

### F-02 — CRITICAL — Checkout Bypass: any staff can mark orders `paid` and set any discount

- **Location:** Migration — `orders` UPDATE policy (lines 256–258) has no role check; `rpc_settle_order` / `rpc_apply_order_discount` role gates (lines 721, 804) are the only guards.
- **Description:** The cashier-only settlement control is a UI/RPC convention, not an enforced policy. A kitchen or waiter account can close any order of its restaurant with one PATCH, including an arbitrarily large `discount_toman` (CHECK only enforces `>= 0`).
- **Proof of Concept (verified live):**
  ```http
  PATCH /rest/v1/orders?id=eq.<own open order>
  Authorization: Bearer <waiter JWT>
  {"status":"paid","discount_toman":9999999}
  → 200 OK, row returned with status=paid, discount_toman=9999999
  ```
  The subsequent cashier RPC path dead-ends: `"Order is already settled and paid"` — the invoice left the active queue with **no cashier involvement and no audit event**. Kitchen role independently confirmed (`ROLE-2`: kitchen set `discount_toman=500000`, `status=settling`).
  Evidence: `attack-output.log` `CHECKOUT-1`, `CHECKOUT-2`, `ROLE-2`.
- **Impact:** Complete bypass of the cashier station: unpaid meals can be silently closed, or closed at a fraudulent discount. No audit record is produced for raw PATCHes, so the loss is invisible in `order_events`.
- **Remediation:** Revoke direct `UPDATE` on `orders` from `authenticated`; route all mutations through RPCs. If kept, add `WITH CHECK` constraints plus a trigger forbidding `status`/`discount_toman` changes unless `current_user_role()` is cashier/manager/owner **and** the transition is legal (`open→settling→paid`), with forced audit-row insertion.
- **Status:** **Confirmed** (exploited).

---

### F-03 — CRITICAL — "Immutably sealed" paid invoices can be reopened and edited

- **Location:** Migration — no trigger guards `orders`/`order_items` after `status='paid'`; `rpc_settle_order` blocks adding items (lines 407–413) but RLS does not.
- **Description:** SCOPE §2.4 promises the financial snapshot is "immutably sealed". In reality: a waiter reopened a **paid** seed invoice (`paid → settling`, `version` set arbitrarily to 99), injected 3×480,000 Toman of items into it, and the recomputed summary reflected the new subtotal (480,000 → 1,920,000).
- **Proof of Concept (verified live):**
  ```http
  PATCH /rest/v1/orders?id=eq.11111111-5555-1111-1111-000000000101   {"status":"settling","version":99}  → 200 OK
  POST  /rest/v1/order_items   {order_id:"...101", quantity:3, unit_price_toman:480000, ...}          → 201 Created
  POST  /rest/v1/rpc/rpc_get_order_summary {p_order_id:"...101"}   → subtotal_toman: 1920000
  ```
  Evidence: `attack2-output.log` `INVOICE-1`, `INVOICE-2`, `INVOICE-3`. (Auditor restored the row afterwards.)
- **Impact:** Fiscal records are malleable post-settlement: bills can be inflated for insurance/accounting fraud, or (combined with F-01) deflated after collection. Moadian/statutory reporting would export falsified data.
- **Remediation:** Immutability trigger: `RAISE EXCEPTION` on any `UPDATE/DELETE` of `orders` with `OLD.status='paid'` and on any `INSERT/UPDATE` of `order_items` whose parent order is `paid`, except an explicit manager-role RPC (`rpc_reopen_invoice`) that writes a mandatory audit event. Add `CHECK (version >= 1)`-style invariants; never allow client-supplied `version` writes (only `version = version + 1` in RPC).
- **Status:** **Confirmed** (exploited).

---

### F-04 — HIGH — Cooking Lock bypassed in three ways (the flagship invariant is fiction)

- **Location:** `rpc_update_item_status` (lines 494–571, gap at 528–539); `order_items` UPDATE policy (lines 272–274); reachable from the app itself via `src/actions/order-actions.ts` → `updateItemStatus()` (`newStatus` enum includes `"cancelled"`).
- **Description:** `rpc_cancel_order_item` correctly enforces the lock (verified: waiter rejected on a `preparing` item). But:
  1. **App-path bypass:** `rpc_update_item_status(item, 'cancelled', version)` has *no* role check for `cancelled` — a waiter calling the app's own server action cancels a cooking item.
  2. **Raw PATCH bypass:** `PATCH /order_items {status:'cancelled'}` — RLS has no status restrictions.
  3. **Resurrection:** `cancelled → pending` is accepted, so cancellations are also reversible without audit semantics (`item_status_changed` instead of `item_cancelled`).
- **Proof of Concept (verified live):** waiter JWT → `rpc_update_item_status {p_new_status:"cancelled", p_expected_version:2}` on a `preparing` item → `200 OK status=cancelled`; then `{p_new_status:"pending"}` → `200 OK`. Raw PATCH variant also `200 OK`. Evidence: `attack2-output.log` `BYPASS-A`, `BYPASS-B`; `attack-output.log` `LOCK-3`.
- **Impact:** Food waste and cost leakage the feature exists to prevent; waiters can erase kitchen-confirmed work items at will, mid-preparation.
- **Remediation:** In `rpc_update_item_status`, replace the partial checks with an explicit transition matrix **and** role matrix (e.g., `cancelled` only via `rpc_cancel_order_item`; `pending` only from nothing; `served` only from `ready`; nothing out of `cancelled` except manager). At RLS layer, restrict direct UPDATE to a status-transition trigger that re-implements the matrix — belt and braces.
- **Status:** **Confirmed** (exploited).

---

### F-05 — HIGH — Race condition: duplicate concurrent orders for the same table (double billing)

- **Location:** `rpc_create_order` (lines 316–325): `SELECT` for an existing open order is **not** locked and there is **no unique constraint** on active orders per table.
- **Description:** Six parallel `rpc_create_order` calls for Table 2 returned **4 distinct open orders** (`15bd…`, `27c8…`, `911a…`, `0b22…`). Waiters clicking simultaneously, or a client retrying, silently fork the bill.
- **Proof of Concept (verified live):** 6 × `POST /rest/v1/rpc/rpc_create_order {"p_table_id":"11111111-3333-1111-1111-000000000002"}` in parallel → 4 unique order IDs. Evidence: `attack-output.log` `RACE-1`.
- **Impact:** Split bills, items/settlements on the "wrong" duplicate, tables that never free up (a duplicate stays `open` forever), confused KDS tickets. Direct cash-integrity and operational chaos under exactly the peak-shift condition the product targets.
- **Remediation:** Add `CREATE UNIQUE INDEX ... ON orders(table_id) WHERE status IN ('open','settling');` and wrap create in `INSERT ... ON CONFLICT DO NOTHING` + re-select, or take an advisory lock (`pg_advisory_xact_lock(hashtext(table_id::text))`). Handle the unique-violation path as "return existing order".
- **Status:** **Confirmed** (exploited).

---

### F-06 — HIGH — Audit trail is forgeable by any staff role and blind to raw mutations

- **Location:** `order_events` INSERT policy (lines 281–283); no `actor` binding; no triggers on `orders`/`order_items`; `src/lib/logger.ts` (line 17 default `"unspecified"`); `src/actions/order-actions.ts` (never passes `restaurant_id`).
- **Description:** `order_events` accepts client-supplied rows including a spoofed `actor_id`. A waiter inserted `event_type:"order_settled"` naming **the cashier's UUID as actor** — accepted (`201`). Simultaneously, all raw PATCH/POST mutations (F-01…F-04) produce **zero** events, so the "structured audit trail" both lies (forgeries) and omits (bypasses). Server-action console logs show `"restaurant_id":"unspecified"` and latency ~0.
- **Proof of Concept (verified live):** `POST /order_events {actor_id:"10000000-…002" /*cashier*/, event_type:"order_settled", payload:{forged:true}}` → `201`. Evidence: `attack-output.log` `AUDIT-1`; server log lines `[AUDIT_LOG] … "restaurant_id":"unspecified"`.
- **Impact:** Post-incident forensics and dispute resolution are worthless. A thief can attribute settlements to colleagues; real fraud leaves no trace.
- **Remediation:** Write audit rows **server-side only** (revoke INSERT from `authenticated`; emit via `SECURITY DEFINER` trigger on every `orders`/`order_items` change, forcing `actor_id = auth.uid()`); add `BEFORE INSERT` trigger overriding `actor_id`/`created_at`; hash-chain rows if tamper-evidence is required. Fix the app logger to pass tenant context.
- **Status:** **Confirmed** (exploited).

---

### F-07 — MEDIUM — Role-model deviations vs. SCOPE.md §5.2 and DECISIONS.md #007

- **Location:** `rpc_cancel_order_item` line 610 (`IN ('manager','owner','cashier')`); `rpc_update_item_status` lines 528–539.
- **Description:** Three documented-invariant violations, all verified live (`attack2-output.log` `DEVIATION-A/B`, `BYPASS-B`):
  1. **Cashier can cancel `preparing` items** — SCOPE table marks cashier ❌; DECISIONS.md #007 says "only manager or owner". (This also lets a cashier delete already-*served* items from a bill.)
  2. **Kitchen can jump `pending → served`** directly — transition graph unenforced.
  3. **Cancelled items can be resurrected** to `pending` by anyone (also listed under F-04).
- **Proof of Concept:** cashier JWT → `rpc_cancel_order_item` on a `preparing` item → `200 OK cancelled`; kitchen JWT → `rpc_update_item_status {pending→served}` → `200 OK`.
- **Impact:** Discounting/voiding already-delivered food (served→cancelled) with no manager gate; stealth re-billing hacks. Documentation no longer describes the deployed access model.
- **Remediation:** Implement one authoritative state×role matrix in SQL (shared by `rpc_cancel_order_item` and `rpc_update_item_status`), align it with SCOPE §5.2, and update DECISIONS.md #007 (it currently contradicts the code).
- **Status:** **Confirmed** (exploited).

---

### F-08 — MEDIUM — No rate limiting anywhere; AI scratchpad allows unbounded cost abuse

- **Location:** `src/actions/order-actions.ts` `parseVoiceNoteAction` (lines 363–409); `src/lib/ai-parser.ts`; SCOPE §3 mandates a "Rate Limiter". Login throttling exists only via GoTrue (`supabase/config.toml` line 208: 30 sign-ins / 5 min / IP).
- **Description:** Any authenticated waiter can invoke the AI action in a tight loop; each call hits OpenRouter (4s timeout) with no per-user/IP budget, no queue, no kill-switch. A single hostile or fat-fingered client can burn the restaurant's OpenRouter credits and saturate server routes. Conversely, the shared-NAT login limit is a peak-shift availability risk: an entire restaurant behind one public IP can lock *everyone* out after 30 sign-ins in 5 minutes.
- **Proof of Concept:** Static: zero limiter references in `src/**`. Dynamic: the heuristic-fallback path executed repeatedly with no throttling; the `ai_note_heuristic_match_used` audit line was produced on every invocation.
- **Impact:** Financial (API cost), DoS (token saturation), and shift-start lockouts for all staff.
- **Remediation:** Add a per-user token bucket (e.g., 10 AI calls/min, configurable) in the Server Action keyed on `auth.uid()`, plus a global circuit-breaker on OpenRouter spend. For login: raise `sign_in_sign_ups` or move staff auth to long-lived sessions/refresh flow so only initial device logins hit the limiter; document the NAT caveat.
- **Status:** **Confirmed** (missing control).

---

### F-09 — MEDIUM — Demo credential posture & signup surface

- **Location:** `supabase/seed.sql` (all accounts `Password123!`); `README.md` / `HANDOVER.md` (credentials published); `supabase/config.toml` (`enable_signup = true`, `minimum_password_length = 6`, `password_requirements = ""`).
- **Description:** Every seeded account — including the two tenant managers — shares one password that is printed in user-facing docs. Public signup is enabled; new users get no `staff_profile` (therefore no data access, verified), but an easier target than brute-forcing seeded accounts does not exist.
- **Impact:** Any deployment that ships the seed unchanged is one documented password away from full tenant compromise.
- **Remediation:** Deployment gate: disable public signup, delete/rotate all demo users and re-issue credentials through secure provisioning, enforce password requirements, and add per-account lockout.
- **Status:** **Confirmed** (configuration).

---

### F-10 — MEDIUM — Playwright suite is non-idempotent and its flagship assertions bypass the UI

- **Location:** `tests/shift-workflow.spec.ts`, `tests/rls-isolation.spec.ts`, `playwright.config.ts`.
- **Description:** Verified behavior:
  - **Run 1 (fresh DB): 4/4 pass** (3.0s).
  - **Run 2 (immediately after): shift-workflow FAILS** — `صورتحساب میز ۱۲` not found, because run 1 settled the seeded Table-12 order in place and nothing resets it. The repository's `test-results/.last-run.json` already recorded `"status":"passed"` while the live DB shows order `…012` as `paid, version 4` — i.e., the project was left in a post-test state. The suite only proves anything on a pristine DB and pollutes whatever DB it touches.
  - **UI coverage gap:** the "cashier applies discount, verifies VAT, settles" phase doesn't touch the cashier UI/actions at all — it calls `rpc_settle_order` directly from Node (`shift-workflow.spec.ts` lines 101–125). Same for KDS transitions (RPC calls, lines 51–77). The actual `settleOrder`/`updateItemStatus` server actions and buttons — the code paths a cashier/KDS operator exercises — are untested. The AI scratchpad is only asserted as *visible*, never exercised.
- **Proof of Concept:** `playwright-run1.log` (4 passed) vs `playwright-run2.log` (1 failed); `test-results/.last-run.json`.
- **Impact:** False confidence. Regressions in the real UI path (or in newly-added RLS hardening) can ship green.
- **Remediation:** Seed fixtures inside the tests (create order/items via API with unique tables), or reset the DB in a global setup; assert the UI buttons (settle button, KDS buttons) rather than RPCs; add regression tests for every confirmed finding in this report (see Appendix B).
- **Status:** **Confirmed** (reproduced).

---

### F-11 — LOW — No HTTP security headers

- **Location:** No `next.config.*` exists; response headers from `localhost:3000/login` contain **none** of `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`.
- **Description:** The app is framable (clickjacking on the login/one-click switcher), lacks MIME-sniffing protection and CSP. React text escaping currently prevents stored XSS (verified — see §4), but there's no defensive layer behind it.
- **Remediation:** Add `headers()` in `next.config.ts`: CSP (`default-src 'self'`; allow `https://*.supabase.co` or the configured Supabase origin + `wss:`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS on Vercel.
- **Status:** **Confirmed**.

---

### F-12 — LOW — Dependency vulnerabilities (`npm audit`: 6 high / 3 moderate)

- **Location:** `package.json` / `package-lock.json`.
- **Description:** Highs: `braces`/`micromatch`/`chokidar`/`tailwindcss` (build-time DoS chain), `postcss` bundled inside Next (path-traversal advisories, GHSA-6g55-p6wh-862q family). The `next` entry itself is transitive via its bundled postcss; the installed 15.5.28 is newer than the middleware-bypass CVE fix (15.2.3), and the `x-middleware-subrequest` bypass attempt was **blocked** (307 → `/login`). No critical advisories. No known-exploited runtime vuln found in the shipping bundle.
- **Remediation:** Schedule Tailwind v4 / Next upgrade; track the bundled-postcss advisory upstream. Re-run `npm audit` in CI.
- **Status:** **Confirmed** (informational severity in this context).

---

### F-13 — LOW — Middleware auth-filter bypass patterns (defense-in-depth)

- **Location:** `src/middleware.ts` lines 38–41: paths starting `/api` or **containing any dot** skip the auth redirect; the matcher also whitelists many static extensions.
- **Description:** Requesting e.g. `/pos/x.y` or any future `/api/*` route skips middleware. Today no API routes exist and every page re-checks auth (`(dashboard)/layout.tsx` + RLS), so exploitability is null — but it's a latent trap for the next feature.
- **Remediation:** Allow-list instead of block-list; perform auth in layouts/route handlers explicitly (already done) and treat middleware as UX-only (it currently is).
- **Status:** **Confirmed** (no impact today).

---

### F-14 — LOW — Business-logic hardening gaps (bundled)

1. `rpc_add_order_item` ignores `menu_items.is_available` — unavailable items can be ordered (line 416–422).
2. No composite FK: a Rohi waiter inserted a **Hizom menu item UUID** into a Rohi order (`TENANT-1`, 201) — cross-tenant menu references possible with leaked/known UUIDs (seed UUIDs are in the repo).
3. `notes` is unbounded at the DB (9,000 chars stored via raw insert; Zod caps 250/200 only in Server Actions) — storage/abuse vector.
4. `rpc_settle_order` doesn't require `status='settling'` (settles straight from `open`) and `p_expected_version` is optional (line 821) — the "initiate checkout" checkpoint and stale-state guard are soft.
5. `rpc_create_order`/`parseVoiceNoteAction` accept unvalidated inputs (`tableId`/`orderId` not Zod-checked); harmless today (parameterized/RLS-checked) but inconsistent with the other actions.
6. `AI_FALLBACK_MODEL` is declared in env/docs but never read by code (`openai/gpt-4o-mini` fallback is not implemented).
- **Remediation:** Add `is_available` check + composite integrity (`FOREIGN KEY (restaurant_id, menu_item_id) REFERENCES menu_items(restaurant_id, id)` via unique key), `CHECK (char_length(notes) <= 300)`, enforce `settling` precondition + required version, wire the fallback model (or delete it from docs).
- **Status:** **Confirmed**.

---

### F-15 — LOW — UI defects

1. `src/app/(dashboard)/cashier/page.tsx` (~line 544): settled list renders "بسته شده در {created_at}" — should be `updated_at`; "closed at" shows order creation time.
2. `src/components/pos/OrderDrawer.tsx` line 109: DELETE handler filter inverted (`it.id === payload.old.id` keeps *only* the deleted item). Dead code today (no DELETE policy), landmine tomorrow.
3. No branch filtering anywhere despite `branch_id` on every table and two seeded branches (`SCOPE §2.1 "filtered by branch/restaurant"`); multi-branch tenants see all branches mixed.
4. No route-level role gating: kitchen can open `/cashier`, waiter can open `/kds` (verified). Cosmetic while RPCs hold — but per F-01…F-03, the enforcement they rely on is broken.
- **Status:** **Confirmed** (1,3,4 reproduced; 2 by code review).

---

### F-16 — INFORMATIONAL — Tenant identity is 100% JWT-claims-trusting (Supabase model)

- Forging a token signed with the local default HS256 secret (`super-secret-jwt-token-with-at-least-32-characters-long`, pre-reset stack) returned **14 Roohi orders** for a "Hizom manager" — a pure demonstration that `current_restaurant_id()` never cross-checks `staff_profiles`; it trusts the signature. After `supabase db reset`, the local stack rotated to ES256 asymmetric keys and the `staff_profiles` fallback is the only token-absent path. This is standard Supabase architecture, not a code bug — but it means **the JWT secret is a single point of total tenant compromise**: treat it accordingly (Vercel env encryption, rotation runbook, never in client bundles).
- **Status:** Informational.

---

### F-17 — INFORMATIONAL — Documentation drift

- `AI_USAGE.md` §2.2 promises a second model (`openai/gpt-4o-mini`) that does not exist in code.
- `HANDOVER.md` §۲ ("گارسون دیگر **نمیتواند** سرخود غذا را لغو کند") and `README.md` §🔒 ("قیمتگذاری Zero-Trust"، "قفل پخت") describe invariants that are **false in the deployed system** (F-01…F-04).
- `DECISIONS.md` #007 contradicts the code (cashier can cancel `preparing`) and contains no entry for the deliberately omitted rate limiter (SCOPE §3 requires it). SCOPE.md itself is byte-identical to the root commit — the frozen-file claim holds. Single-commit git history + 26 files of whitespace-only working-tree churn: no post-commit changes were tracked, which makes the "all changes logged in DECISIONS.md" claim unauditable.
- **Remediation:** Update docs to match reality after fixing; add a DECISIONS entry for every deliberate deviation (rate limiter, RLS write model); commit work in atomic commits.
- **Status:** Confirmed.

---

## 3. The Root Cause (read this before fixing anything)

The architecture assumed: *"critical mutations live in RPCs, and RPCs are `SECURITY INVOKER`, therefore invariants are inviolable."*

That is incorrect. `SECURITY INVOKER` only controls **whose privileges the function runs with**. It does not prevent the caller from issuing the same DML **directly** — and Supabase exposes every table in `public` over PostgREST to the `authenticated` role. Because the RLS policies on `orders`/`order_items`/`order_events` were written as coarse "same restaurant" checks with no column, status, or role semantics, **every invariant implemented in an RPC exists only in an advisory layer**. The UI calls the RPCs; nothing forces anyone else to.

There are exactly two correct ways to close this class:
1. **Revoke direct DML** on the business tables from `anon`/`authenticated` and expose mutations only via `EXECUTE`-granted RPCs, or
2. Keep direct DML but re-implement the full invariant set inside `BEFORE INSERT/UPDATE` triggers + column-level grants, and bind audit rows to `auth.uid()`.

Option 1 is strongly recommended for this MVP — every mutation already has an RPC (except order cancellation and branch/table admin, which need none).

---

## 4. Verified Controls (what actually held up)

| # | Control | Verification |
| :--- | :--- | :--- |
| 1 | Cross-tenant SELECT isolation | Hizom orders/tables/profiles invisible to Rohi waiter — 0 rows (RLS-1) |
| 2 | Cross-tenant IDOR writes | PATCH on Hizom order → 0 rows modified; before/after identical (TENANT-3) |
| 3 | Cross-tenant INSERT (`WITH CHECK`) | Forged `restaurant_id` → `42501` rejected (TENANT-2) |
| 4 | Cross-tenant RPC | `rpc_add_order_item`/`rpc_get_order_summary` on Hizom IDs → "Order not found" (RLS test + TENANT-4) |
| 5 | Realtime RLS | Hizom channel received 0 events while Rohi inserted an order (RT-1); 12/12 concurrent channels subscribe |
| 6 | RPC role gates (discount/settle) | Waiter rejected with correct Persian-visible errors (ROLE-1) |
| 7 | Optimistic locking (RPC path) | Parallel same-version updates → exactly one win, one `CONCURRENCY_ERROR` (RACE-2) |
| 8 | CHECK constraints | Negative discount / negative quantity rejected (`23514`) |
| 9 | Read-only tables | `restaurants`, `menu_items`, `dining_tables`, `staff_profiles` — all direct writes denied (`42501`); self-promotion PATCH → 0 rows |
| 10 | Delete surface | No DELETE policy anywhere — probe DELETEs affected 0 rows; rows verified intact |
| 11 | XSS | `<img onerror>` / `<script>` payloads in notes render as inert text in POS and KDS; no dialog executed (UI-5, UI-6) |
| 12 | Secrets | No keys in git history or client bundle; `.env*` ignored; only public anon/service demo keys in local env |
| 13 | Middleware CVE class | `x-middleware-subrequest` bypass attempt → 307 `/login` (Next 15.5.28 patched) |
| 14 | VAT math | `⌊1,220,000 × 0.10⌋ = 122,000`; grand total 1,342,000 asserted by suite and reproduced |
| 15 | AI guards | 300-char clamp (DOM `maxlength` + server slice), Zod schema, menu-ID whitelisting, 4s abort, heuristic fallback (verified live), prices never accepted from the model |
| 16 | Build & migration integrity | `next build` clean; `supabase db reset` applies migration + seed from scratch without errors; E2E suite 4/4 on fresh DB |
| 17 | One-click role switcher | All 5 personas navigate to correct routes (UI-1) |

---

## 5. Compliance Checklist (against the project requirements)

| Requirement | Status | Notes |
| :--- | :---: | :--- |
| `SCOPE.md` frozen, never edited | ✅ Pass | Byte-identical to root commit; only one commit exists so deep history unverifiable |
| `DECISIONS.md` logs all changes | ⚠️ Partial | Exists & substantive, but contradicts code (cashier-cancel) and omits rate-limiter deviation; work uncommitted (whitespace-only git diff) |
| `AI_USAGE.md` accurate | ⚠️ Partial | Guards described correctly; fallback model not implemented |
| `HANDOVER.md` accurate | ⚠️ Partial | Claims inviolable cooking lock — false in practice |
| `README.md` accurate | ⚠️ Partial | Same over-claims (Zero-Trust pricing absolute) |
| Supabase migrations w/ RLS + RPC + seed | ⚠️ Partial | Applies cleanly; **RLS write policies defeat the RPC invariants** (F-01…F-06) |
| `rls-isolation.spec.ts` | ✅ Pass | Genuine, meaningful; cross-tenant matrix holds |
| `shift-workflow.spec.ts` | ⚠️ Partial | Passes fresh; **non-idempotent**; settles via RPC not UI |
| One-click role switcher | ✅ Pass | 5 personas verified |
| Structured JSON audit logging | ⚠️ Partial | Console JSON exists; `order_events` forgeable + blind to raw writes; logger lacks tenant context |
| Price snapshot `unit_price_toman` | ⚠️ Partial | Correct at RPC insert; mutable afterwards (F-01/F-03) |
| AI guard: 300-char limit | ✅ Pass | |
| AI guard: Zod structured output | ✅ Pass | |
| AI guard: zero-trust pricing | ⚠️ Partial | True in AI pipeline; **false at DB layer** |
| AI guard: 4s timeout | ✅ Pass | Static verification (placeholder key prevented live OpenRouter call — see Limitations) |
| AI guard: graceful fallback | ✅ Pass | Heuristic engine verified live in UI |
| AI guard: **rate limiter** (SCOPE §3) | ❌ Fail | Not implemented (F-08) |
| Real-time updates (KDS live) | ✅ Pass | Verified live via WebSocket; RLS-isolated |
| VAT 10% deterministic in Postgres | ✅ Pass | Exact-math assertions reproduced |
| Cooking Lock enforced | ❌ Fail | 3 bypass paths (F-04) |
| Cashier-only discount/settlement | ❌ Fail | Raw-PATCH bypass (F-02) |
| Immutable sealed invoice | ❌ Fail | Reopening + post-hoc edits (F-03) |
| Vercel production deployment | ⚪ Unverifiable | No deployment artifact/URL in repo; build is deployable |
| Multi-tenant isolation (two restaurants) | ✅ Pass | For cross-tenant access; see risk score note |

---

## 6. Threat-Model Kill Chain (why these findings compound)

A single malicious **waiter** account, no special tools:

1. `rpc_create_order` on table 5 → order.
2. `POST order_items {unit_price_toman: 0}` ×N → food logged at 0 Toman (F-01).
3. Kitchen cooks; waiter hits `rpc_update_item_status(cancelled)` when the manager glances away (F-04) — or simply adds items and later rewrites prices downward before the cashier opens the bill (F-01).
4. `PATCH orders {status:'paid', discount_toman: <subtotal>}` → table frees, bill vanishes from cashier queue (F-02).
5. `POST order_events {event_type:'order_settled', actor_id: <cashier>}` → the ledger *proves* the cashier closed it (F-06).
6. If anything is questioned: `PATCH` the item prices in the sealed invoice (F-03).

Total loss per table: the full bill. Detection probability: near zero. This chain was executed end-to-end (minus real food) during this audit.

---

## 7. Prioritized Recommendations

| Priority | Action | Effort |
| :--- | :--- | :--- |
| **P0** | **Revoke direct DML** on `orders`/`order_items`/`order_events` from `anonymous`/`authenticated`; grant `EXECUTE` on RPCs only. Add missing `rpc_cancel_order(order_id)` if order-level cancel is needed. | 1–2h SQL |
| **P0** | Fix `rpc_update_item_status`: full state×role transition matrix; `cancelled` only via `rpc_cancel_order_item`; no resurrection. | 1h |
| **P0** | Make `rpc_settle_order`: require `status='settling'`, require non-null `expected_version`; audit every state change via trigger. | 1h |
| **P0** | Immutability trigger: forbid writes to paid orders/items except `rpc_reopen_invoice` (manager, audited). | 1h |
| **P1** | Unique partial index for active orders per table + advisory lock in `rpc_create_order`. | 30m |
| **P1** | Server-side audit triggers with forced `actor_id = auth.uid()`; revoke client INSERT on `order_events`. | 1–2h |
| **P1** | Rate limiter on `parseVoiceNoteAction` (per-user bucket + global spend circuit breaker); review GoTrue sign-in limit vs shared restaurant NAT. | 2h |
| **P1** | Rework E2E: fixtures/reset + UI-driven settle & KDS assertions + the Appendix-B regression cases. | 3–4h |
| **P2** | Security headers via `next.config.ts`; dependency upgrade plan (Tailwind v4 / postcss advisory). | 1h |
| **P2** | Fix doc drift (AI fallback model, HANDOVER/README claims, DECISIONS #007 + rate-limiter entry); commit work properly. | 1h |
| **P2** | Deployment gate: rotate/remove demo creds, disable signup, password policy, per-account lockout. | 1h |
| **P3** | Branch-level filtering, UI role routing, minor UI bugs (F-15), composite menu FK, notes length CHECK, `is_available` check. | 2–3h |

---

## 8. Appendix A — Evidence Artifacts

All raw outputs captured at `C:\Users\baroo\AppData\Local\Temp\opencode\resteroaudit\`:

| File | Content |
| :--- | :--- |
| `attack-output.log` | Wave 1: 25 records — RLS matrix, cooking-lock bypass, price injection, self-settlement, audit forgery, race (4 dup orders), realtime isolation, JWT forgery, limits |
| `attack2-output.log` | Wave 2: 12 records — RPC-path lock bypass, resurrection, role deviations, invoice reopen/injection, constraint checks |
| `ui-audit-output.log` / `ui-audit2-output.log` | Role switcher ×5, middleware bypass attempt, AI scratchpad heuristic (maxlength 300, DB price shown, commit OK), XSS negative, KDS realtime live delivery, cashier VAT UI |
| `final-probes-output.log` | Write-denial matrix (403s), delete/promotion no-op verification, 12/12 realtime channels |
| `playwright-run1.log` / `playwright-run2.log` | 4/4 pass → then 1 fail on identical seed state (non-idempotency proof) |
| `build.log`, `server2.log` | Clean Next build; runtime audit-log lines (`restaurant_id:"unspecified"`) |
| `shots\*.png` | POS (waiter), KDS live, KDS with XSS-note rendered literally, cashier VAT breakdown, XSS note in drawer |

Environment hygiene: all testing was conducted on the **local Supabase stack**; the database was reset to pristine seed state (`supabase db reset`) and the test server stopped after the audit. No production system was touched.

## 9. Appendix B — Regression Tests to Add (from confirmed findings)

1. `waiter_cannot_set_unit_price` — raw POST with `unit_price_toman:0` must fail.
2. `waiter_cannot_patch_order_status` — raw PATCH `status:'paid'` must fail.
3. `cooking_lock_via_update_rpc` — `rpc_update_item_status('cancelled')` on `preparing` must fail.
4. `paid_invoice_immutable` — after settle: item/order PATCHes and item POSTs must fail.
5. `parallel_create_single_order` — 6 concurrent `rpc_create_order` → exactly 1 order.
6. `audit_actor_cannot_be_spoofed` — client INSERT to `order_events` must fail; trigger-forced `actor_id`.
7. `ai_rate_limited` — 11th call within a minute returns 429.
8. `cashier_cannot_cancel_preparing` — per SCOPE §5.2.
9. `shift_workflow_idempotent` — run twice back-to-back in CI.

## 10. Limitations of This Audit

- No `OPENROUTER_API_KEY` was configured (placeholder), so the live model call, its latency, and its real-world prompt-injection resistance could not be executed; the timeout/Zod/filter/fallback code paths were verified statically and the fallback path dynamically. Re-run the AI suite against a staging key before launch.
- No Vercel deployment was available to test, so production-only configuration (headers, env scoping, CORS) was assessed from source/config only.
- Realtime was probed with 12 channels on one user — sufficient for correctness, not a capacity benchmark.

---

## 10. Remediation Addendum (2026-10-17) — Post-Audit Hardening

**Status:** The P0/P1 package from §7 was implemented in `supabase/migrations/20261017000000_security_hardening.sql` (chosen approach: §3 option 1 — revoke direct DML, server-authoritative RPCs), plus the app-side consequences. Applied and verified on the local stack; deployment to the hosted project is a one-step SQL paste (note at the end of this section). The audit body above is preserved verbatim as the historical record; this addendum is the current status.

### Finding → Fix

| Finding | Fix shipped |
| :--- | :--- |
| **F-01** price injection | `REVOKE ALL` on `orders`/`order_items` from `anon`/`authenticated` (SELECT kept); every mutation now flows through self-checking `SECURITY DEFINER` RPCs. |
| **F-02** self-settlement | Same revoke; `rpc_settle_order` additionally requires `status='settling'` **and** a non-null `expected_version`. |
| **F-03** paid reopen / item injection | `PAID_ORDER_IMMUTABLE` triggers on `orders` + `order_items` — enforced for every role, including `service_role` (regression-proven); reopening is impossible by design (no reopen RPC exists). |
| **F-04** cooking-lock bypass | `rpc_update_item_status` rewritten with a full state×role transition matrix; `cancelled` is rejected there entirely (cancel RPC only); no resurrection; served is terminal; paid orders freeze all item transitions. |
| **F-05** duplicate-order race | `uq_orders_active_table` partial unique index (created in a guarded DO-block) + `pg_advisory_xact_lock` + idempotent `unique_violation` handling in `rpc_create_order`. |
| **F-06** forgeable audit trail | INSERT on `order_events` revoked; events are written only inside `SECURITY DEFINER` RPCs with `actor_id = auth.uid()`. |
| **F-07** role-matrix drift | `rpc_cancel_order_item`: `preparing`/`ready` cancellable by manager/owner only (waiter-facing message retained verbatim); served items are final; kitchen cannot create orders; cashier cannot mark items served. |
| **F-14.4 / F-14.5** soft checkout checkpoint | Settle preconditions enforced (above); new `rpc_update_item_details` replaces the last direct-DML app path (`order-actions.ts`) and bumps the order version so stale checkout screens are rejected. |

### Verification (local stack, fresh `supabase db reset`)

- **Regression battery** — `scripts/security-probe.cjs` (`npm run test:security`): **23/23 PASS** — direct DML deny-matrix, cooking-lock matrix (waiter/cashier blocked, manager allowed), no resurrection, paid-immutability attacked via **service role**, settle preconditions, concurrent-create convergence, item-details concurrency, anonymous reads empty.
- **E2E suite** — full Playwright set re-run on the hardened stack: **9/9 PASS**, including the end-to-end order-to-cash workflow settling through the new preconditions.
- `supabase db reset` applies all migrations + seed cleanly (the immutability-trigger escape hatch is scoped to DB-owner sessions only — migrations, seed, dashboard repair).

### §5 compliance status now (what was ❌/⚠️ at audit time)

- Cooking lock enforced — ✅ fixed (and regression-proven). Cashier-only discount/settlement — ✅ fixed. Immutable sealed invoice — ✅ fixed. Doc drift (HANDOVER/README/AI_USAGE claims, DECISIONS #007 + new #016) — ✅ updated to match the enforced behavior.
- **Still open:** **F-08 rate limiter** (highest remaining priority), F-10 test idempotency, residual P3 items (F-14.1–3 `is_available` / composite menu FK / notes CHECK, F-15 UI/branch items, F-16 JWT-secret runbook, P2 headers).
- `service_role` retains direct write access **except** paid-immutability triggers — intentional: it is the trusted server-side key, never shipped to clients (F-16 runbook note stands).

### Deployment note

Apply `20261017000000_security_hardening.sql` to the hosted Supabase project (Dashboard → SQL Editor → paste → Run) before or together with deploying the matching app build; then re-run the F-01 probe as a signed-in waiter against production to confirm the write path is closed. The production app is live at `resteroassist.vercel.app` (verified 2026-10-17).
