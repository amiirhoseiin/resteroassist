"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateItemStatus } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  Flame,
  Loader2,
  RefreshCw,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  cn,
  getElapsedMinutes,
  toPersianDigits,
  translateServerError,
} from "@/lib/utils";

type KitchenStatus = "pending" | "preparing" | "ready";

interface KdsItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price_toman: number;
  notes?: string | null;
  status: "pending" | "preparing" | "ready" | "served" | "cancelled";
  version: number;
  created_at: string;
  // فیلدهای الحاقی
  menu_item_name?: string;
  table_number?: string;
  waiter_name?: string;
}

interface KitchenTicket {
  orderId: string;
  tableNumber: string;
  waiterName: string;
  earliest: string;
  items: KdsItem[];
}

const FILTERS: { key: "all" | KitchenStatus; label: string }[] = [
  { key: "all", label: "همهٔ سفارش‌ها" },
  { key: "pending", label: "در انتظار پخت" },
  { key: "preparing", label: "در حال آماده‌سازی" },
  { key: "ready", label: "آماده سرو" },
];

export default function KdsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<KdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | KitchenStatus>("all");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const fetchKdsItems = useCallback(async () => {
    const supabase = createClient();

    const [itemsRes, staffRes] = await Promise.all([
      supabase
        .from("order_items")
        .select(
          `
          id,
          order_id,
          menu_item_id,
          quantity,
          unit_price_toman,
          notes,
          status,
          version,
          created_at,
          menu_items (name),
          orders ( created_by, dining_tables (table_number) )
        `
        )
        .in("status", ["pending", "preparing", "ready"])
        .order("created_at", { ascending: true }),
      supabase.from("staff_profiles").select("id, full_name"),
    ]);

    const staffMap: Record<string, string> = {};
    (staffRes.data || []).forEach((profile: { id: string; full_name: string }) => {
      staffMap[profile.id] = profile.full_name;
    });

    if (itemsRes.data) {
      const flattened: KdsItem[] = itemsRes.data.map((raw: any) => ({
        id: raw.id,
        order_id: raw.order_id,
        menu_item_id: raw.menu_item_id,
        quantity: raw.quantity,
        unit_price_toman: raw.unit_price_toman,
        notes: raw.notes,
        status: raw.status,
        version: raw.version,
        created_at: raw.created_at,
        menu_item_name: raw.menu_items?.name || "آیتم منو",
        table_number: raw.orders?.dining_tables?.table_number || "میز نامشخص",
        waiter_name: staffMap[raw.orders?.created_by] || "سالن‌دار شیفت",
      }));
      setItems(flattened);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKdsItems();

    // اشتراک زندهٔ مانیتور آشپزخانه
    const supabase = createClient();
    const channel = supabase
      .channel("kds_realtime_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          fetchKdsItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchKdsItems]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchKdsItems();
    setRefreshing(false);
  };

  const handleStatusChange = async (item: KdsItem, newStatus: KitchenStatus) => {
    setBusyItemId(item.id);

    const res = await updateItemStatus({
      itemId: item.id,
      newStatus,
      expectedVersion: item.version,
    });

    setBusyItemId(null);

    if (!res.success) {
      showToast("error", translateServerError(res.error));
      await fetchKdsItems();
      return;
    }

    const label =
      newStatus === "preparing"
        ? "شروع پخت ثبت شد."
        : "آیتم آمادهٔ تحویل به سالن شد.";
    showToast("success", label);
    await fetchKdsItems();
  };

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) => activeFilter === "all" || item.status === activeFilter
      ),
    [items, activeFilter]
  );

  const tickets = useMemo<KitchenTicket[]>(() => {
    const byOrder = new Map<string, KitchenTicket>();

    for (const item of filteredItems) {
      const existing = byOrder.get(item.order_id);
      if (existing) {
        existing.items.push(item);
        if (item.created_at < existing.earliest) existing.earliest = item.created_at;
      } else {
        byOrder.set(item.order_id, {
          orderId: item.order_id,
          tableNumber: item.table_number || "میز نامشخص",
          waiterName: item.waiter_name || "سالن‌دار شیفت",
          earliest: item.created_at,
          items: [item],
        });
      }
    }

    return Array.from(byOrder.values()).sort((a, b) =>
      a.earliest.localeCompare(b.earliest)
    );
  }, [filteredItems]);

  const countFor = (status: "all" | KitchenStatus) =>
    status === "all"
      ? items.length
      : items.filter((item) => item.status === status).length;

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-950 p-8">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
          <span>در حال بارگذاری سفارش‌های آشپزخانه...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex-1 bg-slate-950 p-6 text-slate-100">
      <div className="space-y-6">
        {/* سربرگ مانیتور */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-slate-100 sm:text-2xl">
              <ChefHat className="h-6 w-6 text-amber-400" />
              <span>مانیتور آشپزخانه</span>
            </h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              سفارش‌ها به صورت زنده روی این مانیتور ظاهر می‌شوند؛ با یک لمس وضعیت پخت را به‌روز کنید.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAudioEnabled((enabled) => !enabled)}
              className={cn(
                "flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-colors",
                audioEnabled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
              )}
            >
              {audioEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
              <span>{audioEnabled ? "صدای هشدار: روشن" : "صدای هشدار: خاموش"}</span>
            </button>

            <button
              type="button"
              onClick={handleManualRefresh}
              className="flex h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-bold text-slate-300 transition-colors hover:text-white"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin text-amber-400")}
              />
              <span>بروزرسانی</span>
            </button>
          </div>
        </div>

        {/* فیلترهای وضعیت */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={cn(
                  "min-h-11 rounded-xl border px-4 py-2.5 text-start transition-all",
                  isActive
                    ? "border-amber-500/60 bg-amber-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                )}
              >
                <span
                  className={cn(
                    "block text-xs font-bold",
                    isActive ? "text-amber-300" : "text-slate-300"
                  )}
                >
                  {filter.label}
                </span>
                <span className="mt-1 block text-xl font-black text-slate-100">
                  {toPersianDigits(countFor(filter.key))}
                </span>
              </button>
            );
          })}
        </div>

        {/* کارت‌های سفارش آشپزخانه */}
        {tickets.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-16 text-center">
            <div className="space-y-3">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-800/80">
                <ChefHat className="h-7 w-7 text-slate-500" />
              </span>
              <p className="text-sm text-slate-400">
                در حال حاضر سفارشی در این وضعیت برای پخت وجود ندارد.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {tickets.map((ticket) => {
              const elapsed = getElapsedMinutes(ticket.earliest);
              const isUrgent = elapsed >= 15;
              return (
                <article
                  key={ticket.orderId}
                  className={cn(
                    "overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-900",
                    isUrgent && "glow-urgent border-rose-500/50"
                  )}
                >
                  {/* سربرگ تیکت */}
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/40 p-4">
                    <span className="text-2xl font-black text-slate-50">
                      {ticket.tableNumber}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
                          isUrgent
                            ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                            : "border-slate-700 bg-slate-800 text-slate-300"
                        )}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>{toPersianDigits(elapsed)} دقیقه پیش</span>
                      </span>
                    </div>
                  </div>

                  {/* بدنهٔ تیکت */}
                  <div className="space-y-3 p-4">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <User className="h-3.5 w-3.5" />
                      <span>سالن‌دار: {ticket.waiterName}</span>
                    </div>

                    {ticket.items.map((item) => {
                      const isBusy = busyItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="grid h-7 min-w-7 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/15 px-1.5 text-sm font-black text-amber-300">
                              {toPersianDigits(item.quantity)}×
                            </span>
                            <span className="text-lg font-bold text-slate-100">
                              {item.menu_item_name}
                            </span>
                          </div>

                          {item.notes && (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-sm text-amber-300">
                              یادداشت: {item.notes}
                            </div>
                          )}

                          {item.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item, "preparing")}
                              disabled={isBusy}
                              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-colors hover:bg-amber-400 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Flame className="h-4 w-4" />
                              )}
                              <span>{isBusy ? "در حال ثبت..." : "شروع پخت"}</span>
                            </button>
                          )}

                          {item.status === "preparing" && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item, "ready")}
                              disabled={isBusy}
                              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              <span>
                                {isBusy ? "در حال ثبت..." : "آماده تحویل به سالن"}
                              </span>
                            </button>
                          )}

                          {item.status === "ready" && (
                            <div className="grid h-11 w-full place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-sm font-bold text-emerald-300">
                              آماده سرو ✓
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
