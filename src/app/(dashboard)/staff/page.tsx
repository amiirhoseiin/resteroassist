"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  RefreshCw,
  Key,
  Trash2,
  Edit3,
  Shield,
  Info,
  Sparkles,
  Search
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { 
  hireStaffMemberAction, 
  updateStaffRoleAction, 
  deleteStaffMemberAction, 
  resetStaffPasswordAction 
} from "@/actions/staff-actions";
import { formatPersianTime, toPersianDigits, cn } from "@/lib/utils";

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

const ROLE_INFO: Record<string, { label: string; badge: string; icon: any; desc: string }> = {
  waiter: {
    label: "گارسون و سالن‌دار",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: UtensilsCrossed,
    desc: "ثبت سفارشات میزها، دستیار صوتی/متنی هوش مصنوعی، لغو اقلام پیش از پخت",
  },
  kitchen: {
    label: "آشپزخانه و بار (KDS)",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: ChefHat,
    desc: "مشاهده سفارش‌های زنده، اعلام شروع پخت اقلام، آماده‌سازی و تسریع پخت",
  },
  cashier: {
    label: "صندوق‌دار و مالی",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: Receipt,
    desc: "بستن فاکتور، اعمال تخفیف ریالی، محاسبه مالیات ارزش افزوده ۱۰٪ و تسویه نهایی",
  },
  manager: {
    label: "مدیر شیفت رستوران",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    icon: UserCheck,
    desc: "دسترسی جامع، لغو اقلام در حال پخت، تعریف همکار جدید و مدیریت دسترسی‌ها",
  },
  owner: {
    label: "مالک مجموعه",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    icon: ShieldCheck,
    desc: "دسترسی نامحدود و مالکیت حقوقی کل اطلاعات و شعب رستوران",
  },
};

const PERMISSIONS_MATRIX = [
  {
    feature: "ثبت سفارش سالن و اسکرچ‌پد صوتی هوش مصنوعی",
    waiter: true,
    kitchen: false,
    cashier: true,
    manager: true,
    owner: true,
  },
  {
    feature: "حذف آیتم تاییدنشده (Pending) پیش از شروع پخت",
    waiter: true,
    kitchen: false,
    cashier: true,
    manager: true,
    owner: true,
  },
  {
    feature: "مانیتور KDS، ثبت شروع پخت و اعلام آماده تحویل",
    waiter: false,
    kitchen: true,
    cashier: false,
    manager: true,
    owner: true,
  },
  {
    feature: "لغو اقلام در حال پخت یا آماده (مدیریت ضایعات)",
    waiter: false,
    kitchen: false,
    cashier: false,
    manager: true,
    owner: true,
  },
  {
    feature: "صندوق، قفل فاکتور، تخفیف و محاسبه مالیات ۱۰٪",
    waiter: false,
    kitchen: false,
    cashier: true,
    manager: true,
    owner: true,
  },
  {
    feature: "افزودن همکار جدید و تنظیم سطوح دسترسی",
    waiter: false,
    kitchen: false,
    cashier: false,
    manager: true,
    owner: true,
  },
];

