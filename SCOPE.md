# Project Scope & Architecture Agreement (SCOPE.md)

**Project:** Resteroassist Café & Restaurant Shift Operations Platform (MVP)  
**Document Status:** FROZEN — BASELINE SPECIFICATION (Do not edit after approval; log all amendments in DECISIONS.md)  
**Creation Date:** 2026-10-16  

---

## 1. Executive Summary & Recommended Approach

Iranian independent restaurants and cafés operate in high-velocity, high-stress environments. Peak dinner shifts (especially Thursday and Friday evenings) experience widespread operational failures caused by fragmented communication:
1. Waiters taking orders on paper napkins or messaging groups (WhatsApp/Telegram/Bale), leading to dropped items and illegible modifications.
2. Kitchen confusion regarding item order timing, leading to delayed appetizers or unrecorded re-orders (e.g., additional drinks/fries).
3. Checkout discrepancies where cashiers manually re-enter order slips, guess applied discounts, miscalculate the statutory 10% VAT (mandated since 1403), or lose revenue through untracked additions.

### Recommended Architectural Approach
Rather than attempting a monolithic ERP (inventory management, recipe BOM, supplier tracking, card terminal firmware) which invariably fails during a rush, we build a **resilient, server-authoritative live order-to-cash workflow**:
- **Multi-Tenant Isolation:** Complete physical separation logic enforced via Postgres Row Level Security (RLS) driven by JWT `app_metadata` (`restaurant_id`). Zero cross-tenant leakage.
- **Server-Authoritative Concurrency:** Granular, row-level item tracking where every order modification is an atomic row transaction. Optimistic locking on orders and items prevents race conditions when multiple waiters or cashiers touch the same table.
- **Transactional State Transitions via Postgres RPC:** Critical mutations (status changes, prep transitions, discount application, checkout locking) execute via secure, atomic Postgres RPC functions (`SECURITY INVOKER`) ensuring business invariants are inviolable.
- **Zero-Trust AI Augmentation:** An AI Smart Waiter Scratchpad leveraging OpenRouter (`google/gemini-2.5-flash`) parses colloquial Persian speech/text notes into structured items matching the tenant's specific active menu items, without trusting the AI with pricing or role authorization.

---

## 2. Selected Workflow (MVP)

The core workflow covers the end-to-end loop:
**Waiter Takes Order at Table $\rightarrow$ Kitchen Display System (KDS) Displays Live Status $\rightarrow$ Cashier Applies Discount, Computes 10% VAT, and Finalizes Payment.**

### Step-by-Step Execution:
1. **Waiter View (Table & Order Entry):**
   - Waiter opens table grid (filtered by branch/restaurant).
   - Waiter opens table: selects items from the visual categorized menu OR uses the **AI Smart Waiter Scratchpad** to dictate/type colloquial Persian notes (e.g., *"۲ تا چلوکباب لقمه با یه دوغ محلی بدون نعنا"*).
   - Items enter the order as independent rows in `pending` status with snapshot pricing (`unit_price_toman`).
   - Multiple waiters can concurrently add items to the same table order without overwriting each other.

2. **Kitchen View (Live Kitchen Display System - KDS):**
   - Kitchen receives real-time ticket cards partitioned by order, showing live items with elapsed timers and custom notes.
   - Kitchen staff update item states atomically: `pending` $\rightarrow$ `preparing` $\rightarrow$ `ready`.
   - **Cooking Lock Protection:** Once an item moves to `preparing`, a waiter is strictly blocked from unilaterally deleting or cancelling it. Only authorized managers or cashiers can cancel mid-prep items.

3. **Service & Delivery:**
   - Waiter or runner sees `ready` items and marks them `served`.

4. **Cashier Station (Checkout & Settlement):**
   - Cashier inspects the aggregated table bill with itemized status confirmation.
   - Cashier clicks "Initiate Checkout", placing the order in `settling` status.
   - Cashier can apply an authorized discount (in Toman).
   - System calculates 10% VAT automatically:
     $$\text{VAT (10\%)} = \lfloor (\text{Subtotal} - \text{Discount}) \times 0.10 \rfloor$$
     $$\text{Grand Total} = (\text{Subtotal} - \text{Discount}) + \text{VAT}$$
   - If a waiter attempts to append an item while the bill is `settling`, the order version increments and alerts the cashier before settlement.
   - Upon payment confirmation, order transitions to `paid`, the table is marked free, and the financial snapshot is immutably sealed.

---

## 3. System Architecture

