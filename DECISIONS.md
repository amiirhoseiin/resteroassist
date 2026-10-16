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
