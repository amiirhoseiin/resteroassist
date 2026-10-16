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
  BookOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_ACCOUNTS, QUICK_SWITCH_KEYS, type DemoAccount } from "@/lib/demo-accounts";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/pos", label: "سفارش سالن", icon: UtensilsCrossed },
  { href: "/kds", label: "مانیتور آشپزخانه", icon: ChefHat },
  { href: "/cashier", label: "صندوق و تسویه", icon: Receipt },
  { href: "/menu", label: "منو و قیمت‌ها", icon: BookOpen },
  { href: "/staff", label: "مدیریت پرسنل و دسترسی‌ها", icon: Users },
];

export const ROLE_ALLOWED_ROUTES: Record<string, string[]> = {
  waiter: ["/pos"],
  kitchen: ["/kds"],
  cashier: ["/cashier", "/pos"],
  manager: ["/pos", "/kds", "/cashier", "/menu", "/staff"],
  owner: ["/pos", "/kds", "/cashier", "/menu", "/staff"],
};

interface TopBarProps {
  restaurantName: string;
  branchName: string;
  fullName: string;
  role?: string;
  roleLabel: string;
}

export function TopBar({ restaurantName, branchName, fullName, role = "manager", roleLabel }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const allowedRoutes = ROLE_ALLOWED_ROUTES[role] || ROLE_ALLOWED_ROUTES.manager;
  const visibleNavItems = NAV_ITEMS.filter((item) => allowedRoutes.includes(item.href));

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
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2 flex items-center justify-between gap-3 border-b border-slate-800">
      {/* بخش آغازین (سمت راست در RTL): نام رستوران و نشانگر اتصال زنده */}
      <div className="flex min-w-0 flex-shrink-0 items-center gap-3">
        <Link href="/pos" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-400">
            <UtensilsCrossed className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <span className="block truncate text-xs sm:text-sm font-bold text-slate-100">
              {restaurantName} — {branchName}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="relative flex h-2 w-2">
                {connection === "connected" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
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
                  ? "در حال اتصال..."
                  : "قطع ارتباط"}
              </span>
            </span>
          </div>
        </Link>
      </div>

      {/* مرکز: قرص‌های ناوبری بین نماها (منطبق با نقش کاربر) */}
      <nav className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-1 flex-shrink">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-8 sm:h-8.5 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 sm:px-3 text-xs font-bold transition-all",
                isActive
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* بخش پایانی (سمت چپ در RTL): تغییر سریع نقش دمو + خروج */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/demo-split"
          title="نمایش همزمان سالن و آشپزخانه"
          className="hidden h-9 w-9 place-items-center rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-300 transition-colors hover:border-slate-500 hover:text-white xl:grid"
        >
          <SplitSquareVertical className="h-4 w-4" />
        </Link>

        <div className="hidden md:flex flex-col items-end text-left px-1.5">
          <span className="text-xs font-bold text-slate-200">{fullName}</span>
          <span className="text-[10px] text-amber-400">{roleLabel}</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/70 px-2.5 sm:px-3 text-slate-200 transition-colors hover:border-slate-500"
          >
            <span className="whitespace-nowrap text-xs font-bold hidden sm:inline">تغییر نقش</span>
            <span className="whitespace-nowrap text-xs font-bold sm:hidden">نقش</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", isMenuOpen && "rotate-180")}
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
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-300 transition-colors hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-50"
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
