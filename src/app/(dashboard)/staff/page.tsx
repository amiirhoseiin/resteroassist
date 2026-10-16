"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Building2, 
  UtensilsCrossed, 
  ChefHat, 
  Receipt, 
  UserCheck, 
  Mail, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw 
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hireStaffMemberAction } from "@/actions/staff-actions";
import { formatPersianTime } from "@/lib/utils";

interface StaffProfile {
  id: string;
  restaurant_id: string;
  branch_id: string;
  full_name: string;
  role: "owner" | "manager" | "cashier" | "waiter" | "kitchen";
  created_at: string;
  branches?: { name: string };
}

interface Branch {
  id: string;
  name: string;
}

const ROLE_INFO: Record<string, { label: string; badge: string; icon: any }> = {
  waiter: {
    label: "گارسون سالن",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: UtensilsCrossed,
  },
  kitchen: {
    label: "آشپزخانه و بار (KDS)",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: ChefHat,
  },
  cashier: {
    label: "صندوق‌دار و مالی",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: Receipt,
  },
  manager: {
    label: "مدیر شیفت",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    icon: UserCheck,
  },
  owner: {
    label: "مالک مجموعه",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    icon: ShieldCheck,
  },
};

export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHireModal, setShowHireModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "waiter" as "waiter" | "kitchen" | "cashier" | "manager",
    branchId: "",
  });
  const [hiring, setHiring] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchStaffData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const role = user?.app_metadata?.role || "waiter";
    setCurrentUserRole(role);

    // Fetch staff of current restaurant
    const { data: staffData } = await supabase
      .from("staff_profiles")
      .select("*, branches (name)")
      .order("created_at", { ascending: false });

    // Fetch branches of current restaurant
    const { data: branchData } = await supabase
      .from("branches")
      .select("id, name")
      .order("name");

    if (staffData) setStaffList(staffData as StaffProfile[]);
    if (branchData) {
      setBranches(branchData);
      if (branchData.length > 0 && !formData.branchId) {
        setFormData((prev) => ({ ...prev, branchId: branchData[0].id }));
      }
    }
    setLoading(false);
  }, [formData.branchId]);

  useEffect(() => {
    fetchStaffData();
  }, [fetchStaffData]);

  const handleHireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setHiring(true);

    try {
      const res = await hireStaffMemberAction({
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        branchId: formData.branchId,
      });

      if (!res.success) {
        setFeedback({ type: "error", msg: res.error || "خطا در استخدام پرسنل" });
      } else {
        setFeedback({
          type: "success",
          msg: `پرسنل جدید «${formData.fullName}» با موفقیت افزوده شد. اکنون می‌تواند با ایمیل و رمز تعیین‌شده وارد سامانه شود.`,
        });
        setFormData({
          fullName: "",
          email: "",
          password: "",
          role: "waiter",
          branchId: branches[0]?.id || "",
        });
        setShowHireModal(false);
        await fetchStaffData();
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت پرسنل",
      });
    } finally {
      setHiring(false);
    }
  };

  const isManagerOrOwner = currentUserRole === "manager" || currentUserRole === "owner";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
          <span>در حال دریافت اطلاعات پرسنل و دسترسی‌ها...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-brand-400" />
              <span>مدیریت پرسنل و استخدام همکاران مجموعه</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">
              ایزولاسیون کامل شعبه
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            تعریف و استخدام همکاران سالن، آشپزخانه، صندوق و مدیریت با تفکیک نقش و دسترسی
          </p>
        </div>

        {isManagerOrOwner ? (
          <button
            type="button"
            onClick={() => setShowHireModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs shadow-lg shadow-brand-500/25 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>استخدام پرسنل جدید</span>
          </button>
        ) : (
          <div className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
            فقط مدیر یا مالک مجاز به افزودن همکاران جدید هستند.
          </div>
        )}
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between ${
            feedback.type === "error"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            بستن
          </button>
        </div>
      )}

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staffList.map((member) => {
          const roleConfig = ROLE_INFO[member.role] || {
            label: member.role,
            badge: "bg-slate-800 text-slate-400",
            icon: Users,
          };
          const RoleIcon = roleConfig.icon;

          return (
            <div
              key={member.id}
              className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-brand-400">
                    <RoleIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">{member.full_name}</h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3 h-3" />
                      <span>{member.branches?.name || "شعبه مرکزی"}</span>
                    </div>
                  </div>
                </div>

                <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${roleConfig.badge}`}>
                  {roleConfig.label}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>عضویت در مجموعه:</span>
                <span>{formatPersianTime(member.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hire Staff Modal */}
      {showHireModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-brand-400" />
                <span>استخدام پرسنل جدید برای این رستوران</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowHireModal(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                بستن
              </button>
            </div>

            <form onSubmit={handleHireSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  نام و نام‌خانوادگی پرسنل
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="مثال: پویا رضوانی"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Role Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  سمت و نقش سازمانی
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as "waiter" | "kitchen" | "cashier" | "manager",
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="waiter">گارسون سالن (سفارش‌گیری و تحویل غذا)</option>
                  <option value="kitchen">آشپزخانه و بار (نمایشگر KDS و پخت)</option>
                  <option value="cashier">صندوق‌دار (اعمال تخفیف و تسویه حساب)</option>
                  <option value="manager">مدیر شیفت (دسترسی کامل و لغو غذاهای در حال پخت)</option>
                </select>
              </div>

              {/* Branch Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  شعبه فعالیت
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  ایمیل پرسنلی جهت ورود
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="pouya@roohi.ir"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  رمز عبور اولیه
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="حداقل ۶ کاراکتر"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHireModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={hiring}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {hiring ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال ثبت...</span>
                    </>
                  ) : (
                    <span>تایید و استخدام</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
