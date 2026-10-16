"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  BookOpen, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Tag, 
  DollarSign, 
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Info
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { 
  createMenuItemAction, 
  updateMenuItemAction, 
  toggleMenuItemAvailabilityAction, 
  deleteMenuItemAction 
} from "@/actions/menu-actions";
import { formatToman, toPersianDigits, cn } from "@/lib/utils";

interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  category: string;
  price_toman: number;
  is_available: boolean;
  created_at: string;
}

export default function MenuManagementPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("همه");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "unavailable">("all");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("غذاهای اصلی");
  const [formPrice, setFormPrice] = useState<number>(0);
  const [formPriceInput, setFormPriceInput] = useState("");
  const [formAvailable, setFormAvailable] = useState(true);

  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchMenuData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const role = user?.app_metadata?.role || "waiter";
    setCurrentUserRole(role);

    // Fetch menu items of current restaurant (protected by RLS)
    const { data: items, error } = await supabase
      .from("menu_items")
      .select("*")
      .order("category")
      .order("name");

    if (!error && items) {
      setMenuItems(items as MenuItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMenuData();
  }, [fetchMenuData]);

  const isManagerOrOwner = currentUserRole === "manager" || currentUserRole === "owner";

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((i) => set.add(i.category));
    return ["همه", ...Array.from(set)];
  }, [menuItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "همه" || item.category === selectedCategory;
      const matchesAvail =
        availabilityFilter === "all"
          ? true
          : availabilityFilter === "available"
          ? item.is_available
          : !item.is_available;

      return matchesSearch && matchesCategory && matchesAvail;
    });
  }, [menuItems, searchQuery, selectedCategory, availabilityFilter]);

  // Open Add Modal
  const openAddModal = () => {
    setFormName("");
    setFormCategory("غذاهای اصلی");
    setFormPrice(0);
    setFormPriceInput("");
    setFormAvailable(true);
    setShowAddModal(true);
  };

  // Open Edit Modal
  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormPrice(item.price_toman);
    setFormPriceInput(item.price_toman.toString());
    setFormAvailable(item.is_available);
  };

  // Handle Add Item Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setActionLoading(true);

    const price = parseInt(formPriceInput.replace(/[^0-9]/g, ""), 10) || 0;

    const res = await createMenuItemAction({
      name: formName.trim(),
      category: formCategory.trim(),
      priceToman: price,
      isAvailable: formAvailable,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در افزودن آیتم به منو" });
    } else {
      setFeedback({
        type: "success",
        msg: `غذای «${formName}» با قیمت ${formatToman(price)} با موفقیت به منو اضافه شد.`,
      });
      setShowAddModal(false);
      await fetchMenuData();
    }
  };

  // Handle Edit Item Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setFeedback(null);
    setActionLoading(true);

    const price = parseInt(formPriceInput.replace(/[^0-9]/g, ""), 10) || 0;

    const res = await updateMenuItemAction({
      id: editingItem.id,
      name: formName.trim(),
      category: formCategory.trim(),
      priceToman: price,
      isAvailable: formAvailable,
    });

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در ویرایش منو" });
    } else {
      setFeedback({
        type: "success",
        msg: `اطلاعات «${formName}» با موفقیت بروزرسانی شد.`,
      });
      setEditingItem(null);
      await fetchMenuData();
    }
  };

  // Handle Quick Toggle Availability
  const handleToggleAvailability = async (item: MenuItem) => {
    const newStatus = !item.is_available;
    // Optimistic update
    setMenuItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: newStatus } : i))
    );

    const res = await toggleMenuItemAvailabilityAction({
      id: item.id,
      isAvailable: newStatus,
    });

    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در بروزرسانی وضعیت موجودی" });
      await fetchMenuData();
    } else {
      showToast(
        newStatus ? "success" : "info",
        `وضعیت «${item.name}» به ${newStatus ? "موجود" : "تمام شد"} تغییر یافت.`
      );
    }
  };

  // Handle Delete
  const handleDeleteSubmit = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setFeedback(null);

    const res = await deleteMenuItemAction(deleteTarget.id);

    setActionLoading(false);
    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در حذف آیتم منو" });
    } else {
      setFeedback({
        type: "success",
        msg: `آیتم «${deleteTarget.name}» از منوی رستوران حذف شد.`,
      });
      setDeleteTarget(null);
      await fetchMenuData();
    }
  };

  const showToast = (type: string, msg: string) => {
    setFeedback({ type: type === "error" ? "error" : "success", msg });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-950">
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
          <span>در حال دریافت فهرست منوی رستوران...</span>
        </div>
      </div>
    );
  }

  const availableCount = menuItems.filter((i) => i.is_available).length;
  const unavailableCount = menuItems.filter((i) => !i.is_available).length;

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6 bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                <span>مدیریت منوی رستوران و قیمت‌گذاری</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  منوی اختصاصی رستوران
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                تعریف غذای جدید، اصلاح دقیق نام و قیمت‌ها به تومان، دسته‌بندی و کنترل موجودی لحظه‌ای
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {isManagerOrOwner ? (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن غذای جدید به منو</span>
            </button>
          ) : (
            <div className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>فقط مدیر یا مالک مجاز به تغییر منو و قیمت‌ها هستند.</span>
            </div>
          )}

          <button
            type="button"
            onClick={fetchMenuData}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>بروزرسانی</span>
          </button>
        </div>
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
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            بستن
          </button>
        </div>
      )}

      {/* KPI Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/70 text-right">
          <div className="text-[11px] text-slate-400">کل اقلام منو</div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(menuItems.length)} غذا و نوشیدنی</div>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-right">
          <div className="text-[11px] text-emerald-400">اقلام موجود برای سفارش</div>
          <div className="text-xl font-black text-emerald-300 mt-1">{toPersianDigits(availableCount)} قلم</div>
        </div>

        <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5 text-right">
          <div className="text-[11px] text-rose-400">ناموجود / تمام شده</div>
          <div className="text-xl font-black text-rose-300 mt-1">{toPersianDigits(unavailableCount)} قلم</div>
        </div>

        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-right">
          <div className="text-[11px] text-amber-400">دسته‌بندی‌های منو</div>
          <div className="text-xl font-black text-amber-300 mt-1">{toPersianDigits(categories.length - 1)} دسته</div>
        </div>
      </div>

      {/* Search and Category Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی غذا بر اساس نام یا دسته‌بندی..."
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

          {/* Availability Filter Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setAvailabilityFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial",
                availabilityFilter === "all" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              )}
            >
              همه ({toPersianDigits(menuItems.length)})
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter("available")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial",
                availabilityFilter === "available" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              موجود ({toPersianDigits(availableCount)})
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter("unavailable")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial",
                availabilityFilter === "unavailable" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              تمام شد ({toPersianDigits(unavailableCount)})
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all",
                selectedCategory === cat
                  ? "bg-amber-500/15 border-amber-500 text-amber-300"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Grid */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">هیچ غذایی با فیلترهای انتخابی یافت نشد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "p-4 rounded-2xl border flex flex-col justify-between space-y-3.5 transition-all shadow-sm",
                item.is_available
                  ? "bg-slate-900/85 border-slate-800 hover:border-slate-700"
                  : "bg-slate-950/80 border-slate-850 opacity-75"
              )}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-750">
                    {item.category}
                  </span>

                  {/* Availability Badge */}
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border font-bold",
                      item.is_available
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    )}
                  >
                    {item.is_available ? "موجود" : "تمام شد"}
                  </span>
                </div>

                <h3 className="font-extrabold text-base text-slate-100">{item.name}</h3>

                <div className="text-lg font-black text-amber-400">
                  {formatToman(item.price_toman)}
                </div>
              </div>

              {/* Management Actions */}
              {isManagerOrOwner && (
                <div className="pt-2 border-t border-slate-850 flex items-center gap-2">
                  {/* Availability toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleAvailability(item)}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1",
                      item.is_available
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                    )}
                  >
                    {item.is_available ? (
                      <>
                        <ToggleRight className="w-3.5 h-3.5" />
                        <span>اعلام ناموجودی</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-3.5 h-3.5" />
                        <span>موجود شد</span>
                      </>
                    )}
                  </button>

                  {/* Edit button */}
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    title="ویرایش نام، قیمت و دسته‌بندی"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    title="حذف از منو"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700/80 hover:border-rose-900/80 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Add Menu Item */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <span>افزودن آیتم جدید به منوی رستوران</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  نام غذا یا نوشیدنی
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: شیشلیک شاندیز"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  دسته‌بندی منو
                </label>
                <input
                  type="text"
                  required
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="مثال: غذاهای اصلی، نوشیدنی، سالاد و پیش‌غذا، دسر"
                  list="category-suggestions"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <datalist id="category-suggestions">
                  <option value="غذاهای اصلی" />
                  <option value="پیش‌غذا و سالاد" />
                  <option value="نوشیدنی" />
                  <option value="دسر و چای" />
                  <option value="بار گرم و قهوه" />
                  <option value="بار سرد و ماکتل" />
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  قیمت به تومان
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={formPriceInput}
                  onChange={(e) => setFormPriceInput(e.target.value)}
                  placeholder="مثال: 450000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 text-left focus:outline-none focus:border-amber-500"
                />
                {formPriceInput && (
                  <div className="text-[11px] text-amber-400 mt-1">
                    نمایش قیمت: {formatToman(parseInt(formPriceInput.replace(/[^0-9]/g, ""), 10) || 0)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="addAvailable"
                  checked={formAvailable}
                  onChange={(e) => setFormAvailable(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="addAvailable" className="text-xs text-slate-300">
                  این آیتم هم‌اکنون در آشپزخانه موجود و قابل سفارش است
                </label>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>ثبت در منوی رستوران</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Menu Item */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <span>ویرایش آیتم منو و قیمت</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  نام غذا یا نوشیدنی
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  دسته‌بندی منو
                </label>
                <input
                  type="text"
                  required
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  قیمت جدید به تومان
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={formPriceInput}
                  onChange={(e) => setFormPriceInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 text-left focus:outline-none focus:border-amber-500"
                />
                {formPriceInput && (
                  <div className="text-[11px] text-amber-400 mt-1">
                    نمایش قیمت: {formatToman(parseInt(formPriceInput.replace(/[^0-9]/g, ""), 10) || 0)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editAvailable"
                  checked={formAvailable}
                  onChange={(e) => setFormAvailable(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="editAvailable" className="text-xs text-slate-300">
                  آیتم موجود و قابل سفارش است
                </label>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>ذخیره تغییرات منو</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Menu Item */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="font-extrabold text-base text-slate-100">حذف غذا از منو</h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              آیا از حذف آیتم <strong className="text-rose-400">«{deleteTarget.name}»</strong> از منوی رستوران اطمینان دارید؟ اگر این غذا در فاکتورهای گذشته وجود داشته باشد، سیستم به جای حذف آن را ناموجود می‌کند.
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
                onClick={handleDeleteSubmit}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حذف شود</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

