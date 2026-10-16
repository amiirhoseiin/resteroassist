import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ————————————————————————————————————————————————
// قالب‌بندی مبلغ و اعداد به فارسی (مطابق طراحی RTL)
// ————————————————————————————————————————————————

export function formatToman(amount: number): string {
  return `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`;
}

export function toPersianDigits(num: number | string): string {
  return new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(Number(num));
}

// Format time in Persian locale (e.g. ۱۴:۳۵)
export function formatPersianTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// Elapsed minutes from now
export function getElapsedMinutes(dateInput: string | Date): number {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60)));
}

// مرتب‌سازی طبیعی شماره میزها (مثلاً «میز ۲» قبل از «میز ۱۲» بیاید)
export function parseTableNumber(label: string): number {
  const persianDigits = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
  const latin = label.replace(/[\u06F0-\u06F9]/g, (ch) =>
    String(persianDigits.indexOf(ch))
  );
  const match = latin.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// ————————————————————————————————————————————————
// واژه‌نامه ثابت رابط کاربری (فارسی و RTL)
// ————————————————————————————————————————————————

// برچسب‌های نقش‌های کاربری
export const ROLE_LABELS: Record<string, string> = {
  waiter: "سالن‌دار (گارسون)",
  kitchen: "آشپزخانه (KDS)",
  cashier: "صندوقدار",
  manager: "مدیر شعبه",
  owner: "مالک مجموعه",
};

// وضعیت آیتم‌های سفارش (سالن + آشپزخانه + فاکتور)
export const ITEM_STATUS_MAP: Record<
  string,
  { label: string; badge: string }
> = {
  pending: {
    label: "در انتظار پخت",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  preparing: {
    label: "در حال آماده‌سازی",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  ready: {
    label: "آماده سرو",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  served: {
    label: "سرو شده",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
  },
  cancelled: {
    label: "لغو شده",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
  },
};

// وضعیت سفارش‌ها
export const ORDER_STATUS_MAP: Record<
  string,
  { label: string; badge: string }
> = {
  open: { label: "سفارش فعال", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  settling: { label: "در حال تسویه", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  paid: { label: "تسویه شده", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled: { label: "لغو شده", badge: "bg-rose-100 text-rose-700 border-rose-200" },
};

// وضعیت میز (سالن)
export const TABLE_STATUS_MAP: Record<
  "empty" | "open" | "settling",
  { label: string; badge: string }
> = {
  empty: { label: "خالی و آماده", badge: "bg-slate-100 text-slate-500 border-slate-200" },
  open: { label: "سفارش فعال", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  settling: { label: "در حال تسویه", badge: "bg-amber-100 text-amber-800 border-amber-200" },
};

// ————————————————————————————————————————————————
// ترجمه خطاهای سرور به پیام‌های فارسی قابل نمایش
// ————————————————————————————————————————————————

export function translateServerError(message: string | null | undefined): string {
  const m = (message || "").toLowerCase();

  if (m.includes("kitchen has already started")) {
    return "امکان حذف وجود ندارد؛ آشپزخانه پخت این آیتم را شروع کرده است.";
  }
  if (
    m.includes("concurrency conflict") ||
    m.includes("checkout conflict") ||
    m.includes("version conflict") ||
    m.includes("version mismatch")
  ) {
    return "توجه: این سفارش توسط همکار دیگری به‌روز‌رسانی شد. اطلاعات جدید بارگذاری گردید.";
  }
  if (m.includes("order must be locked for checkout")) {
    return "برای ثبت پرداخت، ابتدا فاکتور را برای تسویه قفل کنید.";
  }
  if (m.includes("checkout requires")) {
    return "برای ثبت پرداخت، صفحه را بروزرسانی کنید و مجدداً اقدام کنید.";
  }
  if (m.includes("cannot exceed order subtotal")) {
    return "مبلغ تخفیف نمی‌تواند از جمع سفارش بیشتر باشد.";
  }
  if (m.includes("only pending items can be edited")) {
    return "امکان ویرایش وجود ندارد؛ فقط اقلام در انتظار پخت قابل تغییر هستند.";
  }
  if (m.includes("paid_order_immutable") || m.includes("settled order") || m.includes("order is already paid")) {
    return "این فاکتور تسویه‌شده است و قابل تغییر نیست.";
  }
  if (m.includes("served items are final") || m.includes("final and cannot be cancelled")) {
    return "آیتم تحویل‌شده نهایی است و قابل لغو نیست.";
  }
  if (
    m.includes("cancelled items cannot be reactivated") ||
    m.includes("cannot be reverted") ||
    m.includes("invalid transition") ||
    m.includes("must go through") ||
    m.includes("unsupported status transition")
  ) {
    return "این تغییر وضعیت برای این آیتم مجاز نیست.";
  }
  if (m.includes("kitchen staff cannot")) {
    return "پرسنل آشپزخانه مجاز به این عملیات نیستند.";
  }
  if (m.includes("only cashiers and managers can apply discounts")) {
    return "فقط صندوقدار و مدیر شعبه مجاز به اعمال تخفیف هستند.";
  }
  if (m.includes("only cashiers and managers can finalize")) {
    return "فقط صندوقدار و مدیر شعبه مجاز به ثبت پرداخت نهایی هستند.";
  }
  if (m.includes("discount") && m.includes("cannot exceed")) {
    return "مبلغ تخفیف نمی‌تواند از جمع کل اقلام بیشتر باشد.";
  }
  if (m.includes("paid order") || m.includes("already settled")) {
    return "این فاکتور قبلاً تسویه شده است.";
  }
  if (m.includes("only kitchen staff")) {
    return "فقط پرسنل آشپزخانه یا مدیر شعبه می‌توانند وضعیت پخت را تغییر دهند.";
  }
  if (m.includes("waiter can only mark ready")) {
    return "سالن‌دار فقط می‌تواند آیتم‌های آماده سرو را «تحویل داده شده» ثبت کند.";
  }
  if (m.includes("cannot be negative")) {
    return "مبلغ تخفیف نمی‌تواند منفی باشد.";
  }
  if (m.includes("not found")) {
    return "مورد مورد نظر در این شعبه یافت نشد.";
  }
  return "خطای غیرمنتظره رخ داد؛ لطفاً دوباره تلاش کنید.";
}
