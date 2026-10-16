# 🍽️ Resteroassist | Real-Time Restaurant & Café Order-to-Cash Platform

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%7C%20RLS%20%7C%20Realtime-emerald?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-RTL%20%7C%20Vazirmatn-sky?logo=tailwindcss)](https://tailwindcss.com/)
[![Playwright](https://img.shields.io/badge/E2E%20Tests-Playwright%20(9%2F9%20Pass)-green?logo=playwright)](https://playwright.dev/)
[![VAT](https://img.shields.io/badge/VAT%201403-10%25%20Statutory-amber)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)

A high-performance, real-time operations system designed for Iranian independent restaurants and cafés. Resteroassist completely eliminates paper tickets and messaging-app chaos across the critical shift workflow: **Tableside Waiter Order $\rightarrow$ Kitchen Display System (KDS) $\rightarrow$ Cashier Settlement with Statutory 10% VAT**.

---

## 🏗️ System Architecture

```
[Dining Room & Kitchen: Next.js 15 App Router (RTL / Vazirmatn / Dark Slate Theme)]
       │
       ├── 1. Live Subscriptions & Realtime State (WebSockets)
       │      └──► [Supabase Realtime (postgres_changes) & PostgREST (Protected by RLS)]
       │
       ├── 2. Atomic State Mutations & Business Invariants
       │      └──► [Postgres Stored RPC Functions with Row-Level Granularity (SECURITY INVOKER)]
       │             ├── rpc_create_order
       │             ├── rpc_add_order_item (Zero-Trust pricing resolved from DB catalog)
       │             ├── rpc_update_item_status (Optimistic locking via version column)
       │             ├── rpc_cancel_order_item (Cooking Lock invariant: protects food on stove)
       │             ├── rpc_apply_order_discount (Restricted to Cashier/Manager roles)
       │             └── rpc_settle_order (10% VAT calculation & atomic invoice sealing)
       │
       └── 3. AI Smart Waiter Scratchpad (Voice/Text to Structured Order Items)
              └──► [Next.js Server Action]
                     ├── Input sanitization & 300-character boundary clamp
                     ├── Dynamic menu context injection
                     ├── Structured output validation via Zod Schema
                     └── Offline Smart Engine fallback (zero-dependency deterministic Persian NLP)
```

---

## ⚡ Quickstart (One-Command Setup)

### Prerequisites
- **Node.js**: `v20+` or `v22+`
- **Docker Desktop**: Running locally

### Execution Steps
```bash
# 1. Clone the repository and install dependencies
git clone https://github.com/amiirhoseiin/resteroassist.git
cd resteroassist
npm install

# 2. Start local Supabase container stack (Postgres, Auth, Realtime, Studio)
npx supabase start

# 3. Configure environment variables
cp .env.example .env.local

# 4. Build and launch application
npm run build
npm run start
```

- **Application Web UI:** [http://localhost:3000](http://localhost:3000)
- **Supabase Local Studio:** [http://localhost:54323](http://localhost:54323)
- **Local API Gateway:** [http://127.0.0.1:54321](http://127.0.0.1:54321)

---

## 👥 Demo User Accounts (Pre-Seeded)

The login page (`/login`) includes a **One-Click Role Switcher** for instant testing across all operational roles:

| Role | Staff Name | Email | Tenant / Branch | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Waiter 1** | Amirhossein Rezaei | `amir@roohi.ir` | Roohi Café Restaurant (Bagh-e Ferdows) | `Password123!` |
| **Waiter 2** | Nima Alavi | `nima@roohi.ir` | Roohi Café Restaurant (Bagh-e Ferdows) | `Password123!` |
| **Head Chef (KDS)** | Chef Hassan | `hassan@roohi.ir` | Roohi Café Restaurant (Bagh-e Ferdows) | `Password123!` |
| **Cashier** | Sara Kazemi | `sara@roohi.ir` | Roohi Café Restaurant (Bagh-e Ferdows) | `Password123!` |
| **General Manager** | Reza Mohammadi | `reza@roohi.ir` | Roohi Café Restaurant (Bagh-e Ferdows) | `Password123!` |
| **Tenant 2 Manager** | Farhad Rahimi | `farhad@hizom.ir` | Hizom Charcoal Burgers (Vanak Branch) | `Password123!` |

> **Multi-Tenant Isolation Notice:** Logging in as Farhad Rahimi (Hizom Burgers) guarantees that Roohi Café's tables, orders, staff, and menus are completely invisible and unmodifiable, enforced directly at the Postgres Row-Level Security (RLS) kernel layer.

---

## 🔒 Senior Architectural Highlights

### 1. Kitchen Cooking Lock Invariant
When the kitchen marks an item as `preparing` on the KDS, floor waiters are locked from cancelling it (`rpc_cancel_order_item` throws a permission exception). Cancellation of items already on the grill or stove requires shift-manager escalation, preventing meat waste, kitchen confusion, and food spoilage.

### 2. Statutory Iranian 10% VAT Computation (1403 Budget Law)
Deterministic integer arithmetic executed inside Postgres stored procedures:
$$\text{VAT (10\%)} = \lfloor (\text{Subtotal} - \text{Discount}) \times 0.10 \rfloor$$
$$\text{Grand Total} = (\text{Subtotal} - \text{Discount}) + \text{VAT}$$

### 3. Zero-Trust Pricing & Historical Immutability
The AI model and client frontend are **never** trusted with prices. Unit prices (`unit_price_toman`) are resolved server-side from the active database menu snapshot at the exact moment of order insertion and stored immutably on the order item row, ensuring future menu price adjustments never distort historical accounting records.

### 4. Chef Master Board & KDS Multi-View
The kitchen screen (`/kds`) features three operational perspectives:
- **Chef Master View:** Real-time table board showing location, elapsed time with urgent alerts (>15 min), progress bars, and custom cooking notes.
- **Kanban Pipeline:** 3-stage visual columns (`Pending` $\rightarrow$ `Preparing` $\rightarrow$ `Ready`).
- **Batch Expeditor:** Cross-table aggregation for grill and bar stations (e.g., total skewers of kebab currently demanded).

### 5. Professional Iranian Cashier POS (`/cashier`)
- Styled in unified dark slate and warm saffron amber theme matching floor operations.
- 80mm thermal receipt format with quick print preview (`window.print()`).
- Payment method tabs:
  - **SHEPAB / POS Card Reader:** With optional reference number for bank reconciliation.
  - **Cash:** With instant change-due calculator.
  - **Card-to-Card / Sheba.**
  - **Split Bill (Dongi).**

### 6. Role-Based Navigation & View Isolation (RBAC)
TopBar dynamically adjusts based on the authenticated staff member's role:
- **Waiter:** Only sees `Floor POS` (`/pos`).
- **Kitchen:** Only sees `Kitchen Display` (`/kds`).
- **Cashier:** Sees `Cashier & Checkout` (`/cashier`) and `Floor POS` (`/pos`).
- **Manager & Owner:** Full visibility across all 5 modules including `Menu Management` (`/menu`) and `Staff Management` (`/staff`).

---

## 🧪 Automated Testing (Playwright E2E Suite)

Resteroassist includes an end-to-end automated test suite verifying multi-tenant isolation, real-time shift workflows, and administrative features:

```bash
# Run all end-to-end tests
npm run test:e2e
```

### Verified Test Specs:
1. `tests/ai-scratchpad.spec.ts`: Multi-item note parsing, scoped quantities, custom notes, and unmatched word reporting.
2. `tests/rls-isolation.spec.ts`: Kernel-level proof that Restaurant A staff cannot read, mutate, or inject items into Restaurant B data.
3. `tests/shift-workflow.spec.ts`: Full lifecycle simulation — Waiter takes order $\rightarrow$ KDS cooking lock invariant check $\rightarrow$ Cashier applies discount, verifies 10% VAT, and seals invoice.
4. `tests/staff-and-registration.spec.ts`: Manager hires new staff $\rightarrow$ newly recruited staff logs in successfully; new restaurant self-registration flow.
5. Menu management test: Manager adds new dish, modifies Toman pricing, and toggles real-time availability.

---

## 🚀 Production Deployment (Vercel + Supabase Cloud)

1. Create a project on [Supabase Cloud](https://supabase.com).
2. Push database schema, migrations, and seed data:
   ```bash
   npx supabase link --project-ref your-supabase-project-id
   npx supabase db push
   ```
3. Import the repository into [Vercel](https://vercel.com) and configure the environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Cloud project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon public key.
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role secret key.
   - `OPENROUTER_API_KEY`: OpenRouter API key for Gemini 2.5 Flash (optional; offline engine active by default).
   - `AI_MODEL`: `google/gemini-2.5-flash`
   - `NEXT_PUBLIC_APP_URL`: Your production Vercel URL (e.g. `https://your-restaurant-app.vercel.app`).

---

## 📄 Documentation

- [DECISIONS.md](file:///d:/Freelance%20project/resteroassist/DECISIONS.md): Architectural Decision Records (ADRs), trade-offs, and design rationale.
- [HANDOVER.md](file:///d:/Freelance%20project/resteroassist/HANDOVER.md): Operations manual and shift manager handover guide.
- [AI_USAGE.md](file:///d:/Freelance%20project/resteroassist/AI_USAGE.md): AI architecture, prompt defense-in-depth, and offline NLP fallback specifications.
- [SECURITY_AUDIT_REPORT.md](file:///d:/Freelance%20project/resteroassist/SECURITY_AUDIT_REPORT.md): Red team security assessment, threat modeling, and invariant testing.

---

## ⚖️ License

MIT License. Designed & built for Iranian hospitality operations.
