import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { 
  UtensilsCrossed, 
  ChefHat, 
  Receipt, 
  SplitSquareVertical, 
  LogOut, 
  Building2, 
  User, 
  ShieldCheck 
} from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch staff profile with restaurant and branch names
  const { data: profile } = await supabase
    .from("staff_profiles")
    .select(`
      full_name,
      role,
      restaurants (name),
      branches (name)
    `)
    .eq("id", user.id)
    .single();

  const fullName = profile?.full_name || user.user_metadata?.full_name || "کاربر سیستم";
  const role = profile?.role || user.app_metadata?.role || "waiter";
  // @ts-expect-error join types
  const restaurantName = profile?.restaurants?.name || "رستوران دمو";
  // @ts-expect-error join types
  const branchName = profile?.branches?.name || "شعبه مرکزی";

  const ROLE_LABELS: Record<string, { label: string; badge: string }> = {
    waiter: { label: "گارسون سالن", badge: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    kitchen: { label: "آشپزخانه (KDS)", badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    cashier: { label: "صندوق‌دار", badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    manager: { label: "مدیر شیفت", badge: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    owner: { label: "مالک مجموعه", badge: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  };

  const currentRoleInfo = ROLE_LABELS[role] || { label: role, badge: "bg-slate-800 text-slate-300" };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Operations Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Restaurant & Branch Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-100 tracking-tight">
                  {restaurantName}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {branchName}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                سامانه ابری Resteroassist • گردش سفارش تا تسویه
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <Link
              href="/pos"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-850 transition-colors"
            >
              <UtensilsCrossed className="w-4 h-4 text-amber-400" />
              <span>میزها و سفارش‌گیر</span>
            </Link>
            <Link
              href="/kds"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-850 transition-colors"
            >
              <ChefHat className="w-4 h-4 text-blue-400" />
              <span>نمایشگر آشپزخانه (KDS)</span>
            </Link>
            <Link
              href="/cashier"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-850 transition-colors"
            >
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>صندوق و فاکتور</span>
            </Link>
            <Link
              href="/demo-split"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-colors"
            >
              <SplitSquareVertical className="w-4 h-4" />
              <span>نمایش همزمان (Split View)</span>
            </Link>
          </nav>

          {/* User Profile & Role & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end text-left">
              <span className="text-xs font-semibold text-slate-200">{fullName}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${currentRoleInfo.badge}`}>
                {currentRoleInfo.label}
              </span>
            </div>

            <form
              action={async () => {
                "use server";
                const supabaseClient = await createClient();
                await supabaseClient.auth.signOut();
                redirect("/login");
              }}
            >
              <button
                type="submit"
                title="خروج از حساب"
                className="p-2 rounded-xl bg-slate-850 hover:bg-rose-500/20 hover:text-rose-400 border border-slate-700/80 text-slate-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="flex md:hidden items-center justify-around gap-1 pt-2.5 mt-2.5 border-t border-slate-800/80 text-xs">
          <Link href="/pos" className="flex items-center gap-1.5 text-slate-300 py-1">
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
            <span>سفارش‌گیر</span>
          </Link>
          <Link href="/kds" className="flex items-center gap-1.5 text-slate-300 py-1">
            <ChefHat className="w-3.5 h-3.5 text-blue-400" />
            <span>آشپزخانه</span>
          </Link>
          <Link href="/cashier" className="flex items-center gap-1.5 text-slate-300 py-1">
            <Receipt className="w-3.5 h-3.5 text-emerald-400" />
            <span>صندوق</span>
          </Link>
          <Link href="/demo-split" className="flex items-center gap-1.5 text-brand-400 py-1">
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>اسپلیت</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