```
[Client: Next.js 15+ App Router (TypeScript, Tailwind CSS, RTL / Vazirmatn Font)]
       │
       ├── 1. Reads & Realtime Subscriptions (WebSockets via Supabase Client)
       │      └──► [Supabase Realtime (postgres_changes) & PostgREST (RLS enforced)]
       │
       ├── 2. Critical State Mutations (Transactional & Atomic Invariants)
       │      └──► [Supabase Postgres RPC Functions (SECURITY INVOKER + Atomic Locking)]
       │             ├── rpc_add_order_item
       │             ├── rpc_update_item_status
       │             ├── rpc_cancel_order_item
       │             ├── rpc_apply_order_discount
       │             └── rpc_settle_order
       │
       └── 3. AI Smart Order Entry
              └──► [Next.js Server Action / API Route]
                     ├── Rate Limiter & Sanitizer (Max 300 chars, strict delimiter wrapping)
                     ├── Context Fetcher (Active tenant menu dictionary)
                     ├── OpenRouter API (google/gemini-2.5-flash with 4s timeout)
                     ├── Zod Output Schema Validation (Strict JSON parsing)
                     └── Zero-Trust Database Price Lookup (AI prices discarded)
```

### Architectural Principles:
1. **Database as Single Source of Truth:** Prices are never computed client-side or sent from AI. When an item is added, its price is copied directly from `menu_items.price_toman` into `order_items.unit_price_toman` inside a Postgres transaction.
2. **Defensive Concurrency:** Optimistic concurrency control via `version` integers on `orders` and `order_items`.
3. **Structured Audit Trail:** Every lifecycle transition logs structured records to `order_events` with actor ID, event type, timestamp, and metadata payload.

---

## 4. Database Schema Specification

### 4.1 Custom Types & Enums
- `user_role`: `'owner'`, `'manager'`, `'cashier'`, `'waiter'`, `'kitchen'`
- `order_status`: `'open'`, `'settling'`, `'paid'`, `'cancelled'`
- `item_status`: `'pending'`, `'preparing'`, `'ready'`, `'served'`, `'cancelled'`

### 4.2 Tables & Attributes

#### `restaurants`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `name`: `TEXT NOT NULL`
- `tax_rate`: `NUMERIC(5,2) NOT NULL DEFAULT 10.00`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `branches`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `name`: `TEXT NOT NULL`
- `address`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `staff_profiles`
- `id`: `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `branch_id`: `UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE`
- `full_name`: `TEXT NOT NULL`
- `role`: `user_role NOT NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `dining_tables`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `branch_id`: `UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE`
- `table_number`: `TEXT NOT NULL`
- `capacity`: `INT NOT NULL DEFAULT 4`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- *Unique Constraint:* `(branch_id, table_number)`

#### `menu_items`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `category`: `TEXT NOT NULL` (e.g., 'Kabab', 'Appetizer', 'Beverage', 'Burger')
- `name`: `TEXT NOT NULL`
- `price_toman`: `BIGINT NOT NULL CHECK (price_toman >= 0)`
- `is_available`: `BOOLEAN NOT NULL DEFAULT true`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `orders`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `branch_id`: `UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE`
- `table_id`: `UUID NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT`
- `status`: `order_status NOT NULL DEFAULT 'open'`
- `discount_toman`: `BIGINT NOT NULL DEFAULT 0 CHECK (discount_toman >= 0)`
- `version`: `INT NOT NULL DEFAULT 1`
- `created_by`: `UUID REFERENCES auth.users(id)`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `order_items`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `order_id`: `UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `menu_item_id`: `UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT`
- `quantity`: `INT NOT NULL CHECK (quantity > 0)`
- `unit_price_toman`: `BIGINT NOT NULL CHECK (unit_price_toman >= 0)`
- `notes`: `TEXT`
- `status`: `item_status NOT NULL DEFAULT 'pending'`
- `version`: `INT NOT NULL DEFAULT 1`
- `added_by`: `UUID REFERENCES auth.users(id)`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `order_events`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`
- `order_id`: `UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `actor_id`: `UUID REFERENCES auth.users(id)`
- `event_type`: `TEXT NOT NULL` (e.g., `'item_added'`, `'status_changed'`, `'discount_applied'`, `'settled'`, `'item_cancelled'`)
- `payload`: `JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

---

## 5. Security & Multi-Tenant Isolation (RLS Policies)

### 5.1 Multi-Tenant JWT Hook
To eliminate expensive relational joins on every database row lookup:
- `restaurant_id` and `role` are embedded into Supabase auth token claims (`app_metadata`).
- Postgres RLS checks:
  ```sql
  (auth.jwt() -> 'app_metadata' ->> 'restaurant_id')::uuid = restaurant_id
  ```
