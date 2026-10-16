# Architectural Decisions Record (DECISIONS.md)

**Project:** Resteroassist Café & Restaurant Shift Operations Platform  
**Status:** Living Document (All architectural choices, trade-offs, mistakes, and deviations from baseline are recorded here)

---

## Decision 001: Separation of Scope vs Decisions Log
- **Context:** Project requirements mandate that `SCOPE.md` is frozen immediately after creation and never modified.
- **Decision:** All ongoing design decisions, refinements, schema evolutions, and trade-offs will be sequentially logged in `DECISIONS.md`.
- **Trade-off:** Requires maintaining this separate log, but ensures a pristine audit trail of engineering evolution.

---

## Decision 002: Multi-Tenant RLS via JWT `raw_app_meta_data`
- **Context:** High-throughput table and order queries during peak rush hour need to be secured without performing expensive multi-table joins to `staff_profiles` on every single row check.
- **Decision:** Embed `restaurant_id` and `role` into Supabase Auth's `app_metadata` (`raw_app_meta_data`). RLS policies directly query:
  `(auth.jwt() -> 'app_metadata' ->> 'restaurant_id')::uuid = restaurant_id`.
- **Trade-off:** Staff profile changes (like branch or role change) require issuing a new session token, which is normal for auth lifecycles and significantly boosts database read/write throughput during floor operations.

---

## Decision 003: Server-Authoritative State Mutations via Postgres RPC
- **Context:** Concurrency issues arise when waiters delete items that the kitchen has already started cooking, or when cashiers checkout orders while items are being added.
- **Decision:** Encapsulate critical mutations in Postgres RPC functions:
  - `rpc_add_order_item`: atomically adds item, takes price snapshot from `menu_items`, prevents additions to `paid` orders, and increments order version.
  - `rpc_update_item_status`: transitions status with optimistic locking (`version`).
  - `rpc_cancel_order_item`: enforces cooking lock (waiters cannot cancel `preparing` or `ready` items).
  - `rpc_apply_order_discount`: enforces role permissions (cashier/manager only) and recalculates totals.
  - `rpc_settle_order`: atomically calculates final subtotal, 10% VAT, checks discount, and seals order as `paid`.
- **Trade-off:** Moves business logic closer to the database engine, requiring SQL migrations, but guarantees zero race conditions and rock-solid consistency.

---

## Decision 004: Immutable Price Snapshotting in `order_items`
- **Context:** Iranian inflation and frequent menu price adjustments would retroactively alter closed invoices if order bills joined directly against `menu_items`.
- **Decision:** In `order_items`, store `unit_price_toman BIGINT` captured at the exact moment of order insertion from `menu_items.price_toman`.
- **Trade-off:** Slight data denormalization in exchange for total financial auditability and immutable historical records.

---

## Decision 005: AI Smart Scratchpad via OpenRouter (Gemini 2.5 Flash) with Zero-Trust Fallback
- **Context:** Waiters in Iranian cafes take orders quickly in conversational Persian (e.g., *"دو تا لاته یکی کم شیر با چیزکیک"*).
- **Decision:** Use OpenRouter with `google/gemini-2.5-flash` due to its high Persian conversational fluency, low latency (< 1.5s), and absence of direct sanctions blocks. We implement strict defense-in-depth:
  1. Input character limit (300 chars max) to prevent prompt injection and payload bloat.
  2. Dynamic context injection containing only the tenant's current menu dictionary.
  3. Zod-enforced structured JSON schema output: `menu_item_id`, `quantity`, `notes`.
  4. Zero-trust price policy: AI is NEVER allowed to determine or alter price. Prices are fetched directly from Postgres.
  5. 4-second timeout with immediate fallback to manual item picker.
- **Trade-off:** Small API cost per voice note, but saves significant waiter time during peak rush.

---

## Decision 006: GoTrue v2 Token Non-Nullability and Auth Identity Mapping in Seed
- **Context:** Supabase GoTrue v2 threw `sql: Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported` when signing in demo accounts seeded directly into `auth.users`.
- **Decision:** Explicitly initialize non-nullable token columns (`confirmation_token = ''`, `recovery_token = ''`, etc.) and ensure linked rows in `auth.identities` for the `email` provider.
- **Trade-off:** Minimal extra SQL in `seed.sql`, guarantees instant compatibility with modern Supabase Auth GoTrue engine.

---

