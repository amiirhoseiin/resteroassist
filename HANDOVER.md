# Shift Manager Operations & Handover Guide (HANDOVER.md)

**System:** Resteroassist — Real-Time Restaurant & Café Order-to-Cash Platform  
**Audience:** Restaurant Owners, General Managers, Shift Supervisors, and Floor Leads  
**Tone:** Practical, operational, floor-ready  

---

## 1. Executive Overview & Pain Points Solved

During busy weekend dinner rushes, restaurants and cafés commonly suffer from three critical operational breakdowns:

1. **Lost Paper Slips & Messaging App Chaos:** Waiters scrawl orders on scraps of paper or send unformatted text in messaging groups. Handwriting is misread, paper gets soiled on the pass, and special customer requests (e.g. *"extra butter"*, *"no eggplants"*, *"less milk"*) are overlooked.
2. **Unbilled Add-on Items:** Diners frequently request additional drinks, appetizers, or desserts mid-meal. Waiters shout verbal requests to the kitchen without recording them, leading to customers leaving without being billed for secondary items (direct revenue leakage).
3. **Cashier Confusion with Statutory 10% VAT:** Since 1403, Value-Added Tax (VAT) is legally mandated at 10%. Manual calculations at the checkout desk delay customer departures and introduce bookkeeping discrepancies.

**Core Mission:** Eliminate all paper and uncoordinated messaging across the **Dining Room $\rightarrow$ Kitchen $\rightarrow$ Cashier** lifecycle, ensuring zero lost items, accurate tax reporting, and zero revenue leakage.

---

## 2. Step-by-Step Shift Operations

### Step 1: Dining Room Waiters (Tableside Ordering)
- Waiters access **Floor POS** (`/pos`) on their smartphone or tablet.
- Tapping a table (e.g. Table 4) opens the live order ticket.
- **AI Smart Waiter Scratchpad:**  
  Instead of scrolling through multi-level menus, waiters can type or voice-dictate natural colloquial Persian customer notes:  
  *«۲ تا کباب لقمه یکی با کره اضافه، یه ته‌چین بدون بادمجان و دو تا دوغ محلی»*  
  Tapping **«شناسایی هوشمند اقلام» (Identify Items Intelligently)** instantly resolves the dishes against the active menu catalog with official database pricing.
- **Concurrent Waiter Ordering:** If two waiters take orders for the same table simultaneously (e.g. food vs. drinks), both orders merge seamlessly without race conditions or data loss.

### Step 2: Kitchen & Bar (Kitchen Display System — KDS)
- Kitchen tablets or monitors display the **Kitchen Monitor** (`/kds`).
- New orders appear immediately with an audible chime and amber alert banner via Supabase Realtime WebSockets (no manual browser refresh needed).
- Chefs start preparation by clicking **«شروع پخت» (Start Cooking)** on the ticket.
- **Cooking Lock Invariant:**  
  Once an item status transitions to `preparing`, floor staff are locked from cancelling it. If a guest changes their mind, the system notifies the waiter: *"Kitchen has already started cooking; cancellation requires shift-manager approval."* This directly prevents kitchen disputes and meat/ingredient wastage.
- When food is ready, the chef clicks **«آماده شد» (Mark Ready)** to alert floor staff for immediate pickup.

### Step 3: Cashier & Settlement (Checkout POS)
- Cashiers open **Cashier & Checkout** (`/cashier`).
- Tables awaiting settlement appear in the sidebar with live item counts and unbilled timers.
- Selecting a table loads an 80mm fiscal receipt preview detailing all consumed items, quantities, and preparation notes.
- **Discounts:** Cashiers can apply quick 5% or 10% discounts or enter custom Toman amounts.
- **Automatic 10% VAT Calculation:**  
  $$\text{Net Total} = \text{Subtotal} - \text{Discount}$$
  $$\text{VAT (10\%)} = \lfloor \text{Net Total} \times 0.10 \rfloor$$
  $$\text{Grand Total} = \text{Net Total} + \text{VAT}$$
- **Payment Method Selection:** Cashiers select the payment channel:
  - POS card reader (with optional reference number for bank reconciliation).
  - Cash (with change-due calculation).
  - Card-to-Card / Sheba.
  - Split bill (Dongi).
- Clicking **«تأیید نهایی پرداخت و بستن میز» (Confirm Payment & Settle)** seals the bill atomically, releases the table for new diners, and archives the transaction in shift records.

---

## 3. Incident Management & Edge Cases (SOP)

| Scenario | System Behavior & Staff Action |
| :--- | :--- |
| **Internet Outage or High Latency** | The system is designed to operate locally. The Smart Waiter Scratchpad automatically falls back to its built-in offline Persian NLP pipeline without needing external cloud APIs. Manual 1-tap item selection remains fully functional. |
| **Simultaneous Order Additions** | Row-level PostgreSQL concurrency ensures additions from multiple devices insert independent item records. No orders overwrite each other. |
| **Late Item Addition During Checkout** | If a waiter adds an item while the cashier is reviewing the bill, the invoice version increments and prompts the cashier to review the updated total before finalizing payment. |
| **Sudden Kitchen Power Loss** | All orders, statuses, and versions are continuously committed to PostgreSQL. When power returns and devices restart, the KDS displays the exact live order board. |