- All tables enable Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### 5.2 Role-Based Permissions
| Capability | Waiter | Kitchen | Cashier | Manager / Owner |
| :--- | :---: | :---: | :---: | :---: |
| Read tables, menu, orders of branch | ✅ | ✅ | ✅ | ✅ |
| Add new order items | ✅ | ❌ | ✅ | ✅ |
| Cancel `pending` order item | ✅ | ❌ | ✅ | ✅ |
| Cancel `preparing` order item | ❌ | ❌ | ❌ | ✅ |
| Transition `pending` $\rightarrow$ `preparing` $\rightarrow$ `ready` | ❌ | ✅ | ❌ | ✅ |
| Transition `ready` $\rightarrow$ `served` | ✅ | ✅ | ❌ | ✅ |
| Apply discount & settle bill (`paid`) | ❌ | ❌ | ✅ | ✅ |
| Access other restaurants' records | ❌ | ❌ | ❌ | ❌ |

---

## 6. Concurrency & Locking Strategy

1. **Independent Row Insertion:**
   - Waiter A and Waiter B adding items simultaneously execute independent `INSERT INTO order_items` transactions. No lock contention on arrays or JSON blocks.
2. **Conditional Updates (Atomic Prep Locking):**
   - Updating item status checks current version:
     `UPDATE order_items SET status = $new_status, version = version + 1 WHERE id = $id AND version = $version`
   - If version mismatches or item is already cooking, operation aborts with code `CONCURRENCY_ERROR`.
3. **Checkout Lock (`settling`):**
   - Initiating checkout updates order to `settling`.
   - Any new item addition checks order status: additions are disallowed if `paid`. If `settling`, the order version bumps, notifying cashier of pending change.

---

## 7. AI Smart Waiter Scratchpad

- **Target Persona:** Waiter standing bedside/tableside during peak noise.
- **Input:** Persian conversational text or transcribed voice note (e.g., *"دو تا کباب لقمه یکی با کره اضافه، یه قرمه سبزی و دو تا دوغ قوطی"*).
- **Processing Chain:**
  1. Input sanitized and clipped to maximum 300 characters.
  2. Injected into delimited prompt containing the restaurant's active menu vocabulary.
  3. Strict Zod schema enforces: `Array<{ menu_item_id: string, quantity: number, notes: string | null }>`.
  4. Server overrides any model-generated prices with direct database lookups from `menu_items`.
  5. 4-second hard timeout. If timeout or parser error occurs, graceful client-side fallback prompts manual item selection without blocking order creation.

---

## 8. Out-of-Scope Items (Strictly Excluded for MVP)

To guarantee high engineering rigor and complete the production-quality loop in 6 hours, the following items are formally out of scope:
1. **Direct Bank POS Terminal Hardware Driver (Behpardakht, Saman, Pasargad):** Cashiers use existing countertop terminals and confirm payment in-software.
2. **Moadian Tax Signature & Token Infrastructure:** Statutory 10% VAT is calculated and itemized; direct cryptographic reporting to the Tax Administration is excluded.
3. **Recipe Bill of Materials (BOM) & Inventory Depletion:** Tracking grams of saffron or beef per kabab is excluded.
4. **SnappFood / Third-Party Delivery Integrations:** Dining room and floor operations only.
5. **Customer Chatbots & Forecasting Algorithms:** AI is focused strictly on the waiter scratchpad workflow.
6. **Menu / Table / Staff Admin CRUD UIs:** Populated deterministically via `seed.sql`.

---

## 9. Definition of Done & Acceptance Criteria

1. **Multi-Tenant Isolation Test:** Automated Playwright test verifies Tenant A staff cannot query or mutate Tenant B orders, tables, or items.
2. **Shift Workflow Test:** Automated Playwright test verifies complete loop: Waiter creates order $\rightarrow$ KDS marks prep/ready $\rightarrow$ Cashier applies discount, verifies 10% VAT, and settles bill.
3. **Real-time Live Sync:** KDS updates automatically when items are added or marked ready without full page reloads.
4. **AI Scratchpad Functionality:** Translates colloquial Persian notes into valid order items with zero-trust price resolution and graceful fallback.
5. **Senior Touches Delivered:** One-click role switcher on `/login`, structured audit logging in `order_events`, and immutable historical pricing in `order_items.unit_price_toman`.
6. **Production Deployment:** Live on Vercel with responsive RTL layout using Vazirmatn typography.

---
*(End of SCOPE.md — Frozen Baseline)*