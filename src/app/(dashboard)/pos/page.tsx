"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createOrGetTableOrder } from "@/actions/order-actions";
import { AiScratchpad } from "@/components/pos/AiScratchpad";
import { MenuBrowser } from "@/components/pos/MenuBrowser";
import { OrderTicket } from "@/components/pos/OrderTicket";
import { useToast } from "@/components/ui/ToastProvider";
import { Loader2, Plus, RefreshCw, Users, CheckCircle, Clock, UtensilsCrossed } from "lucide-react";
import {
  cn,
  formatToman,
  parseTableNumber,
  TABLE_STATUS_MAP,
  toPersianDigits,
  translateServerError,
} from "@/lib/utils";

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
  restaurant_id: string;
  name: string;
  category: string;
  price_toman: number;
  is_available: boolean;
}

export default function PosPage() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<"all" | "open" | "empty">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [tablesRes, ordersRes, itemsRes, menuRes] = await Promise.all([
      supabase.from("dining_tables").select("*").order("table_number"),
      supabase.from("orders").select("*").in("status", ["open", "settling"]),
      supabase.from("order_items").select("*"),
      supabase.from("menu_items").select("*").order("category"),
    ]);

    if (tablesRes.data) {
      setTables(
        [...tablesRes.data].sort(
          (a: Table, b: Table) =>
            parseTableNumber(a.table_number) - parseTableNumber(b.table_number)
        )
      );
    }
    if (ordersRes.data) setOrders(ordersRes.data);
    if (itemsRes.data) setOrderItems(itemsRes.data);
    if (menuRes.data) setMenuItems(menuRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Supabase Realtime for table orders and live item modifications
    const supabase = createClient();
    const channel = supabase
      .channel("pos_live_channel")
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
    setSelectedTableId(table.id);
    const existingOrder = orders.find((order) => order.table_id === table.id);
    if (existingOrder) return;

    setOpeningTableId(table.id);
    const res = await createOrGetTableOrder(table.id);
    setOpeningTableId(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      return;
    }
    if (res.order) {
      setOrders((prev) =>
        prev.some((order) => order.id === res.order.id) ? prev : [...prev, res.order]
      );
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const menuItemMap = useMemo(
    () =>
      menuItems.reduce<Record<string, { name: string; price_toman: number }>>(
        (acc, item) => {
          acc[item.id] = { name: item.name, price_toman: item.price_toman };
          return acc;
        },
        {}
      ),
    [menuItems]
  );

  const selectedTable = tables.find((table) => table.id === selectedTableId) || null;
  const currentTableOrder = selectedTable
    ? orders.find((order) => order.table_id === selectedTable.id) || null
    : null;
  const currentOrderItems = currentTableOrder
    ? orderItems.filter((item) => item.order_id === currentTableOrder.id)
    : [];

  const emptyCount = tables.filter(
    (table) => !orders.some((order) => order.table_id === table.id)
  ).length;
  const openCount = orders.filter((order) => order.status === "open").length;
  const settlingCount = orders.filter((order) => order.status === "settling").length;

  const filteredTables = useMemo(() => {
    if (tableFilter === "open") {
      return tables.filter((t) => orders.some((o) => o.table_id === t.id));
    }
    if (tableFilter === "empty") {
      return tables.filter((t) => !orders.some((o) => o.table_id === t.id));
    }
    return tables;
  }, [tables, orders, tableFilter]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 bg-slate-950">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
          <span>در حال دریافت سالن و فهرست میزها...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 lg:p-6 bg-slate-950 text-slate-100">
      {/* Page Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-850 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 sm:text-2xl flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-amber-400" />
            <span>ثبت و مدیریت سفارش سالن</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            روی میز کلیک کنید؛ سفارشات را با ۱ کلیک علامت بزنید، یادداشت اختصاصی بنویسید یا با هوش مصنوعی صوتی ثبت کنید.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 text-xs font-bold text-slate-300 shadow-sm transition-colors hover:bg-slate-850 hover:text-white"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-amber-400")} />
          <span>بروزرسانی زنده</span>
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[65fr_35fr]">
        {/* Main Left/Right Work Area */}
        <div className="min-w-0 space-y-5">
          {/* Table Grid Card */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-400" />
                <h2 className="font-extrabold text-sm text-slate-100">
                  میزهای سالن و وضعیت سفارش‌ها
                </h2>
              </div>

              {/* Table Filter Tabs */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTableFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-bold transition-all",
                    tableFilter === "all" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                  )}
                >
                  همه ({toPersianDigits(tables.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter("open")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-bold transition-all",
                    tableFilter === "open" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                  )}
                >
                  دارای سفارش ({toPersianDigits(openCount + settlingCount)})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter("empty")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-bold transition-all",
                    tableFilter === "empty" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                  )}
                >
                  خالی ({toPersianDigits(emptyCount)})
                </button>
              </div>
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {filteredTables.map((table) => {
                const activeOrder = orders.find((order) => order.table_id === table.id);
                const activeItems = activeOrder
                  ? orderItems.filter(
                      (item) =>
                        item.order_id === activeOrder.id && item.status !== "cancelled"
                    )
                  : [];
                const totalAmount = activeItems.reduce(
                  (sum, item) => sum + item.quantity * item.unit_price_toman,
                  0
                );
                const status: "empty" | "open" | "settling" = activeOrder
                  ? activeOrder.status === "settling"
                    ? "settling"
                    : "open"
                  : "empty";
                const isSelected = selectedTableId === table.id;
                const isOpening = openingTableId === table.id;

                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => handleTableClick(table)}
                    disabled={isOpening}
                    className={cn(
                      "relative min-h-[96px] rounded-xl border-2 p-3 text-start transition-all flex flex-col justify-between",
                      isSelected
                        ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30"
                        : status === "settling"
                        ? "border-purple-500/50 bg-purple-500/10 hover:border-purple-400"
                        : status === "open"
                        ? "border-amber-500/30 bg-slate-950/70 hover:border-amber-500/60"
                        : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className="text-sm font-black text-slate-100">
                        {table.table_number}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[9px] font-bold",
                          status === "open" && "bg-amber-500/15 text-amber-300 border-amber-500/30",
                          status === "settling" && "bg-purple-500/15 text-purple-300 border-purple-500/30",
                          status === "empty" && "bg-slate-800 text-slate-400 border-slate-700"
                        )}
                      >
                        {status === "open" && "سفارش فعال"}
                        {status === "settling" && "در حال تسویه"}
                        {status === "empty" && "خالی"}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      ظرفیت: {toPersianDigits(table.capacity)} نفر
                    </div>

                    {activeOrder ? (
                      <div className="text-[11px] font-extrabold text-amber-400 flex items-center justify-between">
                        <span>{toPersianDigits(activeItems.length)} قلم</span>
                        <span>{formatToman(totalAmount)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Plus className="h-3 w-3" />
                        <span>لمس برای ثبت سفارش</span>
                      </div>
                    )}

                    {isOpening && (
                      <span className="absolute inset-0 grid place-items-center rounded-xl bg-slate-950/80">
                        <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* AI Smart Waiter Voice / Text Scratchpad */}
          <AiScratchpad
            orderId={currentTableOrder?.id ?? null}
            tableNumber={selectedTable?.table_number ?? null}
            menuItemMap={menuItemMap}
            menuItems={menuItems}
            onItemsAdded={fetchData}
          />

          {/* Interactive Menu Browser with 1-Tap Marking */}
          <MenuBrowser
            menuItems={menuItems}
            orderId={currentTableOrder?.id ?? null}
            tableNumber={selectedTable?.table_number ?? null}
            currentOrderItems={currentOrderItems}
            onAdded={fetchData}
          />
        </div>

        {/* Sidebar: Sticky Order Ticket with Instant Edit & Totals */}
        <OrderTicket
          table={selectedTable}
          order={currentTableOrder}
          items={currentOrderItems}
          menuItemMap={menuItemMap}
          onChanged={fetchData}
        />
      </div>
    </div>
  );
}
