"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { cancelOrderItem, updateItemStatus } from "@/actions/order-actions";
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

const KITCHEN_LOCK_MESSAGE =
  "امکان حذف وجود ندارد؛ آشپزخانه پخت این آیتم را شروع کرده است.";

export function OrderTicket({
  table,
  order,
  items,
  menuItemMap,
  onChanged,
}: OrderTicketProps) {
  const { showToast } = useToast();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const subtotal = items
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + item.quantity * item.unit_price_toman, 0);

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
      showToast("success", "آیتم از فاکتور حذف شد.");
      onChanged();
    }
  };

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

  const orderStatus = order ? ORDER_STATUS_MAP[order.status] || ORDER_STATUS_MAP.open : null;

  return (
    <aside className="min-w-0 lg:sticky lg:top-20">
      <div className="flex h-[calc(100vh-5rem)] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* سربرگ فاکتور */}
        <div className="rounded-t-2xl border-b border-slate-200 p-4">
          {table ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-black text-slate-800">
                  سفارش {table.table_number}
                </h2>
                {order && (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                    نسخه {toPersianDigits(order.version)}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>ظرفیت: {toPersianDigits(table.capacity)} نفر</span>
                {orderStatus && (
                  <span className={cn("rounded-full border px-2.5 py-0.5 font-bold", orderStatus.badge)}>
                    {orderStatus.label}
                  </span>
                )}
              </div>
            </>
          ) : (
            <h2 className="text-lg font-black text-slate-800">فاکتور جاری</h2>
          )}
        </div>

        {/* فهرست آیتم‌های سفارش */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {!table ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
                <ClipboardList className="h-7 w-7 text-slate-400" />
              </span>
              <p className="text-sm leading-6 text-slate-500">
                برای مشاهده و ثبت سفارش، یکی از میزهای سالن را انتخاب کنید.
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
                <UtensilsCrossed className="h-7 w-7 text-slate-400" />
              </span>
              <p className="text-sm leading-6 text-slate-500">
                هنوز آیتمی برای این میز ثبت نشده است؛ از منوی رستوران یا دستیار
                هوشمند اضافه کنید.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const statusInfo = ITEM_STATUS_MAP[item.status] || {
                label: item.status,
                badge: "bg-slate-100 text-slate-500 border-slate-200",
              };
              const isCancelled = item.status === "cancelled";
              const canCancel = item.status === "pending";
              const isBusy = busyItemId === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border border-slate-200 p-3 transition-opacity",
                    isCancelled && "opacity-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid h-6 min-w-6 place-items-center rounded-md bg-slate-900 px-1.5 text-[11px] font-bold text-white">
                          {toPersianDigits(item.quantity)}×
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {menuItemMap[item.menu_item_id]?.name || "آیتم منو"}
                        </span>
                      </div>
                      {item.notes && (
                        <div className="inline-block rounded-md border border-amber-200 bg-amber-100/80 px-2 py-0.5 text-[11px] text-amber-700">
                          یادداشت: {item.notes}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold",
                        statusInfo.badge
                      )}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600">
                      {formatToman(item.quantity * item.unit_price_toman)}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {item.status === "ready" && (
                        <button
                          type="button"
                          onClick={() => handleServeItem(item)}
                          disabled={isBusy}
                          className="flex h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          <span>تحویل به میز شد</span>
                        </button>
                      )}

                      {!isCancelled && item.status !== "served" && (
                        <span title={canCancel ? "حذف این آیتم از فاکتور" : KITCHEN_LOCK_MESSAGE}>
                          <button
                            type="button"
                            onClick={() => handleCancelItem(item)}
                            disabled={!canCancel || isBusy}
                            className="flex h-11 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span>حذف آیتم</span>
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* جمع فاکتور */}
        {table && order && (
          <div className="space-y-2 rounded-b-2xl border-t border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">جمع کل اقلام</span>
              <span className="font-black text-slate-800">{formatToman(subtotal)}</span>
            </div>
            <p className="text-[11px] leading-5 text-slate-400">
              اعمال تخفیف، مالیات و تسویهٔ نهایی توسط صندوق‌دار انجام می‌شود.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
