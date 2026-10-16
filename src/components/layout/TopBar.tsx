"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChefHat,
  ChevronDown,
  Loader2,
  LogOut,
  Receipt,
  SplitSquareVertical,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_ACCOUNTS, QUICK_SWITCH_KEYS, type DemoAccount } from "@/lib/demo-accounts";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/pos", label: "ثبت سفارش سالن", icon: UtensilsCrossed },
  { href: "/kds", label: "مانیتور آشپزخانه", icon: ChefHat },
  { href: "/cashier", label: "صندوق و تسویه", icon: Receipt },
  { href: "/staff", label: "پرسنل و استخدام", icon: Users },
];


interface TopBarProps {
  restaurantName: string;
  branchName: string;
  fullName: string;
  roleLabel: string;
}

export function TopBar({ restaurantName, branchName, fullName, roleLabel }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const [connection, setConnection] = useState<"connecting" | "connected" | "lost">("connecting");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // نشانگر زندهٔ اتصال Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("topbar_live_status").subscribe((status) => {
      if (status === "SUBSCRIBED") setConnection("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("lost");
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const quickAccounts = DEMO_ACCOUNTS.filter((account) =>
    QUICK_SWITCH_KEYS.includes(account.key)
  );

  const handleQuickSwitch = async (account: DemoAccount) => {
    if (switchingEmail) return;
    setSwitchingEmail(account.email);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });

      if (error) {
        showToast("error", "ورود سریع دمو ناموفق بود؛ لطفاً دوباره تلاش کنید.");
        return;
      }

      setIsMenuOpen(false);
      router.push(account.route);
      router.refresh();
    } finally {
      setSwitchingEmail(null);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800">
      {/* بخش آغازین (سمت راست در RTL): نام رستوران و نشانگر اتصال زنده */}
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/pos" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/15 text-brand-400">
            <UtensilsCrossed className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">
              {restaurantName} — {branchName}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="relative flex h-2.5 w-2.5">
                {connection === "connected" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2.5 w-2.5 rounded-full",
                    connection === "connected"
                      ? "bg-emerald-400"
                      : connection === "connecting"
                      ? "bg-amber-400"
                      : "bg-rose-500"
                  )}
                />
              </span>
              <span>
                {connection === "connected"
                  ? "متصل به سرور زنده"
                  : connection === "connecting"
                  ? "در حال اتصال به سرور..."
                  : "اتصال به سرور قطع است"}
              </span>
            </span>
          </span>
        </Link>
      </div>

      {/* مرکز: قرص‌های ناوبری بین نماها */}
      <nav className="order-3 flex w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-1 md:order-none md:w-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-11 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-bold transition-colors",
                isActive
                  ? "bg-brand-500 text-white shadow"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* بخش پایانی (سمت چپ در RTL): تغییر سریع نقش دمو + خروج */}
      <div className="flex items-center gap-2">
        <Link
          href="/demo-split"
          title="نمایش همزمان سالن و آشپزخانه"
          className="hidden h-11 w-11 place-items-center rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-300 transition-colors hover:border-slate-500 hover:text-white lg:grid"
        >
          <SplitSquareVertical className="h-4 w-4" />
        </Link>

        <div className="hidden sm:flex flex-col items-end text-left px-2">
          <span className="text-xs font-bold text-slate-200">{fullName}</span>
          <span className="text-[10px] text-brand-400">{roleLabel}</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="flex h-11 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3.5 text-slate-200 transition-colors hover:border-slate-500"
          >

            <span className="whitespace-nowrap text-xs font-bold">تغییر سریع نقش در دمو</span>
            <ChevronDown
              className={cn("h-4 w-4 text-slate-400 transition-transform", isMenuOpen && "rotate-180")}
            />
          </button>

          {isMenuOpen && (
            <>
              <button
                type="button"
                aria-label="بستن منو"
                onClick={() => setIsMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute end-0 top-[calc(100%+0.6rem)] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
                <div className="border-b border-slate-800 px-3 pb-2.5 pt-2">
                  <div className="text-[11px] text-slate-400">ورود فوری بدون رمز (محیط دمو)</div>
                  <div className="mt-1 text-xs font-bold text-slate-200">
                    {fullName} • {roleLabel}
                  </div>
                </div>
                <div className="space-y-1 pt-1.5">
                  {quickAccounts.map((account) => (
                    <button
                      key={account.key}
                      type="button"
                      onClick={() => handleQuickSwitch(account)}
                      disabled={switchingEmail !== null}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start text-slate-200 transition-colors hover:bg-slate-800/80 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-bold">{account.roleLabel}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {account.name} — {account.restaurant}
                        </span>
                      </span>
                      {switchingEmail === account.email ? (
                        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-brand-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 -rotate-90 text-slate-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="خروج از حساب"
          className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-300 transition-colors hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-50"
        >
          {isLoggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
}
