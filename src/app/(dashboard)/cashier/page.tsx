"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyOrderDiscount, settleOrder } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Percent,
  Printer,
  Receipt,
  RefreshCw,
} from "lucide-react";
import {
  cn,
  formatPersianTime,
  formatToman,
  ORDER_STATUS_MAP,
  toPersianDigits,
  translateServerError,
} from "@/lib/utils";

interface Order {
  id: string;
  table_id: string;
  status: string;
  discount_toman: number;
  version: number;
  created_at: string;
  updated_at: string;
  dining_tables?: { table_number: string };
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price_toman: number;
  notes?: string | null;
  status: string;
  menu_items?: { name: string };
}

type PendingAction = "discount" | "lock" | "settle" | null;

export default function CashierPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [orderTotals, setOrderTotals] = useState<Record<string, number>>({});
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [activeRes, settledRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*, dining_tables (table_number)")
        .in("status", ["open", "settling"])
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("*, dining_tables (table_number)")
        .eq("status", "paid")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    if (activeRes.data) {
      setOrders(activeRes.data);

      const activeIds = activeRes.data.map((order: Order) => order.id);
      if (activeIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, quantity, unit_price_toman, status")
          .in("order_id", activeIds);

        const totals: Record<string, number> = {};
        (items || []).forEach(
          (item: {
            order_id: string;
            quantity: number;
            unit_price_toman: number;
            status: string;
          }) => {
            if (item.status === "cancelled") return;
            totals[item.order_id] =
              (totals[item.order_id] || 0) + item.quantity * item.unit_price_toman;
          }
        );
        setOrderTotals(totals);
      } else {
        setOrderTotals({});
      }

      setSelectedOrderId((current) => {
        if (current && activeRes.data.some((order: Order) => order.id === current)) {
          return current;
        }
        const preferred =
          activeRes.data.find((order: Order) => order.status === "settling") ||
          activeRes.data[0];
        if (preferred) {
          setDiscountInput(String(preferred.discount_toman));
          return preferred.id;
        }
        return null;
      });
    }

    if (settledRes.data) setPaidOrders(settledRes.data);
    setLoading(false);
  }, []);

  const fetchOrderItems = useCallback(async (orderId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("order_items")
      .select("*, menu_items (name)")
      .eq("order_id", orderId);

    if (data) setOrderItems(data);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderItems(selectedOrderId);
    } else {
      setOrderItems([]);
    }
  }, [selectedOrderId, fetchOrderItems]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("cashier_realtime_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          fetchData();
          setSelectedOrderId((current) => {
            if (current) fetchOrderItems(current);
            return current;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, fetchOrderItems]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const activeItems = useMemo(
    () => orderItems.filter((item) => item.status !== "cancelled"),
    [orderItems]
  );

  const subtotal = useMemo(
    () =>
      activeItems.reduce(
        (sum, item) => sum + item.quantity * item.unit_price_toman,
        0
      ),
    [activeItems]
  );

  const numericDiscount = useMemo(() => {
    const parsed = Number(discountInput);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(Math.floor(parsed), subtotal);
  }, [discountInput, subtotal]);

  const netAmount = Math.max(0, subtotal - numericDiscount);
  const vatAmount = Math.floor(netAmount * 0.1);
  const grandTotal = netAmount + vatAmount;

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    if (selectedOrderId) await fetchOrderItems(selectedOrderId);
    setRefreshing(false);
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrderId(order.id);
    setDiscountInput(String(order.discount_toman));
  };

  const handleApplyDiscount = async () => {
    if (!selectedOrder || pendingAction) return;
    setPendingAction("discount");

    const res = await applyOrderDiscount({
      orderId: selectedOrder.id,
      discountToman: numericDiscount,
      expectedVersion: selectedOrder.version,
    });

    setPendingAction(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      await fetchData();
      return;
    }

    showToast("success", "تخفیف ثبت شد و فاکتور برای تسویه قفل گردید.");
    await fetchData();
    if (selectedOrderId) await fetchOrderItems(selectedOrderId);
  };

  const handleLockForCheckout = async () => {
    if (!selectedOrder || pendingAction) return;
    setPendingAction("lock");

    const res = await applyOrderDiscount({
      orderId: selectedOrder.id,
      discountToman: selectedOrder.discount_toman,
      expectedVersion: selectedOrder.version,
    });

    setPendingAction(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      await fetchData();
      return;
    }

    showToast("success", "فاکتور به صندوق ارسال و برای تسویه قفل شد.");
    await fetchData();
    if (selectedOrderId) await fetchOrderItems(selectedOrderId);
  };

  const handleSettle = async () => {
    if (!selectedOrder || pendingAction) return;
    setPendingAction("settle");

    const res = await settleOrder({
      orderId: selectedOrder.id,
      discountToman: numericDiscount,
      expectedVersion: selectedOrder.version,
    });

    setPendingAction(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      await fetchData();
      return;
    }

    showToast(
      "success",
      `صورت‌حساب ${selectedOrder.dining_tables?.table_number || "میز"} تسویه شد؛ مبلغ نهایی: ${formatToman(grandTotal)}`
    );
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
          <span>در حال بارگذاری صندوق و فاکتورها...</span>
        </div>
      </div>
    );
  }

  const selectedStatus = selectedOrder
    ? ORDER_STATUS_MAP[selectedOrder.status] || ORDER_STATUS_MAP.open
    : null;

  return (
    <div className="flex-1 p-4 lg:p-6">
      {/* سربرگ صفحه */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 sm:text-2xl">صندوق و تسویه</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            صورت‌حساب میز را بررسی کنید، تخفیف بدهید و پرداخت نهایی را ثبت کنید.
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-emerald-600")} />
          <span>بروزرسانی داده‌ها</span>
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[35fr_65fr]">
        {/* ستون میزها (سمت راست در RTL) */}
        <div className="min-w-0 space-y-5">
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-slate-800">
                <Receipt className="h-5 w-5 text-emerald-600" />
                <span>میزهای در انتظار تسویه</span>
              </h2>
              <span className="text-[11px] font-bold text-slate-500">
                {toPersianDigits(orders.length)} میز
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                در این لحظه میزی در انتظار تسویه نیست.
              </p>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => {
                  const statusInfo =
                    ORDER_STATUS_MAP[order.status] || ORDER_STATUS_MAP.open;
                  const isActive = order.id === selectedOrderId;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => handleSelectOrder(order)}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border-2 p-3.5 text-start transition-all",
                        isActive
                          ? "border-emerald-500 bg-emerald-50/60 ring-4 ring-emerald-500/20"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-800">
                          {order.dining_tables?.table_number || "میز نامشخص"}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          جمع جاری: {formatToman(orderTotals[order.id] || 0)} • نسخه{" "}
                          {toPersianDigits(order.version)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold",
                          statusInfo.badge
                        )}
                      >
                        {statusInfo.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-slate-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>فاکتورهای تسویه شده شیفت</span>
              </h2>
              <span className="text-[11px] font-bold text-slate-500">
                {toPersianDigits(paidOrders.length)} فاکتور
              </span>
            </div>

            {paidOrders.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                در این شیفت هنوز فاکتوری تسویه نشده است.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {paidOrders.map((paidOrder) => (
                  <div
                    key={paidOrder.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700">
                        {paidOrder.dining_tables?.table_number || "میز نامشخص"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        بسته شده در {formatPersianTime(paidOrder.updated_at)}
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-[11px] font-bold text-emerald-600">
                      تسویه شد ✓
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ستون صورت‌حساب (سمت چپ در RTL) */}
        <div className="min-w-0">
          {!selectedOrder ? (
            <div className="grid place-items-center rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
              <div className="space-y-3">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
                  <Receipt className="h-7 w-7 text-slate-400" />
                </span>
                <p className="text-sm text-slate-500">
                  برای مشاهدهٔ صورت‌حساب، یکی از میزها را از فهرست کنار انتخاب کنید.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* سربرگ صورت‌حساب */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <div className="text-[11px] text-slate-400">پیش‌نمایش صورت‌حساب</div>
                  <h2 className="mt-1 text-lg font-black text-slate-800">
                    صورت‌حساب {selectedOrder.dining_tables?.table_number || "میز"}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      شناسهٔ فاکتور:{" "}
                      <span dir="ltr" className="inline-block font-mono">
                        {selectedOrder.id.slice(0, 8)}
                      </span>
                    </span>
                    <span>•</span>
                    <span>شروع سفارش: {formatPersianTime(selectedOrder.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedStatus && (
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-bold",
                        selectedStatus.badge
                      )}
                    >
                      {selectedStatus.label}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="چاپ پیش‌فاکتور"
                    className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ردیف‌های اقلام */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] text-slate-500">
                      <th className="px-3 py-3 text-center font-bold">ردیف</th>
                      <th className="px-3 py-3 text-start font-bold">شرح اقلام</th>
                      <th className="px-3 py-3 text-center font-bold">تعداد</th>
                      <th className="px-3 py-3 text-end font-bold">قیمت واحد</th>
                      <th className="px-3 py-3 text-end font-bold">مجموع ردیف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-8 text-center text-slate-400"
                        >
                          هنوز آیتمی برای این سفارش ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      activeItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          <td className="px-3 py-3 text-center text-slate-400">
                            {toPersianDigits(index + 1)}
                          </td>
                          <td className="px-3 py-3 text-start">
                            <span className="font-bold text-slate-800">
                              {item.menu_items?.name || "آیتم منو"}
                            </span>
                            {item.notes && (
                              <span className="mt-1 block text-[11px] text-amber-700">
                                یادداشت: {item.notes}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-slate-600">
                            {toPersianDigits(item.quantity)}
                          </td>
                          <td className="px-3 py-3 text-end text-slate-600">
                            {formatToman(item.unit_price_toman)}
                          </td>
                          <td className="px-3 py-3 text-end font-extrabold text-slate-800">
                            {formatToman(item.quantity * item.unit_price_toman)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* تخفیف و مالیات */}
              <div className="space-y-4 border-t border-slate-200 p-5">
                <div className="flex flex-wrap items-end gap-2.5">
                  <div className="min-w-48 flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-slate-500">
                      تخفیف به تومان
                    </label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      dir="ltr"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setDiscountInput(String(Math.floor(subtotal * 0.05)))}
                    className="h-11 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    ۵٪
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountInput(String(Math.floor(subtotal * 0.1)))}
                    className="h-11 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    ۱۰٪
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyDiscount}
                    disabled={pendingAction !== null}
                    className="flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {pendingAction === "discount" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Percent className="h-4 w-4" />
                    )}
                    <span>
                      {pendingAction === "discount" ? "در حال ثبت..." : "اعمال تخفیف"}
                    </span>
                  </button>
                </div>

                {/* جمع‌بندی مالی */}
                <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">جمع کل اقلام</span>
                    <span className="font-extrabold text-slate-800">
                      {formatToman(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">تخفیف</span>
                    <span
                      className={cn(
                        "font-extrabold",
                        numericDiscount > 0 ? "text-rose-600" : "text-slate-400"
                      )}
                    >
                      {numericDiscount > 0
                        ? `− ${formatToman(numericDiscount)}`
                        : formatToman(0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">مالیات بر ارزش افزوده (۱۰٪)</span>
                    <span className="font-extrabold text-slate-800">
                      {formatToman(vatAmount)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-white shadow-lg shadow-emerald-600/20">
                    <span className="font-bold">مبلغ قابل پرداخت</span>
                    <span className="text-2xl font-black">{formatToman(grandTotal)}</span>
                  </div>
                </div>

                {/* اقدام‌های اصلی صندوق */}
                <div className="space-y-2.5">
                  <div className="flex flex-col items-stretch gap-2.5 sm:flex-row">
                    {selectedOrder.status !== "settling" ? (
                      <button
                        type="button"
                        onClick={handleLockForCheckout}
                        disabled={pendingAction !== null || activeItems.length === 0}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                      >
                        {pendingAction === "lock" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        <span>
                          {pendingAction === "lock"
                            ? "در حال ثبت..."
                            : "ارسال به صندوق جهت تسویه"}
                        </span>
                      </button>
                    ) : (
                      <div className="grid min-h-11 flex-1 place-items-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700">
                        فاکتور برای تسویه قفل شده است
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSettle}
                      disabled={pendingAction !== null || activeItems.length === 0}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {pendingAction === "settle" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      <span>
                        {pendingAction === "settle"
                          ? "در حال ثبت..."
                          : "تأیید پرداخت و بستن میز"}
                      </span>
                    </button>
                  </div>

                  <p className="text-[11px] leading-5 text-slate-400">
                    قفل سفارش برای تسویه، مبلغ صورت‌حساب را برای پرداخت نهایی آماده می‌کند.
                    با ثبت پرداخت نهایی و آزادسازی میز، فاکتور در آرشیو شیفت بسته می‌شود.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
