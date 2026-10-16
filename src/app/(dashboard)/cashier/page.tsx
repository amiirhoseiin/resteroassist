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
  Sparkles,
  Banknote,
  Smartphone,
  SplitSquareVertical,
  Clock,
  Search,
  Check,
  AlertCircle
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

type PaymentMethod = "pos" | "cash" | "card_to_card" | "split";
type PendingAction = "discount" | "lock" | "settle" | null;

export default function CashierPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [orderTotals, setOrderTotals] = useState<Record<string, number>>({});
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pos");
  const [posRefNumber, setPosRefNumber] = useState<string>("");
  const [cashGiven, setCashGiven] = useState<string>("");
  const [searchTableQuery, setSearchTableQuery] = useState<string>("");
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

  const filteredOrders = useMemo(() => {
    if (!searchTableQuery.trim()) return orders;
    return orders.filter((o) =>
      (o.dining_tables?.table_number || "").includes(searchTableQuery.trim())
    );
  }, [orders, searchTableQuery]);

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

  // Cash change due calculation
  const cashGivenNumber = Number(cashGiven) || 0;
  const cashChangeDue = Math.max(0, cashGivenNumber - grandTotal);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    if (selectedOrderId) await fetchOrderItems(selectedOrderId);
    setRefreshing(false);
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrderId(order.id);
    setDiscountInput(String(order.discount_toman));
    setPosRefNumber("");
    setCashGiven("");
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
      <div className="flex flex-1 items-center justify-center p-8 bg-slate-950">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
          <span>در حال بارگذاری صندوق و فاکتورها...</span>
        </div>
      </div>
    );
  }

  const selectedStatus = selectedOrder
    ? ORDER_STATUS_MAP[selectedOrder.status] || ORDER_STATUS_MAP.open
    : null;

  return (
    <div className="flex-1 p-4 lg:p-6 bg-slate-950 text-slate-100 min-h-screen">
      {/* سربرگ صفحه هماهنگ با تم کهربایی رستوران */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 sm:text-2xl flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Receipt className="w-5 h-5" />
            </span>
            <span>صندوق و تسویه</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            مدیریت زنده صورت‌حساب میزها، ثبت روش‌های پرداخت (پوز/نقدی/دنگی)، اعمال تخفیف و محاسبه قانونی ۱۰٪ مالیات بر ارزش افزوده
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 text-xs font-bold text-slate-300 shadow-sm transition-colors hover:bg-slate-800 hover:text-white"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-amber-400")} />
          <span>بروزرسانی داده‌ها</span>
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[34fr_66fr]">
        {/* ستون میزها و تاریخچه (سمت راست در RTL) */}
        <div className="min-w-0 space-y-5">
          {/* میزهای منتظر تسویه */}
          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <h2 className="flex items-center gap-2 font-black text-sm text-slate-100">
                <Receipt className="h-4 w-4 text-amber-400" />
                <span>میزهای در انتظار تسویه</span>
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                {toPersianDigits(orders.length)} میز
              </span>
            </div>

            {/* جستجوی سریع شماره میز */}
            <div className="relative">
              <Search className="absolute end-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchTableQuery}
                onChange={(e) => setSearchTableQuery(e.target.value)}
                placeholder="جستجوی شماره میز..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {filteredOrders.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="mx-auto w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                  <Receipt className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-400">
                  {searchTableQuery ? "میزی با این شماره یافت نشد." : "در این لحظه میزی در انتظار تسویه نیست."}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto">
                {filteredOrders.map((order) => {
                  const statusInfo =
                    ORDER_STATUS_MAP[order.status] || ORDER_STATUS_MAP.open;
                  const isActive = order.id === selectedOrderId;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => handleSelectOrder(order)}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-2 p-3 text-start transition-all",
                        isActive
                          ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                          : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950/90"
                      )}
                    >
                      <div className="min-w-0">
                        <span className="block text-sm font-black text-slate-100">
                          {order.dining_tables?.table_number || "میز نامشخص"}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          جمع جاری: <strong className="text-amber-400 font-bold">{formatToman(orderTotals[order.id] || 0)}</strong> • نسخه{" "}
                          {toPersianDigits(order.version)}
                        </span>
                      </div>
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

          {/* فاکتورهای تسویه شده شیفت */}
          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <h2 className="flex items-center gap-2 font-black text-sm text-slate-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>فاکتورهای تسویه شده شیفت</span>
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                {toPersianDigits(paidOrders.length)} فاکتور
              </span>
            </div>

            {paidOrders.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                در این شیفت هنوز فاکتوری تسویه نشده است.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {paidOrders.map((paidOrder) => (
                  <div
                    key={paidOrder.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200">
                        {paidOrder.dining_tables?.table_number || "میز نامشخص"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>بسته شده در {formatPersianTime(paidOrder.updated_at)}</span>
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      تسویه شد ✓
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ستون صورت‌حساب استاندارد حرارتی (سمت چپ در RTL) */}
        <div className="min-w-0">
          {!selectedOrder ? (
            <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900/90 p-16 text-center shadow-xl">
              <div className="space-y-3">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-800 border border-slate-700">
                  <Receipt className="h-7 w-7 text-amber-400" />
                </span>
                <p className="text-sm text-slate-400">
                  برای مشاهده و تسویهٔ صورت‌حساب، یکی از میزها را از فهرست کنار انتخاب کنید.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl">
              {/* سربرگ صورت‌حساب فیش چاپی */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 p-5 bg-slate-950/70">
                <div>
                  <div className="text-[11px] font-bold text-amber-400">پیش‌نمایش صورت‌حساب و صدور فیش</div>
                  <h2 className="mt-1 text-lg font-black text-slate-100 flex items-center gap-2">
                    <span>صورت‌حساب {selectedOrder.dining_tables?.table_number || "میز"}</span>
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      شناسهٔ فاکتور:{" "}
                      <span dir="ltr" className="inline-block font-mono text-slate-300">
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
                        "rounded-full border px-3 py-1 text-xs font-bold",
                        selectedStatus.badge
                      )}
                    >
                      {selectedStatus.label}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="چاپ پیش‌فاکتور مشتری (فیش‌پرینتر حرارتی)"
                    className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-bold transition-colors hover:bg-slate-750 hover:text-white"
                  >
                    <Printer className="h-4 w-4 text-amber-400" />
                    <span>چاپ فیش</span>
                  </button>
                </div>
              </div>

              {/* ردیف‌های اقلام فاکتور */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400">
                      <th className="px-4 py-3 text-center font-bold">ردیف</th>
                      <th className="px-4 py-3 text-start font-bold">شرح اقلام سفارش</th>
                      <th className="px-4 py-3 text-center font-bold">تعداد</th>
                      <th className="px-4 py-3 text-end font-bold">قیمت واحد</th>
                      <th className="px-4 py-3 text-end font-bold">مجموع ردیف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {activeItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          هنوز آیتمی برای این سفارش ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      activeItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-4 py-3.5 text-center text-slate-400 font-mono">
                            {toPersianDigits(index + 1)}
                          </td>
                          <td className="px-4 py-3.5 text-start">
                            <span className="font-bold text-slate-100 text-sm">
                              {item.menu_items?.name || "آیتم منو"}
                            </span>
                            {item.notes && (
                              <span className="mt-1 block text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md w-fit">
                                یادداشت: {item.notes}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center font-extrabold text-slate-200 text-sm">
                            {toPersianDigits(item.quantity)}
                          </td>
                          <td className="px-4 py-3.5 text-end text-slate-300">
                            {formatToman(item.unit_price_toman)}
                          </td>
                          <td className="px-4 py-3.5 text-end font-black text-amber-400">
                            {formatToman(item.quantity * item.unit_price_toman)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* انتخاب روش تسویه حساب حرفه‌ای */}
              <div className="border-t border-slate-800 p-5 bg-slate-950/30 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    روش پرداخت مشتری
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("pos")}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        paymentMethod === "pos"
                          ? "border-amber-500 bg-amber-500/15 text-amber-300 shadow-sm"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700"
                      )}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>کارتخوان شاپرک (POS)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("cash")}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        paymentMethod === "cash"
                          ? "border-amber-500 bg-amber-500/15 text-amber-300 shadow-sm"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700"
                      )}
                    >
                      <Banknote className="w-4 h-4" />
                      <span>پرداخت نقدی</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card_to_card")}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        paymentMethod === "card_to_card"
                          ? "border-amber-500 bg-amber-500/15 text-amber-300 shadow-sm"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700"
                      )}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>کارت به کارت / شبا</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("split")}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        paymentMethod === "split"
                          ? "border-amber-500 bg-amber-500/15 text-amber-300 shadow-sm"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700"
                      )}
                    >
                      <SplitSquareVertical className="w-4 h-4" />
                      <span>دنگی / چندکارته</span>
                    </button>
                  </div>

                  {/* فیلدهای اختصاصی هر روش پرداخت */}
                  {paymentMethod === "pos" && (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={posRefNumber}
                        onChange={(e) => setPosRefNumber(e.target.value)}
                        placeholder="شماره پیگیری / مرجع کارتخوان (اختیاری جهت مغایرت‌گیری بانکی)..."
                        dir="ltr"
                        className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {paymentMethod === "cash" && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="flex-1 min-w-[180px]">
                        <label className="text-[11px] text-slate-400 block mb-1">
                          مبلغ دریافتی از مشتری (تومان):
                        </label>
                        <input
                          type="number"
                          value={cashGiven}
                          onChange={(e) => setCashGiven(e.target.value)}
                          placeholder="مبلغ پرداختی مشتری..."
                          dir="ltr"
                          className="h-9 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-400 block">مانده برگشتی به مشتری:</span>
                        <strong className="text-amber-400 text-sm font-black">
                          {formatToman(cashChangeDue)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {paymentMethod === "split" && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                      <SplitSquareVertical className="w-4 h-4 flex-shrink-0" />
                      <span>قابلیت تقسیم دنگی فاکتور فعال است. مشتریان می‌توانند مبلغ نهایی را با چند کارت تسویه کنند.</span>
                    </div>
                  )}
                </div>

                {/* ابزار تخفیف */}
                <div className="flex flex-wrap items-end gap-2.5 pt-2">
                  <div className="min-w-48 flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-slate-400">
                      تخفیف دستی به تومان
                    </label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      dir="ltr"
                      className="h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setDiscountInput(String(Math.floor(subtotal * 0.05)))}
                    className="h-10 rounded-xl border border-slate-800 bg-slate-900 px-4 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    ۵٪ تخفیف
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountInput(String(Math.floor(subtotal * 0.1)))}
                    className="h-10 rounded-xl border border-slate-800 bg-slate-900 px-4 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    ۱۰٪ تخفیف
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyDiscount}
                    disabled={pendingAction !== null}
                    className="flex h-10 items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-750 hover:text-white disabled:opacity-50"
                  >
                    {pendingAction === "discount" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    ) : (
                      <Percent className="h-4 w-4 text-amber-400" />
                    )}
                    <span>
                      {pendingAction === "discount" ? "در حال ثبت..." : "اعمال تخفیف"}
                    </span>
                  </button>
                </div>

                {/* خلاصه ارقام مالی و مالیات ۱۰٪ مصوب قانون مؤدیان */}
                <div className="space-y-2.5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>جمع کل اقلام سفارش:</span>
                    <span className="font-extrabold text-slate-200">
                      {formatToman(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">تخفیف فاکتور:</span>
                    <span
                      className={cn(
                        "font-extrabold",
                        numericDiscount > 0 ? "text-rose-400" : "text-slate-500"
                      )}
                    >
                      {numericDiscount > 0
                        ? `− ${formatToman(numericDiscount)}`
                        : formatToman(0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>مالیات بر ارزش افزوده (۱۰٪)</span>
                    <span className="font-extrabold text-slate-200">
                      {formatToman(vatAmount)}
                    </span>
                  </div>

                  {/* نوار بزرگ مبلغ کل نهایی با رنگ کهربایی اصیل سامانه */}
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 px-5 py-4 text-slate-950 shadow-xl shadow-amber-950/40">
                    <span className="font-extrabold text-sm text-slate-950">مبلغ کل قابل پرداخت:</span>
                    <span className="text-2xl font-black">{formatToman(grandTotal)}</span>
                  </div>
                </div>

                {/* دکمه‌های اقدام صندوقدار */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row">
                    {selectedOrder.status !== "settling" ? (
                      <button
                        type="button"
                        onClick={handleLockForCheckout}
                        disabled={pendingAction !== null || activeItems.length === 0}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                      >
                        {pendingAction === "lock" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="h-4 w-4 text-amber-400" />
                        )}
                        <span>
                          {pendingAction === "lock"
                            ? "در حال ثبت..."
                            : "قفل و ارسال به صندوق جهت تسویه"}
                        </span>
                      </button>
                    ) : (
                      <div className="grid min-h-11 flex-1 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-bold text-amber-300">
                        🔒 فاکتور برای تسویه قفل شده است
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSettle}
                      disabled={pendingAction !== null || activeItems.length === 0}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                    >
                      {pendingAction === "settle" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>
                        {pendingAction === "settle"
                          ? "در حال تسویه..."
                          : "تأیید نهایی پرداخت و بستن میز"}
                      </span>
                    </button>
                  </div>

                  <p className="text-[11px] leading-5 text-slate-500 text-center">
                    قفل سفارش، ویرایش‌های احتمالی همزمان سالن را متوقف کرده و فاکتور نهایی را صادر می‌نماید.
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
