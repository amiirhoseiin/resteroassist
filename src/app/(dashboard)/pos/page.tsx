"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { createOrGetTableOrder } from "@/actions/order-actions";
import { OrderDrawer } from "@/components/pos/OrderDrawer";
import { 
  UtensilsCrossed, 
  Users, 
  Clock, 
  CheckCircle2, 
  Plus, 
  RefreshCw, 
  Receipt,
  Sparkles
} from "lucide-react";
import { formatToman, toPersianDigits, ORDER_STATUS_MAP } from "@/lib/utils";

interface Table {
  id: string;
  table_number: string;
  capacity: number;
}

interface Order {
  id: string;
  table_id: string;
  status: string;
  discount_toman: number;
  version: number;
  created_at: string;
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

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price_toman: number;
  is_available: boolean;
}

export default function PosPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [tablesRes, ordersRes, itemsRes, menuRes] = await Promise.all([
      supabase.from("dining_tables").select("*").order("table_number"),
      supabase.from("orders").select("*").in("status", ["open", "settling"]),
      supabase.from("order_items").select("*"),
      supabase.from("menu_items").select("*").eq("is_available", true).order("category"),
    ]);

    if (tablesRes.data) setTables(tablesRes.data);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (itemsRes.data) setOrderItems(itemsRes.data);
    if (menuRes.data) setMenuItems(menuRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes on orders and order_items
    const supabase = createClient();
    const channel = supabase
      .channel("pos_realtime_channel")
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const handleTableClick = async (table: Table) => {
    setSelectedTable(table);
    const existingOrder = orders.find((o) => o.table_id === table.id);

    if (!existingOrder) {
      // Auto-open new order for table
      const res = await createOrGetTableOrder(table.id);
      if (res.success && res.order) {
        setOrders((prev) => [...prev, res.order]);
      }
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
          <span>در حال بارگذاری وضعیت میزها و سالن...</span>
        </div>
      </div>
    );
  }

  // Active order for currently selected table
  const currentTableOrder = selectedTable
    ? orders.find((o) => o.table_id === selectedTable.id) || null
    : null;

  const currentOrderItems = currentTableOrder
    ? orderItems.filter((it) => it.order_id === currentTableOrder.id)
    : [];

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
              مدیریت میزها و ثبت سفارش سالن
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              همگام‌سازی زنده فعال
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            پشتیبانی از ثبت همزمان چند گارسون روی یک میز، قفل پخت آشپزخانه و تبدیل گفتار فارسی به فاکتور
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand-400" : ""}`} />
          <span>بروزرسانی داده‌ها</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="text-slate-400 text-xs font-medium">کل میزهای سالن</div>
          <div className="text-xl sm:text-2xl font-black text-slate-100 mt-1">
            {toPersianDigits(tables.length)} میز
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="text-emerald-400 text-xs font-medium">میزهای فعال (در حال سرو)</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
            {toPersianDigits(orders.filter((o) => o.status === "open").length)} میز
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="text-amber-400 text-xs font-medium">در انتظار تسویه (صندوق)</div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
            {toPersianDigits(orders.filter((o) => o.status === "settling").length)} میز
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="text-slate-400 text-xs font-medium">میزهای خالی و آماده پذیرش</div>
          <div className="text-xl sm:text-2xl font-black text-slate-300 mt-1">
            {toPersianDigits(tables.length - orders.length)} میز
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map((table) => {
          const activeOrder = orders.find((o) => o.table_id === table.id);
          const activeItems = activeOrder
            ? orderItems.filter((it) => it.order_id === activeOrder.id && it.status !== "cancelled")
            : [];
          const totalAmount = activeItems.reduce(
            (sum, it) => sum + it.quantity * it.unit_price_toman,
            0
          );

          const status = activeOrder ? activeOrder.status : "free";

          return (
            <div
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={`p-5 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl relative overflow-hidden ${
                status === "settling"
                  ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-400"
                  : status === "open"
                  ? "bg-slate-900/90 border-brand-500/40 hover:border-brand-400 shadow-md"
                  : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700 opacity-90"
              }`}
            >
              {/* Status Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-base text-slate-100">
                  {table.table_number}
                </span>

                {status === "free" ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    آزاد
                  </span>
                ) : status === "settling" ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse font-medium">
                    در حال تسویه
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                    سفارش جاری
                  </span>
                )}
              </div>

              {/* Table details */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>ظرفیت:</span>
                  </span>
                  <span className="font-medium text-slate-300">
                    {toPersianDigits(table.capacity)} نفر
                  </span>
                </div>

                {activeOrder ? (
                  <>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>تعداد اقلام ثبت‌شده:</span>
                      <span className="font-bold text-slate-200">
                        {toPersianDigits(activeItems.length)} ردیف
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400">مبلغ سفارش:</span>
                      <span className="font-extrabold text-brand-400 text-sm">
                        {formatToman(totalAmount)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="pt-2 text-slate-500 text-[11px] flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-brand-400" />
                    <span>کلیک کنید تا سفارش باز شود</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-over Order Drawer */}
      {selectedTable && (
        <OrderDrawer
          table={selectedTable}
          initialOrder={currentTableOrder}
          initialItems={currentOrderItems}
          menuItems={menuItems}
          onClose={() => setSelectedTable(null)}
          onRefreshNeeded={fetchData}
        />
      )}
    </div>
  );
}