## Decision 007: Cooking Lock Invariant and Granular Role Separation
- **Context:** Waiters mistakenly deleting or cancelling items after the kitchen has already started cooking causes food spoilage, meat waste, and chef frustration during peak dinner rushes.
- **Decision:** In `rpc_cancel_order_item`, enforce a strict condition: if `order_items.status` is in `('preparing', 'ready', 'served')`, only users with `manager` or `owner` roles can cancel the item. Waiters are rejected with a clear operational exception.
- **Trade-off:** Eliminates food waste and maintains kitchen authority, while providing an escalation path through shift managers.

---

## Decision 008: Dual-Pane Operational Screen (`/demo-split`) for Demonstration & Floor Monitoring
- **Context:** Demonstrating or monitoring simultaneous floor operations (waiter entering order vs. kitchen display receiving real-time events) typically requires juggling two separate browser windows or devices.
- **Decision:** Provide a `/demo-split` route displaying Waiter/Cashier on the left and KDS on the right, both communicating over live Supabase Realtime WebSockets.
- **Trade-off:** Minimal extra component overhead, but tremendously clarifies the live event loop for demonstrations, training, and floor managers.

---

## Decision 009: Statutory Iranian 10% VAT Computation Rule
- **Context:** In compliance with the statutory 1403 Iranian national budget law, Value Added Tax (VAT) is set at 10% of the net bill after promotional discounts.
- **Decision:** Calculate VAT deterministically inside Postgres RPCs (`rpc_get_order_summary`, `rpc_apply_order_discount`, `rpc_settle_order`) using integer arithmetic in Toman:
  $$\text{VAT (10\%)} = \lfloor (\text{Subtotal} - \text{Discount}) \times 0.10 \rfloor$$
  $$\text{Grand Total} = (\text{Subtotal} - \text{Discount}) + \text{VAT}$$
- **Trade-off:** Eliminates rounding discrepancies between client and server, guaranteeing audit-ready invoices.


---

## Decision 010: Restaurant Self-Registration & In-Tenant Staff Hiring
- **Context:** Restaurant managers need to recruit new staff (waiters, kitchen staff, cashiers, shift managers) without contacting support. Additionally, new restaurants and cafes need a self-service onboarding flow to register their brand and immediately start operations.
- **Decision:** 
  1. **Staff Hiring (`/staff` & `hireStaffMemberAction`):** Restricted to `manager` and `owner` roles. Uses Supabase Auth Admin API (`createAdminClient`) to generate auth credentials and links them directly to the calling manager's `restaurant_id` and chosen branch. RLS policies on `staff_profiles` enforce that managers can only view and recruit staff within their own tenant boundary.
  2. **Restaurant Registration (`/register` & `registerRestaurantAction`):** A public onboarding route that creates the `restaurants` row, default branch, owner account (`owner`), and automatically seeds 4 initial dining tables (میز ۱ تا ۴) and starter menu categories, allowing instant live operation upon signup.
- **Trade-off:** Requires Supabase service role access within server actions, but ensures strict defense-in-depth where user-provided inputs cannot override server-extracted JWT `restaurant_id` claims.

---

## Decision 011: Enhanced Staff Access Matrix & Chef Master Board (KDS)
- **Context:** User feedback highlighted inadequate contrast in staff management, inappropriate HR terminology ("استخدام"), and the critical need for chefs to view all tables and order progress stages on a single screen simultaneously.
- **Decision:**
  1. **Staff Operations (`/staff`):** Replaced "استخدام" with natural Iranian restaurant terminology ("افزودن همکار جدید", "مدیریت پرسنل و دسترسی‌ها"). Added an interactive permissions matrix (ماتریس دسترسی نقش‌ها) explaining exact capabilities of Waiter, Kitchen, Cashier, and Manager. Provided actions for Role Edit (`updateStaffRoleAction`), Password Reset (`resetStaffPasswordAction`), and Member Deletion (`deleteStaffMemberAction`).
  2. **Chef Master Board (`/kds`):** Added a 3-way view switcher:
     - **نمای جامع میزها (Chef Master View):** Displays all active table orders simultaneously with table location (e.g. میز ۴ سالن اصلی), elapsed timer with urgent glow (>15 min), order stage badge & percentage progress bar, item breakdown with special notes, and 1-click batch actions for the whole ticket.
     - **کانبان مرحله‌ای (Kitchen Kanban):** 3-stage workflow columns (در صف پخت، روی اجاق، آماده تحویل).
     - **تجمیع منقل و بار (Batch Expeditor):** Aggregates identical items across all tables (e.g., total skewers of kebab needed right now) for grill and bar stations.
