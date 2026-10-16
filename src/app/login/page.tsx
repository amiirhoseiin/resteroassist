"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/demo-accounts";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ChefHat,
  Flame,
  Loader2,
  Receipt,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ACCOUNT_ICONS: Record<DemoAccount["key"], LucideIcon> = {
  waiter: UtensilsCrossed,
  kitchen: ChefHat,
  cashier: Receipt,
  manager: UserCheck,
  hizom_manager: Flame,
};

const ACCOUNT_COLORS: Record<DemoAccount["key"], string> = {
  waiter: "from-amber-500 to-orange-600",
  kitchen: "from-blue-600 to-cyan-700",
  cashier: "from-emerald-600 to-teal-700",
  manager: "from-purple-600 to-indigo-700",
  hizom_manager: "from-rose-600 to-red-700",
};

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittingEmail, setSubmittingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const routeByRole = (role: string | undefined) => {
    if (role === "kitchen") return "/kds";
    if (role === "cashier") return "/cashier";
    return "/pos";
  };

  const handleLogin = async (e?: React.FormEvent, account?: DemoAccount) => {
    if (e) e.preventDefault();
    setError(null);

    if (account) {
      setSubmittingEmail(account.email);
    } else {
      setLoading(true);
    }

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: account?.email || email,
        password: account?.password || password,
      });

      if (authError) {
        setError("ورود ناموفق بود؛ ایمیل و رمز عبور را بررسی کنید.");
        showToast("error", "ورود ناموفق بود؛ ایمیل و رمز عبور را بررسی کنید.");
        return;
      }

      router.push(account?.route || routeByRole(data.user.app_metadata?.role));
      router.refresh();
    } catch {
      setError("خطای غیرمنتظره در ورود؛ لطفاً دوباره تلاش کنید.");
      showToast("error", "خطای غیرمنتظره در ورود؛ لطفاً دوباره تلاش کنید.");
    } finally {
      setLoading(false);
      setSubmittingEmail(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4 py-8 text-slate-100">
      <div className="w-full max-w-4xl space-y-8">
        {/* سربرگ سامانه */}
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-400">
            <Sparkles className="h-4 w-4 text-brand-400" />
            <span>عملیات زندهٔ رستوران از سفارش تا تسویه</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            سیستم یکپارچه مدیریت شیفت رستوران
          </h1>
          <p className="mx-auto max-w-xl text-sm text-slate-400 sm:text-base">
            گردش کار زندهٔ سالن، آشپزخانه و صندوق؛ همراه با دستیار هوشمند ثبت سفارش و
            مالیات بر ارزش افزوده (۱۰٪)
          </p>
        </div>

        {/* ورود سریع با نقش‌های دمو */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
              <h2 className="text-base font-semibold text-slate-200">
                ورود سریع با نقش‌های کاربری (محیط دمو)
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              رمز یکسان دمو:{" "}
              <span dir="ltr" className="inline-block font-mono">
                Password123!
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_ACCOUNTS.map((account) => {
              const Icon = ACCOUNT_ICONS[account.key];
              const isSubmitting = submittingEmail === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  disabled={submittingEmail !== null || loading}
                  onClick={() => handleLogin(undefined, account)}
                  className="group flex min-h-11 items-start gap-3.5 rounded-xl border border-slate-700/60 bg-slate-800/60 p-4 text-start transition-all hover:border-brand-500/50 hover:bg-slate-800 hover:shadow-lg disabled:opacity-50"
                >
                  <span
                    className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br ${ACCOUNT_COLORS[account.key]} text-white shadow-md transition-transform group-hover:scale-105`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-bold text-slate-100 transition-colors group-hover:text-brand-300">
                      {account.name}
                    </span>
                    <span className="block text-xs font-medium text-brand-400">
                      {account.roleLabel}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {account.restaurant} — {account.branch}
                    </span>
                  </span>
                  {isSubmitting && (
                    <Loader2 className="mt-1 h-4 w-4 flex-shrink-0 animate-spin text-brand-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ورود دستی */}
        <div className="mx-auto max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 backdrop-blur">
          <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">
              یا ورود دستی با ایمیل و رمز عبور
            </h3>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                ایمیل سازمانی
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@roohi.ir"
                dir="ltr"
                suppressHydrationWarning
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                رمز عبور
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                suppressHydrationWarning
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{loading ? "در حال ورود..." : "ورود به سامانه"}</span>
            </button>

            <div className="pt-2 text-center border-t border-slate-700/60">
              <span className="text-xs text-slate-400">رستوران یا کافه جدید هستید؟ </span>
              <a
                href="/register"
                className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
              >
                ثبت‌نام و عضویت مجموعه
              </a>
            </div>
          </form>
        </div>

        {/* پانویس */}
        <div className="space-y-1 text-center text-xs text-slate-500">
          <p>محاسبهٔ قانونی مالیات بر ارزش افزوده (۱۰٪) طبق مقررات جاری</p>
          <p>جداسازی امن داده‌های هر شعبه در سطح پایگاه داده</p>
        </div>

      </div>
    </div>
  );
}
