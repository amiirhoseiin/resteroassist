"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createOrGetTableOrder } from "@/actions/order-actions";
import { AiScratchpad } from "@/components/pos/AiScratchpad";
import { MenuBrowser } from "@/components/pos/MenuBrowser";
import { OrderTicket } from "@/components/pos/OrderTicket";
import { useToast } from "@/components/ui/ToastProvider";
import { Loader2, Plus, RefreshCw, Users } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [tablesRes, ordersRes, itemsRes, menuRes] = await Promise.all([
      supabase.from("dining_tables").select("*").order("table_number"),
      supabase.from("orders").select("*").in("status", ["open", "settling"]),
      supabase.from("order_items").select("*"),
      supabase.from("menu_items").select("*").eq("is_available", true).order("category"),
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

    // اشتراک زنده روی سفارش‌ها و آیتم‌های سفارش
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
          <span>در حال بارگذاری سالن و فهرست میزها...</span>
        </div>
      </div>
    );
  }

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

  return (
    <div className="flex-1 p-4 lg:p-6">
      {/* سربرگ صفحه */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 sm:text-2xl">ثبت سفارش سالن</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            میز را انتخاب کنید و سفارش را از منوی رستوران یا با دستیار هوشمند ثبت کنید.
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

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[65fr_35fr]">
        {/* ستون اصلی (سمت راست در RTL) */}
        <div className="min-w-0">
          {/* نوار انتخاب میز */}
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-slate-800">
                <Users className="h-5 w-5 text-emerald-600" />
                <span>سالن و میزها</span>
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-bold text-slate-500">
                  خالی و آماده: {toPersianDigits(emptyCount)}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">
                  سفارش فعال: {toPersianDigits(openCount)}
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 font-bold text-amber-800">
                  در حال تسویه: {toPersianDigits(settlingCount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {tables.map((table) => {
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
                const statusInfo = TABLE_STATUS_MAP[status];
                const isSelected = selectedTableId === table.id;
                const isOpening = openingTableId === table.id;

                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => handleTableClick(table)}
                    disabled={isOpening}
                    className={cn(
                      "relative min-h-[104px] rounded-xl border-2 p-3.5 text-start transition-all",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/70 ring-4 ring-emerald-500/25"
                        : status === "settling"
                        ? "border-amber-300 bg-amber-50/60 hover:border-amber-400"
                        : status === "open"
                        ? "border-slate-300 bg-white hover:border-emerald-400"
                        : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-black text-slate-800">
                        {table.table_number}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                          statusInfo.badge
                        )}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Users className="h-3.5 w-3.5" />
                      <span>ظرفیت: {toPersianDigits(table.capacity)} نفر</span>
                    </div>

                    {activeOrder ? (
                      <div className="mt-1.5 text-[11px] font-extrabold text-slate-700">
                        {formatToman(totalAmount)}
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                        <Plus className="h-3 w-3" />
                        <span>برای باز کردن سفارش کلیک کنید</span>
                      </div>
                    )}

                    {isOpening && (
                      <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/70">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* دفترچه هوشمند ثبت سفارش */}
          <AiScratchpad
            orderId={currentTableOrder?.id ?? null}
            tableNumber={selectedTable?.table_number ?? null}
            menuItemMap={menuItemMap}
            onItemsAdded={fetchData}
          />

          {/* منوی رستوران */}
          <MenuBrowser
            menuItems={menuItems}
            orderId={currentTableOrder?.id ?? null}
            onAdded={fetchData}
          />
        </div>

        {/* ستون فاکتور (سمت چپ در RTL) */}
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
