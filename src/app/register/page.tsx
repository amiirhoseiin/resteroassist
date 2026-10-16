"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Building2, 
  Store, 
  User, 
  Mail, 
  Lock, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowLeft 
} from "lucide-react";
import { registerRestaurantAction } from "@/actions/staff-actions";
import { createClient } from "@/lib/supabase/client";

export default function RegisterRestaurantPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    restaurantName: "",
    branchName: "شعبه مرکزی",
    ownerFullName: "",
    ownerEmail: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await registerRestaurantAction({
        restaurantName: formData.restaurantName.trim(),
        branchName: formData.branchName.trim(),
        ownerFullName: formData.ownerFullName.trim(),
        ownerEmail: formData.ownerEmail.trim(),
        password: formData.password,
      });

      if (!res.success) {
        setError(res.error || "خطا در ثبت‌نام مجموعه");
        setLoading(false);
        return;
      }

      setSuccess(true);

      // Automatically sign in the new owner
      const supabase = createClient();
      await supabase.auth.signInWithPassword({
        email: formData.ownerEmail.trim(),
        password: formData.password,
      });

      setTimeout(() => {
        router.push("/pos");
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت‌نام");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span>ثبت‌نام و عضویت سریع مجموعه جدید</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-orange-300 to-amber-500 bg-clip-text text-transparent">
            افتتاح شعبه و عضویت در رسترو اسیست
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto">
            سامانه مدیریت عملیات زنده شیفت، نمایشگر آشپزخانه، هوش مصنوعی ثبت سفارش و صندوق با تفکیک ایزوله چندمستأجری
          </p>
        </div>

        {/* Registration Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur shadow-2xl space-y-6">
          {success ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                مجموعه «{formData.restaurantName}» با موفقیت راه‌اندازی شد!
              </h2>
              <p className="text-xs text-slate-400">
                شعبه اصلی، میزهای اولیه و منوی پیش‌فرض آماده شدند. در حال انتقال به پنل مدیریت...
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-brand-400 pt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>ورود خودکار به داشبورد</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Restaurant Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-brand-400" />
                  <span>نام رستوران یا کافه</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.restaurantName}
                  onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                  placeholder="مثال: کافه رستوران بامداد"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Branch Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-brand-400" />
                  <span>نام شعبه اولیه</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.branchName}
                  onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                  placeholder="مثال: شعبه فرمانیه"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Owner Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-400" />
                  <span>نام و نام‌خانوادگی مالک یا مدیر مجموعه</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.ownerFullName}
                  onChange={(e) => setFormData({ ...formData, ownerFullName: e.target.value })}
                  placeholder="مثال: آرش پرتو"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Owner Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand-400" />
                  <span>ایمیل مدیر (جهت ورود به پنل)</span>
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                  placeholder="owner@bamdad.ir"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand-400" />
                  <span>رمز عبور مدیریت</span>
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="حداقل ۶ کاراکتر"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال ایجاد دیتابیس و راه‌اندازی رستوران...</span>
                  </>
                ) : (
                  <span>افتتاح و شروع کار در سامانه</span>
                )}
              </button>
            </form>
          )}

          {/* Login Link */}
          <div className="pt-4 border-t border-slate-800 text-center">
            <span className="text-xs text-slate-400">از قبل عضو سامانه هستید؟ </span>
            <Link
              href="/login"
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              ورود به سیستم
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

