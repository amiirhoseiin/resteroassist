import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ROLE_LABELS } from "@/lib/utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // دریافت پروفایل پرسنل همراه با نام رستوران و شعبه
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
  const roleLabel = ROLE_LABELS[role] || role;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <TopBar
        restaurantName={restaurantName}
        branchName={branchName}
        fullName={fullName}
        role={role}
        roleLabel={roleLabel}
      />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