- **Trade-off:** Added richer state management and Web Audio API alerts, resulting in significantly higher operational throughput during rush hours.

---

## Decision 012: Manager Menu Management & Rapid Waiter POS with Live Kitchen Alerts
- **Context:** Managers need complete, autonomous control over the restaurant menu and pricing in Toman without touching code or database seeds, while guaranteeing cross-tenant isolation. Waiters required an ultra-fast, 1-tap item marking system where any addition or modification triggers an immediate alert and visual cue on the kitchen KDS.
- **Decision:**
  1. **Menu Management (`/menu` & `src/actions/menu-actions.ts`):** 
     - Complete CRUD for menu items (Add, Edit name/category/price, Delete, and 1-tap availability toggle: موجود / تمام شد).
     - Strict multi-tenant isolation enforced at database RLS level (SELECT, INSERT, UPDATE, DELETE policies checking `restaurant_id = current_restaurant_id()`) and verified in Server Actions.
  2. **Fast 1-Tap Waiter Order Marking (`/pos` & `MenuBrowser`):** 
     - Re-styled in high-contrast dark theme with table status filters.
     - Food cards show live order counts and a 1-tap `+` button for rapid marking.
     - Waiter can add custom customer requests ("کم‌روغن", "بدون پیاز", "سس قارچ") or edit quantities of pending items via `updateOrderItemDetails`.
  3. **Real-time Kitchen Alerting (`/kds`):** 
     - KDS subscribes to `order_items` and `order_events` over Supabase Realtime WebSockets.
     - Whenever a waiter adds an item, changes quantity, or edits notes, the KDS displays a prominent top alert banner ("🔔 هشدار زندهٔ تغییر در سفارشات سالن"), pulses the modified table ticket with an amber glow, and rings a synthesized Web Audio chime.
---

## Decision 013: Unified Dark Theme Aesthetics & Responsive TopBar Stabilization
- **Context:** Following the rapid addition of menu and staff management features, two UX regressions occurred:
  1. The Cashier view (`/cashier`) still used stark light cards (`bg-white` and dark text `text-slate-800`), causing severe contrast dissonance against the dashboard's dark slate container (`bg-slate-950`) and rendering the page header illegible.
  2. The TopBar navigation tabs had accumulated 5 full-length labels, causing layout wrapping and clipping on standard Iranian laptop screens (1366×768 / 1080p scaled).
  3. Webpack client manifest desynchronization in development caused transient 500 runtime errors ("سایت کلا بهم ریخت").
- **Decision:**
  1. **Cashier UI Dark Theme Harmonization:** Rebuilt `/cashier` using the unified slate/emerald palette (`bg-slate-900/90`, `border-slate-800`, `text-slate-100`, emerald highlights). Fixed table bill preview, invoice table contrast, manual Toman discount inputs, and 10% VAT callout.
  2. **TopBar Responsive Architecture:** Standardized navbar heights to `h-9` and `h-8.5` pills, prevented vertical wrapping with responsive sizing and flex-shrink protection, and preserved full accessibility with standard labels for automated tests.
  3. **Dev Server & Hydration Stability:** Cleared corrupted `.next` webpack cache, suppressed false-positive browser autofill hydration mismatches on login inputs, and verified 100% green status across all 7 Playwright test suites.
- **Trade-off:** Consistent, pixel-perfect dark theme across all 5 operational views with zero layout shifts on any viewport.

---

## Decision 014 (Retrospective — revisit): OpenRouter-First AI Path Was the Wrong Default

- **Context:** The frozen baseline (SCOPE §7, Decision 005) made a cloud LLM (OpenRouter relay) the primary parser with a 4-second timeout and a manual-picker fallback. Two facts changed our mind: (1) measured generation latency with default model thinking exceeded the timeout on realistic network conditions — the cloud path burned its full timeout and aborted on nearly every request; (2) the deterministic Persian offline engine we shipped as a safety net turned out to be *better* for this task — single-digit milliseconds, fully deterministic, zero cost, and stable enough to run exact-match E2E assertions.
- **Decision:** Invert the hierarchy. The offline engine is the default, always-wired layer. The cloud model is an optional enhancement: Priority 1 direct Google Gemini Flash (`thinkingBudget: 0`, 8s hard cap), Priority 2 OpenRouter relay, automatic degradation to the local engine on any error or timeout. The shipped behavior no longer depends on any key or network.
- **Alternative considered:** (a) keeping cloud-first and simply raising the timeout — rejected: it converts network latency into dead UI time at the tableside during a dinner rush; (b) removing the cloud path entirely — rejected: the optional quality upgrade is real value when available, and the fallback makes it risk-free.
- **Trade-off:** The offline engine reads only the tenant's active menu vocabulary and modeled modifiers — it does not "understand" arbitrary phrasing the way an LLM can. Accepted: at tableside, a bounded, explainable, auditable parser beats a fluent one whose latency and output both vary.
- **Revisit if:** direct-Gemini latency on target networks proves consistently sub-second — then cloud-first becomes defensible for richer note understanding.

