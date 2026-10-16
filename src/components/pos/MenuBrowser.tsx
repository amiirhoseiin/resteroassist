"use client";

import { useMemo, useState } from "react";
import { 
  Loader2, 
  Minus, 
  Plus, 
  UtensilsCrossed, 
  Search, 
  MessageSquare, 
  Sparkles, 
  Check, 
  AlertCircle 
} from "lucide-react";
import { addItemToOrder } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import { cn, formatToman, toPersianDigits, translateServerError } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price_toman: number;
  is_available: boolean;
}

interface MenuBrowserProps {
  menuItems: MenuItem[];
  orderId: string | null;
  tableNumber?: string | null;
  currentOrderItems?: { menu_item_id: string; quantity: number; status: string }[];
  onAdded: () => void;
}

export function MenuBrowser({ 
  menuItems, 
  orderId, 
  tableNumber,
  currentOrderItems = [],
  onAdded 
}: MenuBrowserProps) {
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("همه");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemForModal, setSelectedItemForModal] = useState<MenuItem | null>(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [modalNotes, setModalNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickAddingId, setQuickAddingId] = useState<string | null>(null);

  const categories = useMemo(
    () => ["همه", ...Array.from(new Set(menuItems.map((item) => item.category)))],
    [menuItems]
  );

  // Map of item counts in current active order
  const currentItemCounts = useMemo(() => {
    const map: Record<string, number> = {};
    currentOrderItems
      .filter((i) => i.status !== "cancelled")
      .forEach((i) => {
        map[i.menu_item_id] = (map[i.menu_item_id] || 0) + i.quantity;
      });
    return map;
  }, [currentOrderItems]);

  const visibleItems = useMemo(
    () =>
      menuItems.filter((item) => {
        const matchesCategory = selectedCategory === "همه" || item.category === selectedCategory;
        const matchesSearch =
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [menuItems, selectedCategory, searchQuery]
  );

  const disabled = !orderId;

  // 1-Tap Quick Add (adds 1 portion instantly)
  const handleQuickAdd = async (item: MenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) {
      showToast("warning", "برای افزودن آیتم، ابتدا یک میز را از فهرست بالا انتخاب کنید.");
      return;
    }
    if (!item.is_available) {
      showToast("error", "این آیتم هم‌اکنون در آشپزخانه ناموجود است.");
      return;
    }

    setQuickAddingId(item.id);
    const res = await addItemToOrder({
      orderId,
      menuItemId: item.id,
      quantity: 1,
      notes: null,
    });
    setQuickAddingId(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      return;
    }

    showToast("success", `۱× «${item.name}» به سفارش ${tableNumber || "میز"} اضافه شد.`);
    onAdded();
  };

  // Open Detailed Modal (to add with custom notes or specific quantity)
  const openDetailModal = (item: MenuItem) => {
    if (disabled) {
      showToast("warning", "برای افزودن آیتم، ابتدا یک میز را از فهرست بالا انتخاب کنید.");
      return;
    }
    if (!item.is_available) {
      showToast("error", "این آیتم هم‌اکنون در آشپزخانه ناموجود است.");
      return;
    }

    setSelectedItemForModal(item);
    setModalQuantity(1);
    setModalNotes("");
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !selectedItemForModal) return;
    setIsSubmitting(true);

    const res = await addItemToOrder({
      orderId,
      menuItemId: selectedItemForModal.id,
      quantity: modalQuantity,
      notes: modalNotes.trim() || null,
    });

    setIsSubmitting(false);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      return;
    }

    showToast(
      "success",
      `${toPersianDigits(modalQuantity)}× «${selectedItemForModal.name}» به سفارش ${tableNumber || "میز"} افزوده شد.`
    );
    setSelectedItemForModal(null);
    onAdded();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
      {/* Header and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
              <span>منوی سفارش‌گیری سالن</span>
              {tableNumber && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  سفارش برای {tableNumber}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              با علامت زدن سریع (+) آیتم‌ها را ثبت کنید یا با کلیک روی کارت یادداشت ویژه بنویسید
            </p>
          </div>
        </div>

        {/* Quick Search */}
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی غذا و نوشیدنی..."
            className="bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full"
          />
        </div>
      </div>

      {disabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>برای ثبت و ادیت سفارش، ابتدا یکی از میزهای سالن را در بالای صفحه انتخاب کنید.</span>
        </div>
      )}

      {/* Categories Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={cn(
              "px-3.5 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all",
              selectedCategory === category
                ? "bg-amber-500 text-slate-950 border-amber-500 shadow-md font-bold"
                : "bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Menu Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {visibleItems.map((item) => {
          const currentCount = currentItemCounts[item.id] || 0;
          const isQuickAdding = quickAddingId === item.id;
          const isUnavailable = !item.is_available;

          return (
            <div
              key={item.id}
              onClick={() => !isUnavailable && openDetailModal(item)}
              className={cn(
                "p-3.5 rounded-2xl border transition-all text-right flex flex-col justify-between space-y-3 cursor-pointer group select-none relative",
                isUnavailable
                  ? "bg-slate-950/60 border-slate-850 opacity-60 cursor-not-allowed"
                  : currentCount > 0
                  ? "bg-slate-900 border-amber-500/50 shadow-md ring-1 ring-amber-500/20 hover:border-amber-400"
                  : "bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                    {item.category}
                  </span>

                  {isUnavailable ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                      تمام شد
                    </span>
                  ) : currentCount > 0 ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black">
                      {toPersianDigits(currentCount)} در فاکتور
                    </span>
                  ) : null}
                </div>

                <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">
                  {item.name}
                </h3>

                <div className="text-xs font-black text-amber-400 mt-1">
                  {formatToman(item.price_toman)}
                </div>
              </div>

              {/* Fast Quick-Action Buttons */}
              <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetailModal(item);
                  }}
                  disabled={disabled || isUnavailable}
                  title="ثبت با یادداشت ویژه مشتری"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700/80 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={(e) => handleQuickAdd(item, e)}
                  disabled={disabled || isUnavailable || isQuickAdding}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm",
                    currentCount > 0
                      ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                      : "bg-slate-800 hover:bg-amber-500 text-slate-200 hover:text-slate-950 border border-slate-700 hover:border-amber-500"
                  )}
                >
                  {isQuickAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{currentCount > 0 ? "افزودن ۱ عدد دیگر" : "علامت‌زدن و ثبت"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for adding item with custom notes and specific quantity */}
      {selectedItemForModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-100">
                  ثبت «{selectedItemForModal.name}»
                </h3>
                <span className="text-[11px] text-amber-400 font-bold">
                  {formatToman(selectedItemForModal.price_toman)} هر پرس
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForModal(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {/* Quantity Counter */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  تعداد پرس / سفارش
                </label>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-1.5">
                  <button
                    type="button"
                    onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <span className="text-lg font-black text-slate-100">
                    {toPersianDigits(modalQuantity)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setModalQuantity((q) => q + 1)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 text-left">
                  مبلغ کل این ردیف: {formatToman(modalQuantity * selectedItemForModal.price_toman)}
                </div>
              </div>

              {/* Special Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>یادداشت آشپزخانه و بار (سفارشی مشتری)</span>
                  <span className="text-[10px] text-amber-400">اختیاری</span>
                </label>
                <textarea
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="مثال: کم‌روغن، بدون نمک، با کره اضافه، سس جدا، گرم سرو شود..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {["کم‌روغن", "بدون پیاز", "کره اضافه", "تند", "سس اضافه"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setModalNotes((prev) => (prev ? `${prev}، ${s}` : s))
                    }
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
                  >
                    + {s}
                  </button>
                ))}
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedItemForModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>ثبت در سفارش</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