---

## 4. Administrative Controls (Menu & Staff)

1. **Staff Management (`/staff`):**
   - General Managers and Owners can recruit new staff members, set credentials, and assign branches and roles (`waiter`, `kitchen`, `cashier`, `manager`).
   - Role permissions can be updated on the fly; they take effect on that staff member's device at their next sign-in or token refresh, and removing a staff member blocks their future sign-ins.

2. **Menu & Price Management (`/menu`):**
   - Managers have complete control over item names, categories, and Toman pricing.
   - When a dish runs out during a shift, toggling the availability badge (`موجود` / `تمام شد`) immediately updates tableside waiter pickers across all floor devices.

---

## 5. Known Limitations (stated plainly)

1. **Multi-branch views are not filtered yet.** Every screen shows all branches of the restaurant together; the data model already stores `branch_id` on every operational table, but the UI does not filter by it. Single-branch venues (today's customers) are unaffected.
2. **Role changes ride the sign-in token.** A role change or staff removal takes effect at that person's next sign-in or token refresh (§4). There is no instant-revocation list in this MVP.
3. **The AI scratchpad is authenticated but not rate-limited.** SCOPE §3 lists a rate limiter; it is the top-ranked next build (§6). Mitigation today: the deterministic offline engine is the default path, and the optional cloud call is bounded by an 8-second timeout.
4. **The automated suites expect a fresh database.** Run `npx supabase db reset` before `npm run test:e2e` or `npm run test:security` (neither is idempotent on a dirty database yet).
5. **Route-level role gating is cosmetic.** Any signed-in staff member can open any dashboard URL (e.g. a waiter could open `/kds`). Data stays within their restaurant and every action is re-authorized in the database, so this is UI polish, not a hole.
6. **Un-mapped server errors surface in English.** Common failure paths are translated to Persian client-side; rare database errors show the raw English text.
7. **No physical receipt printer yet.** The 80mm receipt exists as a print-ready on-screen preview; ESC/POS printer integration and a formal fiscal/Z-report export are next-phase work.

---

## 6. The Next Five Things I Would Build (ranked)

1. **AI rate limiting + cloud-spend circuit breaker** — the only unmet item in SCOPE §3's AI guard list and the last open security-audit finding (F-08). Cheap to add, closes abuse before any public launch.
2. **Durable test fixtures (idempotent suites)** — today both suites must run on a fresh `db reset`; fixtures with per-spec isolation make CI trustworthy (also audit F-10).
3. **Branch-aware filtering across POS / KDS / cashier / reports** — the data model is ready; only the UI filter is missing, and any second-branch customer hits this on day one.
4. **Shift close (Z-report) + cash-drawer reconciliation** — settled bills already carry timestamps; adding shift open/close, counted-vs-expected cash, and a discrepancy log turns the cashier module into a real accounting tool.
5. **Receipt printing + fiscal export (per-shift PDF/CSV)** — the 80mm preview exists; printers and export files are what venues ask for next.

---

## 7. Where This Architecture Breaks (10 / 1,000 / 100,000 restaurants)

**At 10 restaurants — the current architecture holds.** One Supabase project + Vercel handle the volume comfortably (a busy branch writes a few hundred rows per minute; Postgres is far from its ceiling). Operations remain manual: migrations applied by hand, demo data seeded via `supabase db reset`, monitoring left to platform defaults. The first real pain is *support*: 10 venues already generate enough "please fix X for us" traffic that per-tenant metrics (settle failures, realtime drops) pay for themselves.

**At 1,000 restaurants — you need a control plane and observability before the database needs scaling.** What breaks first is operations: tenant onboarding must become scripted and self-serve (branch/table provisioning, menu seeding, staff invites); migrations must be fleet-wide, zero-downtime, and rollback-capable; and someone must *see* production — structured logs shipped to a sink, alerts on the money paths (`rpc_settle_order`, `rpc_create_order`, `rpc_update_item_details`), and per-tenant realtime health. Postgres wants read replicas for reporting and a job runner (pg_cron/queues) for nightly exports. Tenancy shifts toward one organization with per-region projects, or dedicated projects for large chains.

**At 100,000 restaurants — this is a different company and a re-architecture.** A single primary cannot absorb the global write rate; RLS-as-tenancy still works logically, but physically you shard into regional cells (each cell = a Postgres cluster + its tenants + its realtime), with an event stream (Kafka/pgstream) feeding cross-cell analytics and regional data-residency. Settlement becomes financial-grade: idempotency keys on every money mutation, double-entry ledger tables, acquirer reconciliation, WORM-style audit storage, and KMS-managed per-tenant encryption. The good news: the seams are already cut right — server-authoritative writes, versioned optimistic locking, sealed-invoice immutability, and keyed audit events are exactly the primitives you would shard along. You would not "run the MVP harder"; you would build the platform the MVP proved the invariants for.

---

## 8. Contact & Support

For system administration, schema migrations, or infrastructure support, refer to [README.md](file:///d:/Freelance%20project/resteroassist/README.md) and [DECISIONS.md](file:///d:/Freelance%20project/resteroassist/DECISIONS.md).
