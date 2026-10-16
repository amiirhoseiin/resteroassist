import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert English digits to Persian digits
export function toPersianDigits(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return "";
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return num
    .toString()
    .replace(/[0-9]/g, (w) => persianDigits[parseInt(w, 10)]);
}

// Format Toman currency with Persian separators and digits
export function formatToman(amount: number | bigint | null | undefined): string {
  if (amount === null || amount === undefined) return "۰ تومان";
  const num = typeof amount === "bigint" ? Number(amount) : amount;
  const formattedWithCommas = new Intl.NumberFormat("fa-IR").format(num);
  return `${formattedWithCommas} تومان`;
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

// Human readable status label in Persian
export const ITEM_STATUS_MAP: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: "در انتظار تایید",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
  },
  preparing: {
    label: "در حال پخت",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
  },
  ready: {
    label: "آماده سرو",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
  },
  served: {
    label: "تحویل داده شد",
    bg: "bg-zinc-500/10",
    text: "text-zinc-500 dark:text-zinc-400",
    border: "border-zinc-500/20",
  },
  cancelled: {
    label: "لغو شده",
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/30",
  },
};

export const ORDER_STATUS_MAP: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  open: { label: "جاری", bg: "bg-emerald-500/10", text: "text-emerald-600" },
  settling: { label: "در حال تسویه", bg: "bg-amber-500/10", text: "text-amber-600" },
  paid: { label: "تسویه شده", bg: "bg-zinc-500/10", text: "text-zinc-500" },
  cancelled: { label: "لغو شده", bg: "bg-rose-500/10", text: "text-rose-600" },
};
