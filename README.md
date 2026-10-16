# 🍽️ Resteroassist | سامانه عملیات زنده سفارش تا تسویه رستوران و کافه

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%7C%20RLS%20%7C%20Realtime-emerald?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-RTL%20%7C%20Vazirmatn-sky?logo=tailwindcss)](https://tailwindcss.com/)
[![Playwright](https://img.shields.io/badge/E2E%20Tests-Playwright-green?logo=playwright)](https://playwright.dev/)
[![VAT](https://img.shields.io/badge/VAT%201403-10%25%20Statutory-amber)](#)

سامانه تخصصی مدیریت شیفت‌های شلوغ رستوران‌ها و کافه‌های ایرانی برای حذف کامل کاغذبازی و چت‌گروه‌ها در چرخه **«سفارش سر میز $\rightarrow$ نمایشگر آشپزخانه (KDS) $\rightarrow$ صندوق و تسویه مالی با محاسبه ارزش افزوده ۱۰٪»**.

---

## 🏗️ معماری سامانه (System Architecture)

```
[کاربران سالن و آشپزخانه: Next.js 15 App Router (راست‌چین RTL / فونت وزیرمتن)]
       │
       ├── ۱. اشتراک‌های بلادرنگ (WebSockets)
       │      └──► [Supabase Realtime (postgres_changes) & PostgREST (محافظت‌شده با RLS)]
       │
       ├── ۲. جهش‌های اتمیک وضعیت (ثبت سفارش / تغییر وضعیت پخت / تسویه مالی)
       │      └──► [توابع ذخیره‌شده Postgres RPC با قفل‌گذاری سطرها (SECURITY INVOKER)]
       │             ├── rpc_create_order
       │             ├── rpc_add_order_item (قیمت‌گذاری Zero-Trust از دیتابیس)
       │             ├── rpc_update_item_status (قفل همزمانی نسخه version)
       │             ├── rpc_cancel_order_item (قفل پخت هوشمند آشپزخانه)
       │             ├── rpc_apply_order_discount (اعمال تخفیف با دسترسی صندوق/مدیر)
       │             └── rpc_settle_order (محاسبه دقیق ارزش افزوده ۱۰٪ و بستن فاکتور)
       │
       └── ۳. دستیار صوتی/متنی یادداشت هوشمند گارسون (AI Scratchpad)
              └──► [Server Action در Next.js]
                     ├── پاکسازی ورودی و محدودیت حداکثر ۳۰۰ کاراکتر
                     ├── ارسال کاتالوگ منوی جاری به OpenRouter (Gemini 2.5 Flash)
                     ├── اعتبارسنجی خروجی ساختاریافته با Zod Schema
                     └── فال‌بک خودکار به موتور محلی در شرایط قطعی اینترنت
```

---

## ⚡ راه‌اندازی سریع با یک فرمان (One-Command Setup)

### پیش‌نیازها
- **Node.js**: نسخه 20+ یا 22+
- **Docker Desktop**: در حال اجرا

### مراحل اجرا
```bash
# ۱. کلون و نصب پکیج‌ها
git clone https://github.com/your-username/resteroassist.git
cd resteroassist
npm install

# ۲. روشن کردن استک کانتینری Supabase (شامل Postgres, Auth, Realtime, Studio)
npx supabase start

# ۳. تنظیم متغیرهای محیطی
cp .env.example .env.local

# ۴. اجرای بیلد و سرور توسعه
npm run build
npm run dev
```

سامانه روی آدرس `http://localhost:3000` و استودیو مدیریت دیتابیس روی `http://localhost:54323` در دسترس خواهند بود.

---

## 👥 حساب‌های کاربری دمو (Demo Accounts)

در صفحه لاگین (`/login`) دکمه‌های **ورود سریع تک‌کلیکی (One-Click Role Switcher)** برای تست آسان تمام نقش‌ها تعبیه شده است:

| نقش | نام پرسنل | ایمیل | شعبه / مستأجر | رمز عبور |
| :--- | :--- | :--- | :--- | :--- |
| **گارسون ۱** | امیرحسین رضایی | `amir@roohi.ir` | کافه رستوران روحی (باغ فردوس) | `Password123!` |
| **گارسون ۲** | نیما علوی | `nima@roohi.ir` | کافه رستوران روحی (باغ فردوس) | `Password123!` |
| **سرآشپز (KDS)** | استاد حسن | `hassan@roohi.ir` | کافه رستوران روحی (باغ فردوس) | `Password123!` |
| **صندوق‌دار** | سارا کاظمی | `sara@roohi.ir` | کافه رستوران روحی (باغ فردوس) | `Password123!` |
| **مدیر کل** | رضا محمدی | `reza@roohi.ir` | کافه رستوران روحی (باغ فردوس) | `Password123!` |
| **مدیر مستأجر ۲** | فرهاد رحیمی | `farhad@hizom.ir` | برگر زغالی هیزم (شعبه ونک) | `Password123!` |

> **نکته ایزولاسیون چندمستأجری (Multi-Tenancy):** با ورود با حساب فرهاد رحیمی (برگر هیزم)، هیچ‌یک از میزها، سفارش‌ها یا منوی کافه روحی قابل مشاهده یا دستکاری نخواهد بود (تضمین‌شده در هسته Postgres RLS).

---

## 🔒 ویژگی‌های ارشد مهندسی (Senior Architectural Highlights)

1. **قفل پخت آشپزخانه (Cooking Lock Invariant):**
   - هنگامی که آشپزخانه سفارش را از `pending` به `preparing` تغییر می‌دهد، گارسون دیگر اجازه لغو آن را ندارد (`rpc_cancel_order_item` خطای امنیتی پرتاب می‌کند). لغو غذای در حال پخت صرفاً با دسترسی مدیر شیفت ممکن است تا از دورریز گوشت و مواد جلوگیری شود.
2. **محاسبه قانونی ارزش افزوده ۱۰٪ (مصوب ۱۴۰۳):**
   - محاسبه به صورت اتمیک در پایگاه داده انجام می‌شود:
     $$\text{VAT} = \lfloor (\text{Subtotal} - \text{Discount}) \times 0.10 \rfloor$$
     $$\text{Grand Total} = (\text{Subtotal} - \text{Discount}) + \text{VAT}$$
3. **قیمت‌گذاری Zero-Trust و تاریخچه تغییرناپذیر:**
   - هوش مصنوعی هرگز حق ارسال قیمت ندارد. قیمت واحد (`unit_price_toman`) در لحظه ثبت از منوی دیتابیس کپی و فریز می‌شود تا تورم و تغییرات آتی منو، فاکتورهای گذشته را تغییر ندهد.
4. **صفحه نمایش همزمان (Split View):**
   - مسیر `/demo-split` سالن و آشپزخانه را در دو پنل کنار هم نمایش می‌دهد تا تغییرات زنده وب‌سوکت در لحظه قابل مشاهده باشد.
5. **لاگین ساختاریافته ممیزی (Audit Logging):**
   - تمامی وقایع با جزئیات در جدول `order_events` ثبت و ساختار JSON آن به خروجی کنسول/سرور ارسال می‌شود.

---

## 🧪 اجرای آزمون‌های خودکار (E2E Tests)

آزمون‌های Playwright رفتار چندمستأجری و کل چرخه شیفت کاری را می‌سنجند:

```bash
# اجرای تست‌های Playwright
npm run test:e2e
```

- `tests/rls-isolation.spec.ts`: اثبات عدم امکان خواندن یا نوشتن داده‌های مستأجر ب توسط مستأجر الف در سطح دیتابیس و رابط کاربری.
- `tests/shift-workflow.spec.ts`: شبیه‌سازی کامل شیفت — ثبت سفارش گارسون، شروع پخت آشپزخانه، تست قفل پخت، آماده‌سازی، اعمال تخفیف، محاسبه ارزش افزوده ۱۰٪ و تسویه نهایی صندوق.

---

## 🚀 استقرار روی Vercel (Production Deployment)

1. ایجاد یک پروژه در [Supabase Cloud](https://supabase.com).
2. اجرای مایگریشن و سید:
   ```bash
   npx supabase db push
   ```
3. ایمپورت مخزن در [Vercel](https://vercel.com) و تنظیم متغیرهای محیطی:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENROUTER_API_KEY`
   - `AI_MODEL=google/gemini-2.5-flash`
   - `NEXT_PUBLIC_APP_URL`
