"use client";

import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, UtensilsCrossed } from "lucide-react";
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
  onAdded: () => void;
}

export function MenuBrowser({ menuItems, orderId, onAdded }: MenuBrowserProps) {
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("همه");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const categories = useMemo(
    () => ["همه", ...Array.from(new Set(menuItems.map((item) => item.category)))],
    [menuItems]
  );

  const visibleItems = useMemo(
    () =>
      menuItems.filter(
        (item) => selectedCategory === "همه" || item.category === selectedCategory
      ),
    [menuItems, selectedCategory]
  );

  const disabled = !orderId;

  const handleSelect = (item: MenuItem) => {
    if (disabled) {
      showToast("warning", "برای افزودن آیتم، ابتدا یک میز را از فهرست بالا انتخاب کنید.");
      return;
    }
    setSelectedItem(item);
    setQuantity(1);
    setNotes("");
  };

  const handleAdd = async () => {
    if (!orderId || !selectedItem) return;
    setIsAdding(true);

    const res = await addItemToOrder({
      orderId,
      menuItemId: selectedItem.id,
      quantity,
      notes: notes.trim() || null,
    });

    setIsAdding(false);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      return;
    }

    showToast("success", `«${selectedItem.name}» به سفارش افزوده شد.`);
    setSelectedItem(null);
    setQuantity(1);
    setNotes("");
    onAdded();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-slate-800">
          <UtensilsCrossed className="h-5 w-5 text-emerald-600" />
          <span>منوی رستوران</span>
        </h2>
        {disabled && (
          <span className="text-[11px] text-slate-400">
            برای افزودن آیتم، ابتدا یک میز را از فهرست بالا انتخاب کنید.
          </span>
        )}
      </div>

      {/* فیلتر دسته‌بندی */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={cn(
              "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
              selectedCategory === category
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {/* فرم افزودن آیتم انتخاب‌شده */}
      {selectedItem && (
        <div className="space-y-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-bold text-slate-800">
              افزودن «{selectedItem.name}» به سفارش
            </div>
            <div className="text-sm font-extrabold text-emerald-700">
              {formatToman(selectedItem.price_toman)}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="کاهش تعداد"
                className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-8 text-center text-base font-black text-slate-800">
                {toPersianDigits(quantity)}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="افزایش تعداد"
                className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <span className="text-sm font-bold text-slate-500">
              مبلغ ردیف: {formatToman(quantity * selectedItem.price_toman)}
            </span>
          </div>

          <input
            type="text"
            value={notes}
            maxLength={250}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="یادداشت آشپزخانه (اختیاری: بدون پیاز، کره اضافه...)"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
          />

          <div className="flex items-stretch gap-2.5">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>{isAdding ? "در حال ثبت..." : "افزودن به سفارش"}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              disabled={isAdding}
              className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      {/* شبکهٔ کارت‌های منو */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex min-h-[110px] flex-col justify-between gap-3 rounded-2xl border p-3.5 transition-all",
              selectedItem?.id === item.id
                ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/30"
                : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md"
            )}
          >
            <div>
              <div className="font-bold leading-6 text-slate-800">{item.name}</div>
              <div className="mt-1 text-[11px] text-slate-400">{item.category}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-emerald-700">
                {formatToman(item.price_toman)}
              </span>
              <button
                type="button"
                onClick={() => handleSelect(item)}
                className="flex h-11 items-center gap-1 rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white transition-colors hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                <span>افزودن</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
