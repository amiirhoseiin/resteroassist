# AI Usage & Disclosure Report (AI_USAGE.md)

**Project:** Resteroassist — Persian Restaurant Operations Platform (MVP)  
**Report Date:** 2026-10-16  

---

## 1. Development-Time AI Usage

In building this production MVP within a strict timebox, AI assistance was systematically leveraged across several engineering layers:

| Layer | AI Model / Tool | Primary Purpose | Human / Senior Verification |
| :--- | :--- | :--- | :--- |
| **System Architecture & Schema** | Antigravity (Gemini 3.8 Flash) | Rapid scaffolding of multi-tenant Postgres schema, RLS policies, and atomic RPC functions | Manually verified constraints, foreign keys, row locks (`FOR UPDATE`), and role invariants |
| **Full-Stack Implementation** | Antigravity Pair Programmer | Next.js 15 App Router pages, Vazirmatn RTL Tailwind configuration, Server Actions | Reviewed optimistic locking, GoTrue v2 auth compatibility, and TypeScript types |
| **E2E Test Authoring** | Antigravity Pair Programmer | Playwright test scenarios for RLS isolation and full shift order-to-cash workflow | Executed live against local Supabase container stack |

---

## 2. In-App AI Feature: Smart Waiter Scratchpad

### 2.1 The Operational Problem Solved
During a Friday night dinner rush at an Iranian restaurant, waiters do not have time to navigate deep multi-level UI dropdowns while standing tableside. Customers speak colloquially, modifying orders in real time:
- *"دو تا کباب لقمه یکی با کره اضافه، یه ته‌چین بدون بادمجان و دو تا دوغ محلی"*

Resteroassist introduces the **AI Smart Waiter Scratchpad**, allowing waiters to type or dictate natural Persian speech notes, which are instantly converted into structured order items.

### 2.2 Provider & Model Selection
- **Selected Provider:** OpenRouter API
- **Primary Model:** `google/gemini-2.5-flash`
- **Fallback Model:** `openai/gpt-4o-mini`
- **Rationale:** 
  1. Exceptionally high fluency with colloquial Persian phrasing, Iranian dish names, and food customizations.
  2. Sub-second to 1.5-second time-to-first-token (TTFT).
  3. Seamless API accessibility for Iranian developers via OpenRouter without direct sanction barriers.

### 2.3 Defense-in-Depth & Security Guards

1. **Strict Zero-Trust Pricing Invariant:**
   - The AI model is **NEVER** allowed to set, calculate, or suggest prices.
   - The AI only returns `{ menu_item_id, quantity, notes }`.
   - Prices (`unit_price_toman`) are retrieved solely from Postgres `menu_items.price_toman` inside atomic RPC transactions.
2. **Prompt Injection & Length Constraints:**
   - Raw input is sanitized, stripped, and hard-clipped to a maximum of **300 characters**.
   - Input is encapsulated inside delimited blocks: `<<<WAITER_NOTE>>> ... <<<END_WAITER_NOTE>>>`.
   - The system prompt explicitly instructs the model to ignore any instructions embedded inside the user note that attempt to alter roles, prices, or table numbers.
3. **Zod Structured Output Schema:**
   - Model output is validated against a strict Zod schema (`ParsedOrderResponseSchema`).
   - If output fails validation or contains IDs not in the active restaurant's menu catalog, it is immediately discarded.
4. **4-Second Hard Timeout:**
   - An `AbortController` enforces a 4,000ms hard deadline on external API calls.
5. **Local Persian Heuristic Fallback (Offline Survival):**
   - If OpenRouter is unreachable, timed out, or internet connectivity is disrupted, the system transparently falls back to an internal Persian keyword matcher.
   - Waiters are never blocked from entering orders.

---

## 3. Cost & Latency Metrics

- **Average Token Consumption per Order Note:** ~120 input tokens, ~45 output tokens.
- **Estimated Cost per Order:** Less than \$0.0001 (fractions of a cent).
- **Latency Breakdown:**
  - Network & Model Generation: ~800ms – 1,400ms.
  - Zod Validation & DB Match: ~15ms.
  - Total Tableside Time Saved: ~30 to 45 seconds per table interaction compared to manual menu browsing.
