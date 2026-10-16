"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UtensilsCrossed, ChefHat, Receipt, UserCheck, ShieldAlert, Sparkles, Building2, Flame } from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    role: "waiter",
    name: "امیرحسین رضایی",
    email: "amir@roohi.ir",
    restaurant: "کافه رستوران روحی (مستأجر ۱)",
    badge: "گارسون سالن",
    icon: UtensilsCrossed,
    color: "from-amber-500 to-orange-600",
    route: "/pos",
  },
  {
    role: "kitchen",
    name: "استاد حسن",
    email: "hassan@roohi.ir",
    restaurant: "کافه رستوران روحی (مستأجر ۱)",
    badge: "سرآشپز (KDS)",
    icon: ChefHat,
    color: "from-blue-600 to-cyan-700",
    route: "/kds",
  },
  {
    role: "cashier",
    name: "سارا کاظمی",
    email: "sara@roohi.ir",
    restaurant: "کافه رستوران روحی (مستأجر ۱)",
    badge: "صندوق‌دار و مالی",
    icon: Receipt,
    color: "from-emerald-600 to-teal-700",
    route: "/cashier",
  },
  {
    role: "manager",
    name: "رضا محمدی",
    email: "reza@roohi.ir",
    restaurant: "کافه رستوران روحی (مستأجر ۱)",
    badge: "مدیر کل شیفت",
    icon: UserCheck,
    color: "from-purple-600 to-indigo-700",
    route: "/pos",
  },
  {
    role: "hizom_manager",
    name: "فرهاد رحیمی",
    email: "farhad@hizom.ir",
    restaurant: "برگر زغالی هیزم (مستأجر ۲)",
    badge: "تست ایزولاسیون چندمستأجری",
    icon: Flame,
    color: "from-rose-600 to-red-700",
    route: "/pos",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent, directEmail?: string, targetRoute?: string) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    const loginEmail = directEmail || email;
    const loginPassword = directEmail ? "Password123!" : password;

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) {
        setError(`خطا در ورود: ${authError.message}`);
        setLoading(false);
        return;
      }

      if (targetRoute) {
        router.push(targetRoute);
      } else {
        const role = data.user.app_metadata?.role;
        if (role === "kitchen") {
          router.push("/kds");
        } else if (role === "cashier") {
          router.push("/cashier");
        } else {
          router.push("/pos");
        }
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته در ورود");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-4xl space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span>سامانه عملیات زنده سفارش تا تسویه رستوران و کافه</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-orange-300 to-amber-500 bg-clip-text text-transparent">
            رسترو اسیست | Resteroassist
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            گردش کار بلادرنگ «گارسون $\rightarrow$ نمایشگر آشپزخانه (KDS) $\rightarrow$ صندوق با محاسبه ارزش افزوده ۱۰٪» با هوش مصنوعی دستیار صوتی
          </p>
        </div>

        {/* Quick Role Switcher Grid (Senior Touch) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-base font-semibold text-slate-200">
                ورود سریع با نقش‌های کاربری (تست دمو و تفکیک دسترسی)
              </h2>
            </div>
            <span className="text-xs text-slate-400">رمز یکسان دمو: Password123!</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              return (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleLogin(undefined, acc.email, acc.route)}
                  className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-850 border border-slate-700/60 hover:border-brand-500/50 transition-all text-right group hover:shadow-lg disabled:opacity-50"
                >
                  <div className={`p-2.5 rounded-lg bg-gradient-to-br ${acc.color} text-white shadow-md flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100 group-hover:text-brand-300 transition-colors">
                        {acc.name}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-brand-400">
                      {acc.badge}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {acc.restaurant}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Manual Credentials Box */}
        <div className="max-w-md mx-auto bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
          <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">یا ورود دستی با ایمیل و رمز:</h3>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">ایمیل سازمانی</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@roohi.ir"
                dir="ltr"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">رمز عبور</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm transition-colors shadow-lg shadow-brand-500/20 disabled:opacity-50"
            >
              {loading ? "در حال اتصال به پایگاه داده..." : "ورود به داشبورد"}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500 space-y-1">
          <p>سیستم ایزولاسیون بر پایه Row Level Security (RLS) پایگاه داده پستگرس</p>
          <p>محاسبه قانونی مالیات بر ارزش افزوده ۱۰٪ طبق مقررات ۱۴۰۳</p>
        </div>
      </div>
    </div>
  );
}