---

## Decision 015 (Retrospective — revisit): JWT-Claim Authorization Has a Revocation Window

- **Context:** Decision 002 embeds `restaurant_id`/`role` into the JWT for throughput. Consequence surfaced by adversarial review: a role change or staff removal only takes effect when the token is refreshed — a demoted or removed staff member keeps their previous privileges for the remaining token lifetime, and nothing server-side re-checks `staff_profiles` on each action.
- **Decision:** For the MVP, keep claims for fast RLS checks, but treat revocation as "re-issue/rotate": the ops guide documents the window (HANDOVER §4), staff removal blocks future sign-ins immediately, and role changes are declared to take effect at the next sign-in or token refresh.
- **Alternative considered:** (a) checking `staff_profiles` on every request (immediate revocation, but a per-policy join on the hottest path); (b) short token TTLs with silent refresh (tighter SLA, more auth chatter); (c) a revoked-user denylist checked server-side in a hook.
- **Trade-off:** Peak-shift database throughput and standard GoTrue behavior prioritized over instantaneous revocation. Accepted at MVP scale, where staff changes during service are rare and manager-driven.
- **Revisit at:** multi-branch rollout or any deployment where instant revocation becomes a stated requirement.

---

## Decision 016 (Retrospective — revisit): Server-Authoritative Write Model (the audit changed the architecture)

- **Context:** An adversarial review of the deployed stack (see SECURITY_AUDIT_REPORT.md) proved that Decision 003's "server-authoritative RPCs" were advisory, not enforced: every invariant implemented inside an RPC could be bypassed by issuing the same INSERT/UPDATE directly through PostgREST with the public anon key. Price injection, self-settlement, paid-invoice reopening, cooking-lock bypass, duplicate-race orders, and forged audit events were all executed live. Root cause: `SECURITY INVOKER` controls whose privileges a function runs with — it does not stop callers from skipping the function and writing to the table, because the RLS write policies were coarse "same restaurant" checks with no status/role/column semantics.
- **Decision:** Move the financial core (`orders`, `order_items`, `order_events`) to a genuinely server-authoritative model in migration `20261017000000_security_hardening.sql`: direct INSERT/UPDATE/DELETE revoked from `anon`/`authenticated` (SELECT-only), and every mutation behind self-checking `SECURITY DEFINER` RPCs (tenant + role re-verified inside each transaction, `search_path` pinned). The same migration adds the real transition matrix to `rpc_update_item_status` (cancellation only via the cancel RPC, no resurrection, served is terminal), settle preconditions (`status='settling'` + required expected version), `PAID_ORDER_IMMUTABLE` triggers that bind for every role including `service_role` (verified), a partial unique index + advisory lock + idempotent conflict handling for one-active-order-per-table, and a new `rpc_update_item_details` that removes the last direct-DML app path.
- **Alternative considered:** (a) Keeping direct DML and re-implementing every invariant in BEFORE INSERT/UPDATE triggers plus column-level grants (the audit's option 2) — rejected: duplicates the invariant set in two places, is harder to review and to keep in sync with the RPCs, and still leaves column-level holes; (b) RLS-only tightening (`WITH CHECK` policies) — rejected: policies cannot express "who may call which transition" without duplicating the RPC logic anyway. Revoke + SECURITY DEFINER is the pattern Supabase itself recommends for this exact class.
- **Trade-off:** Every future mutation must ship as a migration + RPC (slightly slower iteration), and `SECURITY DEFINER` demands discipline (pinned `search_path`, explicit tenant/role checks in every function — all satisfied here). In exchange, the invariants the docs, the UI, and the demo all claim are now enforced by the database kernel, and a committed regression battery (`npm run test:security`, 23 checks) re-proves them on every fresh reset. Verified locally: 23/23 probes + 9/9 E2E on the hardened stack.
- **Revisit if:** a future feature needs high-frequency column-level writes (e.g. live table timers) — then consider narrow column grants for that specific column instead of broadening table access back to clients.