export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [showMatrix, setShowMatrix] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<StaffProfile | null>(null);
  const [newSelectedRole, setNewSelectedRole] = useState<"waiter" | "kitchen" | "cashier" | "manager">("waiter");
  const [resetPasswordTarget, setResetPasswordTarget] = useState<StaffProfile | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StaffProfile | null>(null);

  // Form State for Add Staff
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "waiter" as "waiter" | "kitchen" | "cashier" | "manager",
    branchId: "",
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchStaffData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const role = user?.app_metadata?.role || "waiter";
    setCurrentUserRole(role);
    setCurrentUserId(user?.id || null);

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

  // Handle Add Staff
  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setActionLoading(true);

    try {
      const res = await hireStaffMemberAction({
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        branchId: formData.branchId,
      });

      if (!res.success) {
        setFeedback({ type: "error", msg: res.error || "خطا در افزودن همکار جدید" });
      } else {
        setFeedback({
          type: "success",
          msg: `همکار جدید «${formData.fullName}» با موفقیت افزوده شد. اکنون می‌تواند با ایمیل و رمز تعیین‌شده وارد سامانه شود.`,
        });
        setFormData({
          fullName: "",
          email: "",
          password: "",
          role: "waiter",
          branchId: branches[0]?.id || "",
        });
        setShowAddModal(false);
        await fetchStaffData();
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت اطلاعات همکار",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Update Role
  const handleUpdateRole = async () => {
    if (!editRoleTarget) return;
    setActionLoading(true);
    setFeedback(null);

    const res = await updateStaffRoleAction({
      staffId: editRoleTarget.id,
      newRole: newSelectedRole,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در بروزرسانی نقش همکار" });
    } else {
      setFeedback({
        type: "success",
        msg: `سطح دسترسی همکار «${editRoleTarget.full_name}» به «${ROLE_INFO[newSelectedRole]?.label || newSelectedRole}» تغییر یافت.`,
      });
      setEditRoleTarget(null);
      await fetchStaffData();
    }
  };

  // Handle Reset Password
  const handleResetPassword = async () => {
    if (!resetPasswordTarget) return;
    if (newPasswordValue.length < 6) {
      setFeedback({ type: "error", msg: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد." });
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    const res = await resetStaffPasswordAction({
      staffId: resetPasswordTarget.id,
      newPassword: newPasswordValue,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در تنظیم مجدد رمز عبور" });
    } else {
      setFeedback({
        type: "success",
        msg: `رمز عبور جدید همکار «${resetPasswordTarget.full_name}» با موفقیت ثبت شد.`,
      });
      setResetPasswordTarget(null);
      setNewPasswordValue("");
    }
  };

  // Handle Delete Staff
  const handleDeleteStaff = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setFeedback(null);

    const res = await deleteStaffMemberAction(deleteTarget.id);

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در حذف همکار" });
    } else {
      setFeedback({
        type: "success",
        msg: `حساب همکار «${deleteTarget.full_name}» با موفقیت حذف و دسترسی وی غیرفعال گردید.`,
      });
      setDeleteTarget(null);
      await fetchStaffData();
    }
  };

  const isManagerOrOwner = currentUserRole === "manager" || currentUserRole === "owner";

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((m) => {
      const matchesSearch =
        m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.branches?.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole =
        selectedRoleFilter === "all" || m.role === selectedRoleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staffList, searchQuery, selectedRoleFilter]);

  // Statistics
  const counts = useMemo(() => {
    return {
      total: staffList.length,
      waiter: staffList.filter((s) => s.role === "waiter").length,
      kitchen: staffList.filter((s) => s.role === "kitchen").length,
      cashier: staffList.filter((s) => s.role === "cashier").length,
      manager: staffList.filter((s) => s.role === "manager" || s.role === "owner").length,
    };
  }, [staffList]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-950">
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
          <span>در حال دریافت اطلاعات پرسنل و دسترسی‌ها...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6 bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                <span>مدیریت پرسنل و سطوح دسترسی</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  چند مستأجری امن
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                تعریف اعضای جدید، مدیریت دسترسی نقش‌ها، تغییر سمت و کنترل امنیت حساب‌های شعبه
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowMatrix(!showMatrix)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-semibold transition-all"
          >
            <Shield className="w-4 h-4 text-brand-400" />
            <span>{showMatrix ? "بستن ماتریس دسترسی" : "ماتریس دسترسی نقش‌ها"}</span>
          </button>

          {isManagerOrOwner ? (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>افزودن همکار جدید</span>
            </button>
          ) : (
            <div className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>فقط مدیر یا مالک مجاز به افزودن همکاران هستند.</span>
            </div>
          )}
        </div>
      </div>

      {/* Permissions Matrix Drawer/Card */}
      {showMatrix && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-extrabold text-slate-100">
                ماتریس تفکیک اختیارات و دسترسی‌های سامانه رستوران
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">
              کنترل دسترسی مبتنی بر نقش (RBAC) در سطح توکن JWT و توابع Postgres
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-850 text-slate-400 font-bold">
                  <th className="py-2.5 px-3">قابلیت / دسترسی</th>
                  <th className="py-2.5 px-3 text-center">گارسون (سالن)</th>
                  <th className="py-2.5 px-3 text-center">آشپزخانه (KDS)</th>
                  <th className="py-2.5 px-3 text-center">صندوق‌دار</th>
                  <th className="py-2.5 px-3 text-center">مدیر شیفت / مالک</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                {PERMISSIONS_MATRIX.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-200 font-medium">{row.feature}</td>
                    <td className="py-2.5 px-3 text-center">
                      {row.waiter ? (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold">✓ مجاز</span>
                      ) : (
                        <span className="inline-block text-slate-600 font-bold">✕</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.kitchen ? (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold">✓ مجاز</span>
                      ) : (
                        <span className="inline-block text-slate-600 font-bold">✕</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.cashier ? (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold">✓ مجاز</span>
                      ) : (
                        <span className="inline-block text-slate-600 font-bold">✕</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.manager ? (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-bold">✓ کامل</span>
                      ) : (
                        <span className="inline-block text-slate-600 font-bold">✕</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            بستن
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setSelectedRoleFilter("all")}
          className={cn(
            "p-3.5 rounded-xl border text-right transition-all",
            selectedRoleFilter === "all"
              ? "bg-amber-500/10 border-amber-500/50"
              : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
          )}
        >
          <div className="text-[11px] text-slate-400">کل همکاران</div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(counts.total)}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedRoleFilter("waiter")}
          className={cn(
            "p-3.5 rounded-xl border text-right transition-all",
            selectedRoleFilter === "waiter"
              ? "bg-amber-500/10 border-amber-500/50"
              : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
          )}
        >
          <div className="text-[11px] text-amber-400">سالن‌دار / گارسون</div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(counts.waiter)}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedRoleFilter("kitchen")}
          className={cn(
            "p-3.5 rounded-xl border text-right transition-all",
            selectedRoleFilter === "kitchen"
              ? "bg-blue-500/10 border-blue-500/50"
              : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
          )}
        >
          <div className="text-[11px] text-blue-400">آشپزخانه و بار</div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(counts.kitchen)}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedRoleFilter("cashier")}
          className={cn(
            "p-3.5 rounded-xl border text-right transition-all",
            selectedRoleFilter === "cashier"
              ? "bg-emerald-500/10 border-emerald-500/50"
              : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
          )}
        >
          <div className="text-[11px] text-emerald-400">صندوق‌داران</div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(counts.cashier)}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedRoleFilter("manager")}
          className={cn(
            "p-3.5 rounded-xl border text-right transition-all col-span-2 sm:col-span-1",
            selectedRoleFilter === "manager"
              ? "bg-purple-500/10 border-purple-500/50"
              : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
          )}
        >
          <div className="text-[11px] text-purple-400">مدیریت شیفت</div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(counts.manager)}</div>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="جستجوی همکار بر اساس نام یا شعبه فعالیت..."
          className="bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-[11px] text-slate-400 hover:text-white"
          >
            پاک کردن
          </button>
        )}
      </div>

      {/* Staff Grid */}
      {filteredStaff.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
          <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">هیچ همکاری با فیلتر انتخابی یافت نشد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((member) => {
            const roleConfig = ROLE_INFO[member.role] || {
              label: member.role,
              badge: "bg-slate-800 text-slate-400 border-slate-700",
              icon: Users,
              desc: "کاربر سامانه",
            };
            const RoleIcon = roleConfig.icon;
            const isSelf = member.id === currentUserId;
            const isOwner = member.role === "owner";

            return (
              <div
                key={member.id}
                className="p-5 rounded-2xl bg-slate-900/85 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-sm"
              >
                {/* Header info */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-750 text-amber-400">
                        <RoleIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-100">{member.full_name}</h3>
                          {isSelf && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium">
                              (حساب شما)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{member.branches?.name || "شعبه مرکزی"}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold ${roleConfig.badge}`}>
                      {roleConfig.label}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-850">
                    {roleConfig.desc}
                  </p>
                </div>

                {/* Footer and Management Actions */}
                <div className="space-y-2.5 pt-2 border-t border-slate-850">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>تاریخ عضویت:</span>
                    <span>{formatPersianTime(member.created_at)}</span>
                  </div>

                  {isManagerOrOwner && (
                    <div className="flex items-center gap-1.5 pt-1">
                      {/* Change Role Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditRoleTarget(member);
                          setNewSelectedRole(member.role === "owner" ? "manager" : member.role);
                        }}
                        disabled={isOwner}
                        title={isOwner ? "نقش مالک قابل تغییر نیست" : "تغییر نقش و دسترسی"}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-700/80 transition-all flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Edit3 className="w-3 h-3 text-amber-400" />
                        <span>تغییر دسترسی</span>
                      </button>

                      {/* Reset Password Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setResetPasswordTarget(member);
                          setNewPasswordValue("");
                        }}
                        title="تنظیم رمز عبور جدید"
                        className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-700/80 transition-all flex items-center justify-center gap-1"
                      >
                        <Key className="w-3 h-3 text-emerald-400" />
                        <span>رمز عبور</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(member)}
                        disabled={isOwner || isSelf}
                        title={isOwner ? "مالک حذف نمی‌شود" : isSelf ? "نمی‌توانید خودتان را حذف کنید" : "حذف همکار"}
                        className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-[11px] font-medium border border-slate-700/80 hover:border-rose-900/80 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <span>تعریف و افزودن همکار جدید</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  نام و نام‌خانوادگی همکار
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="مثال: پویا رضوانی"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Role Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  سمت و سطح دسترسی
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as "waiter" | "kitchen" | "cashier" | "manager",
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="waiter">گارسون سالن (سفارش‌گیری با هوش مصنوعی و تحویل غذا)</option>
                  <option value="kitchen">آشپزخانه و بار (مانیتور KDS و مدیریت پخت اقلام)</option>
                  <option value="cashier">صندوق‌دار (اعمال تخفیف ریالی و تسویه ۱۰٪ مالیات)</option>
                  <option value="manager">مدیر شیفت (دسترسی کامل، لغو اقلام پخته‌شده و مدیریت پرسنل)</option>
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
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
                  ایمیل پرسنلی جهت ورود به سامانه
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="pouya@roohi.ir"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-left"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-left"
                />
              </div>

              <div className="pt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال ثبت...</span>
                    </>
                  ) : (
                    <span>تایید و افزودن همکار</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Role Modal */}
      {editRoleTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <span>تغییر نقش و دسترسی همکار</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditRoleTarget(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              تغییر نقش سازمانی برای همکار <strong className="text-amber-400">«{editRoleTarget.full_name}»</strong>:
            </p>

            <div className="space-y-2">
              {(["waiter", "kitchen", "cashier", "manager"] as const).map((r) => {
                const info = ROLE_INFO[r];
                const Icon = info.icon;
                return (
                  <label
                    key={r}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      newSelectedRole === r
                        ? "bg-amber-500/10 border-amber-500/50"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    )}
                  >
                    <input
                      type="radio"
                      name="newRole"
                      value={r}
                      checked={newSelectedRole === r}
                      onChange={() => setNewSelectedRole(r)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-100">{info.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{info.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditRoleTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleUpdateRole}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ذخیره تغییرات نقش</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password Modal */}
      {resetPasswordTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" />
                <span>تنظیم رمز عبور جدید</span>
              </h2>
              <button
                type="button"
                onClick={() => setResetPasswordTarget(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              تنظیم رمز عبور جدید برای همکار <strong className="text-emerald-400">«{resetPasswordTarget.full_name}»</strong>:
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                رمز عبور جدید (حداقل ۶ کاراکتر)
              </label>
              <input
                type="password"
                required
                dir="ltr"
                minLength={6}
                value={newPasswordValue}
                onChange={(e) => setNewPasswordValue(e.target.value)}
                placeholder="رمز جدید را وارد کنید"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 text-left"
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResetPasswordTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={actionLoading || newPasswordValue.length < 6}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ثبت رمز جدید</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Staff Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="font-extrabold text-base text-slate-100">حذف دسترسی همکار</h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              آیا از حذف حساب کاربری و لغو دسترسی همکار <strong className="text-rose-400">«{deleteTarget.full_name}»</strong> اطمینان دارید؟ این عمل قابل بازگشت نیست.
            </p>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>بله، حذف شود</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
