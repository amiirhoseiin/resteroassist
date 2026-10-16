"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  Flame, 
  Loader2 
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addItemToOrder, cancelOrderItem } from "@/actions/order-actions";
import { AiScratchpad } from "./AiScratchpad";
import { formatToman, toPersianDigits, ITEM_STATUS_MAP } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price_toman: number;
  is_available: boolean;
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price_toman: number;
  notes?: string | null;
  status: string;
  version: number;
  created_at: string;
}

interface Order {
  id: string;
  table_id: string;
  status: string;
  version: number;
  discount_toman: number;
}

interface OrderDrawerProps {
  table: { id: string; table_number: string; capacity: number };
  initialOrder: Order | null;
  initialItems: OrderItem[];
  menuItems: MenuItem[];
  onClose: () => void;
  onRefreshNeeded: () => void;
}

export function OrderDrawer({
  table,
  initialOrder,
  initialItems,
  menuItems,
  onClose,
  onRefreshNeeded,
}: OrderDrawerProps) {
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [items, setItems] = useState<OrderItem[]>(initialItems);
  const [selectedCategory, setSelectedCategory] = useState<string>("همه");
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Group menu items into map for instant lookup
  const menuItemMap = menuItems.reduce<Record<string, { name: string; price_toman: number }>>(
    (acc, m) => {
      acc[m.id] = { name: m.name, price_toman: m.price_toman };
      return acc;
    },
    {}
  );

  const categories = ["همه", ...Array.from(new Set(menuItems.map((m) => m.category)))];

  // Subscribe to real-time changes for this order's items
  useEffect(() => {
    if (!order?.id) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`order_items_realtime_${order.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `order_id=eq.${order.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => [...prev, payload.new as OrderItem]);
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((it) => (it.id === payload.new.id ? (payload.new as OrderItem) : it))
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((it) => it.id === payload.old.id));
          }
          onRefreshNeeded();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.id, onRefreshNeeded]);

  // Handle adding a manual item
  const handleAddItem = async () => {
    if (!order || !selectedMenuItem) return;
    setIsAddingItem(true);
    setErrorMessage(null);

    const res = await addItemToOrder({
      orderId: order.id,
      menuItemId: selectedMenuItem.id,
      quantity,
      notes: notes.trim() || null,
    });

    if (!res.success) {
      setErrorMessage(res.error || "خطا در افزودن آیتم");
    } else {
      setSelectedMenuItem(null);
      setQuantity(1);
      setNotes("");
      onRefreshNeeded();
    }
    setIsAddingItem(false);
  };

  // Handle canceling an item (Cooking Lock Enforced)
  const handleCancelItem = async (item: OrderItem) => {
    setErrorMessage(null);
    const res = await cancelOrderItem({
      itemId: item.id,
      reason: "لغو توسط پرسنل سالن",
      expectedVersion: item.version,
    });

    if (!res.success) {
      setErrorMessage(res.error || "خطا در لغو آیتم");
    } else {
      onRefreshNeeded();
    }
  };

  // Calculate live subtotal
  const nonCancelledItems = items.filter((it) => it.status !== "cancelled");
  const subtotal = nonCancelledItems.reduce(
    (sum, it) => sum + it.quantity * it.unit_price_toman,
    0
  );

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-full sm:max-w-2xl bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-slate-100">
              سفارش {table.table_number}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
              ظرفیت: {toPersianDigits(table.capacity)} نفر
            </span>
            {order && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30">
                نسخه {toPersianDigits(order.version)}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {order ? `وضعیت فاکتور: ${order.status === "open" ? "جاری" : order.status}` : "میز فاقد سفارش فعال"}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Error / Invariant Warning Message */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">قفل وضعیت / خطای امنیتی:</span>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* AI Smart Waiter Scratchpad */}
        {order && (
          <AiScratchpad
            orderId={order.id}
            menuItemMap={menuItemMap}
            onItemsAdded={onRefreshNeeded}
          />
        )}

        {/* Current Order Items List */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <span className="font-bold text-sm text-slate-200">
              آیتم‌های ثبت شده میز ({toPersianDigits(nonCancelledItems.length)} ردیف فعال)
            </span>
            <span className="text-xs font-semibold text-brand-400">
              جمع کل: {formatToman(subtotal)}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              هنوز آیتمی برای این میز ثبت نشده است. از منو یا دستیار هوشمند اضافه کنید.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {items.map((item) => {
                const menuInfo = menuItemMap[item.menu_item_id];
                const statusInfo = ITEM_STATUS_MAP[item.status] || {
                  label: item.status,
                  bg: "bg-slate-800",
                  text: "text-slate-400",
                  border: "border-slate-700",
                };

                return (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">
                          {menuInfo?.name || "آیتم منو"}
                        </span>
                        <span className="text-slate-400 font-medium">
                          × {toPersianDigits(item.quantity)}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      {item.notes && (
                        <div className="text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded inline-block">
                          یادداشت آشپزخانه: {item.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-left font-medium text-slate-300">
                        {formatToman(item.quantity * item.unit_price_toman)}
                      </div>

                      {item.status !== "cancelled" && item.status !== "served" && (
                        <button
                          type="button"
                          onClick={() => handleCancelItem(item)}
                          title={
                            item.status === "preparing" || item.status === "ready"
                              ? "قفل آشپزخانه: لغو فقط توسط مدیر"
                              : "لغو آیتم"
                          }
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual Menu Selector */}
        {order && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <span className="font-bold text-sm text-slate-200 block">
              انتخاب دستی از منوی رستوران
            </span>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedCategory === cat
                      ? "bg-brand-500 text-white"
                      : "bg-slate-800 hover:bg-slate-750 text-slate-400"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {menuItems
                .filter((m) => selectedCategory === "همه" || m.category === selectedCategory)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMenuItem(m);
                      setQuantity(1);
                    }}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      selectedMenuItem?.id === m.id
                        ? "bg-brand-500/15 border-brand-500 text-white"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="font-bold text-xs">{m.name}</div>
                    <div className="text-[11px] text-brand-400 mt-1">
                      {formatToman(m.price_toman)}
                    </div>
                  </button>
                ))}
            </div>

            {/* Selected Item Addition Controls */}
            {selectedMenuItem && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200">
                    افزودن {selectedMenuItem.name}
                  </span>
                  {/* Quantity Counter */}
                  <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="p-1 rounded text-slate-400 hover:text-white"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold text-xs px-2 text-slate-100">
                      {toPersianDigits(quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="p-1 rounded text-slate-400 hover:text-white"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="یادداشت آشپزخانه (اختیاری: بدون پیاز، کره اضافه، لیوان یخ...)"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />

                <button
                  type="button"
                  disabled={isAddingItem}
                  onClick={handleAddItem}
                  className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20 disabled:opacity-50"
                >
                  {isAddingItem ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>
                    ثبت در فاکتور میز (مبلغ: {formatToman(quantity * selectedMenuItem.price_toman)})
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
