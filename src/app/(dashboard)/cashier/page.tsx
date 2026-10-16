"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyOrderDiscount, settleOrder } from "@/actions/order-actions";
import { 
  Receipt, 
  CreditCard, 
  Percent, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  Clock, 
  Check, 
  ShieldCheck, 
  RefreshCw, 
  ArrowLeft 
} from "lucide-react";
import { formatToman, toPersianDigits, formatPersianTime } from "@/lib/utils";

interface Order {
  id: string;
  table_id: string;
  status: string;
  discount_toman: number;
  version: number;
  created_at: string;
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

interface PaidOrderSummary {
  id: string;
  table_number: string;
  total_toman: number;
  paid_at: string;
}

export default function CashierPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; msg: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Fetch open and settling orders
    const { data: activeOrders } = await supabase
      .from("orders")
      .select("*, dining_tables (table_number)")
      .in("status", ["open", "settling"])
      .order("created_at", { ascending: false });

    // Fetch recently paid orders from today
    const { data: settledOrders } = await supabase
      .from("orders")
      .select("*, dining_tables (table_number)")
      .eq("status", "paid")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (activeOrders) {
      setOrders(activeOrders);
      // Automatically select first settling or open order if none selected
      if (!selectedOrderId && activeOrders.length > 0) {
        const preferred = activeOrders.find((o) => o.status === "settling") || activeOrders[0];
        setSelectedOrderId(preferred.id);
        setDiscountInput(preferred.discount_toman.toString());
      }
    }

    if (settledOrders) {
      setPaidOrders(settledOrders);
    }

