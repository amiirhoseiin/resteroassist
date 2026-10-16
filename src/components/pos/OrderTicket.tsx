"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Trash2,
  UtensilsCrossed,
  Edit2,
  Flame,
  CheckCheck,
  AlertTriangle,
  Receipt,
  Plus,
  Minus
} from "lucide-react";
import { cancelOrderItem, updateItemStatus, updateOrderItemDetails } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import {
  cn,
  formatToman,
  ITEM_STATUS_MAP,
  ORDER_STATUS_MAP,
  toPersianDigits,
  translateServerError,
} from "@/lib/utils";

interface TicketTable {
  id: string;
  table_number: string;
  capacity: number;
}

interface TicketOrder {
  id: string;
  table_id: string;
  status: string;
  version: number;
  discount_toman: number;
}

interface TicketItem {
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

interface OrderTicketProps {
  table: TicketTable | null;
  order: TicketOrder | null;
  items: TicketItem[];
  menuItemMap: Record<string, { name: string; price_toman: number }>;
  onChanged: () => void;
}

export function OrderTicket({
  table,
  order,
  items,
  menuItemMap,
  onChanged,
}: OrderTicketProps) {
  const { showToast } = useToast();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  // Edit Note Modal state
  const [editingItem, setEditingItem] = useState<TicketItem | null>(null);
  const [editNotesText, setEditNotesText] = useState("");
  const [editQuantity, setEditQuantity] = useState(1);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const activeItems = items.filter((item) => item.status !== "cancelled");
  const subtotal = activeItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_toman,
    0
  );
  const discount = order ? order.discount_toman : 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const vat10 = Math.round(taxableAmount * 0.10);
  const finalTotal = taxableAmount + vat10;

  // Cancel item
  const handleCancelItem = async (item: TicketItem) => {
    setBusyItemId(item.id);
    const res = await cancelOrderItem({
      itemId: item.id,
      reason: "لغو توسط سالن‌دار",
      expectedVersion: item.version,
    });
    setBusyItemId(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
    } else {
      showToast("success", "آیتم از سفارش حذف شد.");
      onChanged();
    }
  };

  // Serve item to table
  const handleServeItem = async (item: TicketItem) => {
    setBusyItemId(item.id);
    const res = await updateItemStatus({
      itemId: item.id,
      newStatus: "served",
      expectedVersion: item.version,
    });
    setBusyItemId(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
    } else {
      showToast("success", "تحویل آیتم به میز ثبت شد.");
      onChanged();
    }
  };

  // Quick quantity increment for pending item
  const handleAdjustQuantity = async (item: TicketItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      await handleCancelItem(item);
      return;
    }

