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
The scratchpad is a **two-layer architecture** with a strict priority order in `src/lib/ai-parser.ts`:

1. **Priority 1 — Direct Google Gemini API** (when `GOOGLE_GENERATIVE_AI_API_KEY` is configured): `gemini-3.8-flash` (overridable via `GEMINI_MODEL`), called directly against the Google Generative Language API with structured JSON output, temperature 0.1, and thinking disabled (`thinkingBudget: 0`) for minimal latency.
2. **Priority 2 — OpenRouter relay** (when `OPENROUTER_API_KEY` is configured): `google/gemini-2.5-flash` (overridable via `AI_MODEL`) — an alternative cloud route.
3. **Default engine — offline smart engine** (always available, no key required): a deterministic Persian NLP pipeline (orthographic normalization, token-span fuzzy matching, quantity/note attribution) that runs inside the Next.js server with zero network dependency.

Both cloud layers are strictly optional: the offline engine keeps the scratchpad fully functional — correct quantities, per-item notes, and unmatched-text warnings — even without internet or any configured key, and the cloud path degrades into it automatically on timeout or error.

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
4. **8-Second Hard Timeout & Graceful Degradation:**
   - An `AbortController` enforces an 8,000ms (`AI_REMOTE_TIMEOUT_MS`) hard deadline on each external API call; on timeout — or any error/validation failure — the offline engine takes over seamlessly.
5. **Offline Smart Engine (Default Fallback):**
   - If OpenRouter is unreachable, timed out, not configured, or its output fails validation, the system transparently falls back to the built-in Persian engine.
   - It normalizes Persian orthography (ی/ي، ک/ك، نیم‌فاصله، ارقام فارسی/عربی، اعداد لفظی مرکب مانند «بیست و دو» → ۲۲) and matches menu names with fuzzy token-span alignment — including names containing «و» such as «چای و باقلوای قزوین».
   - Quantities are attributed per item from the correct clause; notes («بدون نعنا»، «کره اضافه»، «کم روغن») attach to their nearest item without bleeding into other dishes.
   - Nothing is dropped silently: unmatched fragments are returned in `unmatched_text`, per-item `confidence` is reported, and the waiter can edit quantity/notes or swap items in the preview dialog before committing.
   - Voice dictation (Persian `fa-IR`) is available via the browser Web Speech API where supported.
   - Waiters are never blocked from entering orders.

---

## 3. Cost & Latency Metrics

- **Average Token Consumption per Order Note:** ~120 input tokens, ~45 output tokens.
- **Estimated Cost per Order:** Less than \$0.0001 (fractions of a cent).
- **Latency Breakdown:**
  - Network & Model Generation (direct Gemini Flash, thinking disabled): typically ~2–4s measured on the demo network; hard-capped at 8s before automatic fallback.
  - Zod Validation & DB Match: ~15ms.
  - Total Tableside Time Saved: ~30 to 45 seconds per table interaction compared to manual menu browsing.
- **Offline Smart Engine (default deployment):** resolves a full note in under 10ms entirely inside the server — no network round-trip, no token cost.

---

## 4. Engineering Reflection (what AI did well, where it failed, and what was human)

### 4.1 Where AI saved real time

- **Scaffolding the schema, RLS, and ~800 lines of atomic PL/pgSQL RPCs** in hours instead of days — the human review then focused on constraints, `FOR UPDATE` locking, and role invariants rather than on typing boilerplate.
- **Authoring the Playwright suites** (multi-tenant isolation, full order-to-cash shift, staff/registration) that were subsequently executed against the live local stack on every change.
- **Drafting the post-audit hardening in one pass** (revoke + `SECURITY DEFINER` conversion + transition matrix + immutability triggers + the 23-check regression battery) — a change set that would normally consume a full senior day — which the human then verified by re-running the whole suite plus fresh attack probes.

### 4.2 Where AI produced something bad (and how it was caught)

- **The cloud-first parser looked fine and was quietly terrible.** With default model "thinking" enabled, generation regularly exceeded the timeout, so every request burned its full budget and fell back — invisible in tests because the fallback masked it. Caught by instrumented latency measurement, fixed by inverting the default (Decision 014).
- **The seed script was generated against pre-GoTrue-v2 assumptions** (empty identity columns); the app worked while seeding silently failed for fresh users. Caught only by a full `supabase db reset` + end-to-end login test (Decision 006).
- **The first security posture sounded rigorous and wasn't.** "Atomic RPCs" existed, but the permissive RLS write policies meant every invariant was bypassable through PostgREST. Caught by commissioning an adversarial red-team audit against the *running* system instead of trusting the design; fixed by Decision 016, and now guarded by a committed regression battery.

### 4.3 One AI recommendation I rejected

- An early design pass suggested letting the model return prices (and even line totals) alongside the parsed items — "fewer round-trips, instant bill preview". **Rejected outright: money is never model output.** The parser returns only `{ menu_item_id, quantity, notes }`; every Toman figure is computed in Postgres from the menu row inside the insert transaction (Decisions 004/016, §2.3). Suggestions that trade a financial invariant for convenience are declined by default.
- Same spirit, second example: "keep cloud-first and just raise the timeout" — rejected because it converts network latency into dead tableside seconds (Decision 014).

### 4.4 How generated code was verified

- **All SQL migrations are human-reviewed** — constraints, locks, role checks, and tenant filters read line-by-line before applying, never merged on "tests pass" alone.
- **Fresh-database end-to-end runs** — `supabase db reset` + the full Playwright suite (currently 9 blocks) exercise the UI paths; nothing ships on a stale database.
- **Adversarial audit + regression battery** — the running stack was attacked from outside the UI (direct PostgREST, JWT manipulation, races); every confirmed finding got a fix *and* a probe (`npm run test:security`, 23 checks) that re-proves it on every reset.
- **Deterministic money math assertions** — VAT is asserted with exact Persian-digit totals, rounded as the law requires, not eyeballed.

### 4.5 Which parts were my own thinking

- **Product scope**: one workflow done completely (order → cook → settle) instead of many half-features.
- **Zero-trust pricing** as a non-negotiable invariant, and the **cooking-lock economics** (wastage prevention as the reason the lock exists, not just a status flag).
- **Offline-first AI inversion** (Decision 014) — a product/operations call about latency at tableside, not a code-generation default.
- **Optimistic locking as a UX promise**: version conflicts surface as "a colleague changed this — review the updated bill", never as a silent overwrite.
- **The post-audit security posture** (Decision 016): choosing revoke + `SECURITY DEFINER` + trigger-backed immutability over duplicated trigger logic — and shipping the audit report plus the regression battery in the repository.
- **All acceptance decisions**: what ships, what is explicitly deferred (rate limiter recorded as a limitation), and what is documented as a breakpoint (§7 handover).