    setLoading(false);
  }, [selectedOrderId]);

  // Fetch items for selected order
  const fetchOrderItems = useCallback(async (orderId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("order_items")
      .select("*, menu_items (name)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (data) {
      setOrderItems(data);
    }
  }, []);

  useEffect(() => {
    fetchData();

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderItems(selectedOrderId);
      const current = orders.find((o) => o.id === selectedOrderId);
      if (current) {
        setDiscountInput(current.discount_toman.toString());
      }
    }
  }, [selectedOrderId, orders, fetchOrderItems]);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);

  // Bill calculations
  const nonCancelledItems = orderItems.filter((it) => it.status !== "cancelled");
  const subtotal = nonCancelledItems.reduce(
    (sum, it) => sum + it.quantity * it.unit_price_toman,
    0
  );

  const numericDiscount = Math.min(Math.max(0, parseInt(discountInput || "0", 10) || 0), subtotal);
  const netSubtotal = subtotal - numericDiscount;
  const vatRate = 0.10; // 10% Statutory VAT (1403)
  const vatAmount = Math.floor(netSubtotal * vatRate);
  const grandTotal = netSubtotal + vatAmount;

  // Handle Discount Application
  const handleApplyDiscount = async (discountVal: number) => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    setFeedback(null);

    const res = await applyOrderDiscount({
      orderId: selectedOrder.id,
      discountToman: discountVal,
      expectedVersion: selectedOrder.version,
    });

    if (!res.success) {
      setFeedback({ type: "error", msg: res.error || "خطا در اعمال تخفیف" });
    } else {
      setFeedback({ type: "success", msg: "تخفیف با موفقیت روی فاکتور اعمال شد." });
      await fetchData();
    }
    setIsSubmitting(false);
  };

  // Handle Final Settlement
  const handleSettleBill = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    setFeedback(null);

    const res = await settleOrder({
      orderId: selectedOrder.id,
      discountToman: numericDiscount,
      expectedVersion: selectedOrder.version,
    });

    if (!res.success) {
      setFeedback({
        type: "error",
        msg: res.error || "خطا در تسویه فاکتور (احتمال تغییر سفارش در حین پرداخت)",
      });
    } else {
      setFeedback({
        type: "success",
        msg: `فاکتور ${selectedOrder.dining_tables?.table_number} با موفقیت تسویه و بسته شد. مبلغ نهایی: ${formatToman(grandTotal)}`,
      });
      setShowReceipt(true);
      await fetchData();
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
          <span>در حال دریافت اطلاعات صندوق و صورت‌حساب‌ها...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6">
      {/* Cashier Station Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <Receipt className="w-6 h-6 text-brand-400" />
              <span>ایستگاه صندوق‌داری و تسویه حساب مالی</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
              محاسبه مالیات بر ارزش افزوده ۱۰٪
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            اعمال تخفیف مدیریتی، اعمال نرخ قانونی ارزش افزوده ۱۴۰۳، و بستن اتمیک فاکتور میزها
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs text-slate-300 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>بروزرسانی صندوق</span>
        </button>
      </div>

      {/* Main Grid: Orders List on Right / Detailed Checkout Bill on Left */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Middle Column: Active Checkout Bill */}
        <div className="lg:col-span-8 space-y-4">
          {/* Feedback Banner */}
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
                className="text-slate-400 hover:text-white text-xs"
              >
                بستن
              </button>
            </div>
          )}

          {selectedOrder ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
              {/* Bill Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                    <span>صورت‌حساب {selectedOrder.dining_tables?.table_number}</span>
                    <span className="text-xs font-normal text-slate-400">
                      (شناسه: {selectedOrder.id.slice(0, 8)})
                    </span>
                  </h2>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                    <span>نسخه فاکتور: v{toPersianDigits(selectedOrder.version)}</span>
                    <span>•</span>
                    <span>ساعت ثبت: {formatPersianTime(selectedOrder.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      selectedOrder.status === "settling"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    }`}
                  >
                    {selectedOrder.status === "settling" ? "در انتظار پرداخت" : "سفارش جاری"}
                  </span>
                </div>
              </div>

              {/* Itemized Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-semibold">شرح اقلام سفارش</th>
                      <th className="pb-3 font-semibold text-center">تعداد</th>
                      <th className="pb-3 font-semibold text-left">قیمت واحد</th>
                      <th className="pb-3 font-semibold text-left">مجموع ردیف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {orderItems.map((item) => (
                      <tr
                        key={item.id}
                        className={item.status === "cancelled" ? "opacity-40 line-through" : ""}
                      >
                        <td className="py-3">
                          <div className="font-bold text-slate-200">
                            {item.menu_items?.name || "قلم منو"}
                          </div>
                          {item.notes && (
                            <div className="text-[11px] text-amber-400">یادداشت: {item.notes}</div>
                          )}
                        </td>
                        <td className="py-3 text-center font-bold text-slate-300">
                          {toPersianDigits(item.quantity)}
                        </td>
                        <td className="py-3 text-left font-mono text-slate-400">
                          {formatToman(item.unit_price_toman)}
                        </td>
                        <td className="py-3 text-left font-bold font-mono text-slate-200">
                          {formatToman(item.quantity * item.unit_price_toman)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Discount Controls Section */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-brand-400" />
                    <span>تخفیف مدیریتی</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    مستقیماً در محاسبه ارزش افزوده کسر می‌گردد
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[180px]">
                    <input
                      type="number"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="مبلغ تخفیف به تومان"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  {/* Quick percentage shortcuts */}
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.floor(subtotal * 0.05);
                      setDiscountInput(val.toString());
                      handleApplyDiscount(val);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-xs text-slate-300 border border-slate-750"
                  >
                    ۵٪
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.floor(subtotal * 0.10);
                      setDiscountInput(val.toString());
                      handleApplyDiscount(val);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-xs text-slate-300 border border-slate-750"
                  >
                    ۱۰٪
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.floor(subtotal * 0.15);
                      setDiscountInput(val.toString());
                      handleApplyDiscount(val);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-xs text-slate-300 border border-slate-750"
                  >
                    ۱۵٪
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleApplyDiscount(numericDiscount)}
                    className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-xs shadow-md shadow-brand-500/20 disabled:opacity-50"
                  >
                    ثبت تخفیف
                  </button>
                </div>
              </div>

              {/* Financial Calculation Breakdown (Iranian Tax & VAT Standards) */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>جمع اقلام فاکتور (Subtotal):</span>
                  <span className="font-bold text-slate-200">{formatToman(subtotal)}</span>
                </div>

                {numericDiscount > 0 && (
                  <div className="flex items-center justify-between text-rose-400">
                    <span>کسر تخفیف:</span>
                    <span className="font-bold">- {formatToman(numericDiscount)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>مبنای مشمول مالیات (Net Subtotal):</span>
                  <span className="font-bold text-slate-300">{formatToman(netSubtotal)}</span>
                </div>

                <div className="flex items-center justify-between text-amber-400 font-medium">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>مالیات بر ارزش افزوده ۱۰٪ (مصوب قانون بودجه ۱۴۰۳):</span>
                  </div>
                  <span className="font-extrabold">{formatToman(vatAmount)}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-base font-black">
                  <span className="text-slate-100">مبلغ نهایی قابل پرداخت:</span>
                  <span className="text-brand-400 text-lg">{formatToman(grandTotal)}</span>
                </div>
              </div>

              {/* Settlement Action Bar */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || nonCancelledItems.length === 0}
                  onClick={handleSettleBill}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>تسویه نهایی و بستن فاکتور ({formatToman(grandTotal)})</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs flex items-center gap-2 transition-colors border border-slate-700"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ فیش</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
              میزی را از ستون کناری برای مشاهده فاکتور و تسویه انتخاب کنید.
            </div>
          )}
        </div>

        {/* Right Column: Tables Awaiting Settlement & Today's Paid Orders */}
        <div className="lg:col-span-4 space-y-6">
          {/* Tables Awaiting Checkout */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>میزهای در انتظار تسویه ({toPersianDigits(orders.length)})</span>
              <span className="text-[11px] text-brand-400">سفارش‌های باز</span>
            </h3>

            {orders.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                در حال حاضر هیچ میزی در صف تسویه نیست.
              </div>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`w-full p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                      selectedOrderId === o.id
                        ? "bg-brand-500/15 border-brand-500 text-white shadow-md"
                        : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs">
                        {o.dining_tables?.table_number || "میز نامشخص"}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        نسخه v{toPersianDigits(o.version)} • {formatPersianTime(o.created_at)}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        o.status === "settling"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {o.status === "settling" ? "آماده تسویه" : "سفارش جاری"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recently Settled Orders from Today */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>فاکتورهای تسویه شده شیفت ({toPersianDigits(paidOrders.length)})</span>
              <span className="text-[11px] text-emerald-400">امروز ظهر تا شب</span>
            </h3>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {paidOrders.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/60 text-xs flex items-center justify-between text-slate-400"
                >
                  <div>
                    <div className="font-semibold text-slate-200">
                      {p.dining_tables?.table_number || "میز"}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      بسته شده در {formatPersianTime(p.created_at)}
                    </div>
                  </div>
                  <span className="text-emerald-400 font-medium">تسویه شد ✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