    setBusyItemId(item.id);
    const res = await updateOrderItemDetails({
      itemId: item.id,
      quantity: newQty,
      notes: item.notes,
      expectedVersion: item.version,
    });
    setBusyItemId(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
    } else {
      showToast("success", `تعداد به ${toPersianDigits(newQty)} تغییر یافت.`);
      onChanged();
    }
  };

  // Open Edit Modal
  const openEditModal = (item: TicketItem) => {
    setEditingItem(item);
    setEditNotesText(item.notes || "");
    setEditQuantity(item.quantity);
  };

  // Save Edit Modal
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSavingEdit(true);

    const res = await updateOrderItemDetails({
      itemId: editingItem.id,
      quantity: editQuantity,
      notes: editNotesText.trim() || null,
      expectedVersion: editingItem.version,
    });

    setIsSavingEdit(false);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
    } else {
      showToast("success", "تغییرات سفارش ثبت شد و آشپزخانه مطلع گردید.");
      setEditingItem(null);
      onChanged();
    }
  };

  const orderStatus = order ? ORDER_STATUS_MAP[order.status] || ORDER_STATUS_MAP.open : null;

  return (
    <aside className="min-w-0 lg:sticky lg:top-20">
      <div className="flex h-[calc(100vh-6rem)] flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden">
        {/* Ticket Header */}
        <div className="border-b border-slate-800 p-4 bg-slate-950/70 space-y-2">
          {table ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Receipt className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-black text-slate-100">
                      سفارش {table.table_number}
                    </h2>
                    <span className="text-[11px] text-slate-400">
                      ظرفیت: {toPersianDigits(table.capacity)} نفر
                    </span>
                  </div>
                </div>

                {order && (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-300">
                    نسخه {toPersianDigits(order.version)}
                  </span>
                )}
              </div>

              {orderStatus && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-850">
                  <span className="text-[11px] text-slate-400">وضعیت میز:</span>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold", orderStatus.badge)}>
                    {orderStatus.label}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-400" />
              <h2 className="text-base font-black text-slate-100">فاکتور جاری میز</h2>
            </div>
          )}
        </div>

        {/* Order Items List */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
          {!table ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-800/80 border border-slate-750">
                <ClipboardList className="h-7 w-7 text-slate-400" />
              </span>
              <p className="text-xs leading-5">
                برای مشاهده، ثبت اقلام یا ادیت سفارش، یکی از میزهای سالن را انتخاب کنید.
              </p>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-800/60 border border-slate-750">
                <UtensilsCrossed className="h-6 w-6 text-slate-400" />
              </span>
              <p className="text-xs">
                هنوز غذایی برای این میز ثبت نشده است. از منو یا دستیار صوتی هوش مصنوعی آیتم‌ها را اضافه کنید.
              </p>
            </div>
          ) : (
            activeItems.map((item) => {
              const itemName =
                menuItemMap[item.menu_item_id]?.name || "آیتم منو";
              const isBusy = busyItemId === item.id;
              const isPending = item.status === "pending";
              const isPreparing = item.status === "preparing";
              const isReady = item.status === "ready";
              const isServed = item.status === "served";

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2 hover:border-slate-750 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">
                          {itemName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {toPersianDigits(item.quantity)} × {formatToman(item.unit_price_toman)} ={" "}
                        <strong className="text-amber-400">
                          {formatToman(item.quantity * item.unit_price_toman)}
                        </strong>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isPending && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                          در صف پخت
                        </span>
                      )}
                      {isPreparing && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-400" />
                          <span>روی اجاق</span>
                        </span>
                      )}
                      {isReady && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                          آماده سرو 🍽️
                        </span>
                      )}
                      {isServed && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                          تحویل شد ✓
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer notes */}
                  {item.notes && (
                    <div className="text-[11px] p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-400" />
                      <span>{item.notes}</span>
                    </div>
                  )}

                  {/* Waiter Actions for this item */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-850 text-xs">
                    {/* For pending items: full editing (+, -, notes, delete) */}
                    {isPending ? (
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(item, -1)}
                            disabled={isBusy}
                            title="کاهش تعداد"
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-1.5 font-bold text-slate-200 text-xs">
                            {toPersianDigits(item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(item, 1)}
                            disabled={isBusy}
                            title="افزایش تعداد"
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            disabled={isBusy}
                            title="ویرایش یادداشت و مشخصات"
                            className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCancelItem(item)}
                            disabled={isBusy}
                            title="لغو این قلم"
                            className="p-1.5 rounded-lg bg-slate-850 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* For preparing items: Cooking Lock info */}
                    {isPreparing && (
                      <div className="text-[11px] text-amber-400/90 flex items-center justify-between w-full">
                        <span>آشپزخانه در حال پخت است (قفل آشپزخانه فعال)</span>
                      </div>
                    )}

                    {/* For ready items: 1-Tap Served button */}
                    {isReady && (
                      <button
                        type="button"
                        onClick={() => handleServeItem(item)}
                        disabled={isBusy}
                        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5" />
                        )}
                        <span>تحویل غذا به میز انجام شد</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Financial Summary & VAT 10% */}
        {table && activeItems.length > 0 && (
          <div className="border-t border-slate-800 bg-slate-950/90 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>جمع اقلام منو:</span>
              <span className="font-bold text-slate-200">{formatToman(subtotal)}</span>
            </div>

            {discount > 0 && (
              <div className="flex items-center justify-between text-rose-400">
                <span>تخفیف فاکتور:</span>
                <span className="font-bold">-{formatToman(discount)}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-400">
              <span>مالیات بر ارزش افزوده (۱۰٪):</span>
              <span className="font-bold text-slate-200">{formatToman(vat10)}</span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-black">
              <span className="text-slate-100">مبلغ کل قابل پرداخت:</span>
              <span className="text-amber-400 text-base">{formatToman(finalTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <span>ویرایش آیتم در سفارش</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  تعداد سفارش
                </label>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-1.5">
                  <button
                    type="button"
                    onClick={() => setEditQuantity((q) => Math.max(1, q - 1))}
                    className="p-2 rounded-lg bg-slate-800 text-slate-300"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-lg font-black text-slate-100">
                    {toPersianDigits(editQuantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditQuantity((q) => q + 1)}
                    className="p-2 rounded-lg bg-slate-800 text-slate-300"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  یادداشت آشپزخانه
                </label>
                <textarea
                  value={editNotesText}
                  onChange={(e) => setEditNotesText(e.target.value)}
                  placeholder="مثال: بدون پیاز، سس اضافه..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
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
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>ثبت تغییرات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
