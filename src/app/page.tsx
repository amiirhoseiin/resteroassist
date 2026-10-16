import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = user.app_metadata?.role;
  if (role === "kitchen") {
    redirect("/kds");
  } else if (role === "cashier") {
    redirect("/cashier");
  } else {
    redirect("/pos");
  }
}
