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
  Tapping **«استخراج ساختار یافته» (Parse Structured Order)** instantly resolves the dishes against the active menu catalog with official database pricing.
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
   - Role permissions can be updated on the fly; password resets and role terminations take effect immediately.

2. **Menu & Price Management (`/menu`):**
   - Managers have complete control over item names, categories, and Toman pricing.
   - When a dish runs out during a shift, toggling the availability badge (`موجود` / `تمام شد`) immediately updates tableside waiter pickers across all floor devices.

---

## 5. Contact & Support

For system administration, schema migrations, or infrastructure support, refer to [README.md](file:///d:/Freelance%20project/resteroassist/README.md) and [DECISIONS.md](file:///d:/Freelance%20project/resteroassist/DECISIONS.md).
