"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateItemStatus } from "@/actions/order-actions";
import { 
  ChefHat, 
  Clock, 
  Flame, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Check, 
  Volume2, 
  VolumeX 
} from "lucide-react";
import { formatPersianTime, getElapsedMinutes, toPersianDigits } from "@/lib/utils";

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
  // Joined fields
  menu_item_name?: string;
  table_number?: string;
}

export default function KdsPage() {
  const [items, setItems] = useState<KdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "preparing" | "ready">("all");

  const fetchKdsItems = useCallback(async () => {
    const supabase = createClient();

    // Query active items for kitchen display
    const { data, error } = await supabase
      .from("order_items")
      .select(`
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
        orders (
          dining_tables (table_number)
        )
      `)
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at", { ascending: true });

    if (data) {
      const flattened: KdsItem[] = data.map((it: any) => ({
        id: it.id,
        order_id: it.order_id,
        menu_item_id: it.menu_item_id,
        quantity: it.quantity,
        unit_price_toman: it.unit_price_toman,
        notes: it.notes,
        status: it.status,
        version: it.version,
        created_at: it.created_at,
        menu_item_name: it.menu_items?.name || "غذای منو",
        table_number: it.orders?.dining_tables?.table_number || "میز نامشخص",
      }));
      setItems(flattened);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKdsItems();

    // Real-time subscription to order_items
    const supabase = createClient();
    const channel = supabase
      .channel("kds_realtime_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        (payload) => {
          fetchKdsItems();
          // Optional sound / alert on new item
          if (payload.eventType === "INSERT" && audioEnabled) {
            try {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 chime
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              osc.start();
              osc.stop(ctx.currentTime + 0.35);
            } catch {
              // Audio context user gesture restrictions
            }
          }
        }
      )
      .subscribe();

    // Refresh timers every 30 seconds
    const intervalId = setInterval(() => {
      setItems((prev) => [...prev]);
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(intervalId);
    };
  }, [fetchKdsItems, audioEnabled]);

  // Handle status update atomically via Postgres RPC
  const handleStatusChange = async (
    item: KdsItem,
    nextStatus: "pending" | "preparing" | "ready" | "served"
  ) => {
    setActionError(null);
    const res = await updateItemStatus({
      itemId: item.id,
      newStatus: nextStatus,
      expectedVersion: item.version,
    });

    if (!res.success) {
      setActionError(res.error || "خطای همزمانی در بروزرسانی وضعیت آشپزخانه");
    } else {
      await fetchKdsItems();
    }
  };

  const pendingItems = items.filter((it) => it.status === "pending");
  const preparingItems = items.filter((it) => it.status === "preparing");
  const readyItems = items.filter((it) => it.status === "ready");

  const displayedItems =
    activeTab === "pending"
      ? pendingItems
      : activeTab === "preparing"
      ? preparingItems
      : activeTab === "ready"
      ? readyItems
      : items;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
          <span>در حال اتصال به مانیتور زنده آشپزخانه (KDS)...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6">
      {/* KDS Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <ChefHat className="w-6 h-6 text-brand-400" />
              <span>نمایشگر زنده آشپزخانه (Kitchen Display System - KDS)</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
              اتصال WebSocket آنلاین
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            ردیابی زنده سفارش‌ها، قفل پخت هوشمند، تفکیک یادداشت‌های آشپزی و کنترل همزمانی
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2 rounded-xl border text-xs transition-colors flex items-center gap-1.5 ${
              audioEnabled
                ? "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? "صدای سفارش فعال" : "صدا قطع"}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await fetchKdsItems();
              setRefreshing(false);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand-400" : ""}`} />
            <span>تازه سازی</span>
          </button>
        </div>
      </div>

      {/* Error / Concurrency Conflict Alert */}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            بستن
          </button>
        </div>
      )}

      {/* Filter Tabs & Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`p-4 rounded-2xl border text-right transition-all ${
            activeTab === "all"
              ? "bg-slate-900 border-brand-500 shadow-lg"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-xs text-slate-400">کل سفارش‌های فعال آشپزخانه</div>
          <div className="text-2xl font-black text-slate-100 mt-1">
            {toPersianDigits(items.length)} قلم
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`p-4 rounded-2xl border text-right transition-all ${
            activeTab === "pending"
              ? "bg-amber-500/10 border-amber-500 shadow-lg"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-xs text-amber-400 font-semibold">در انتظار پخت (جدید)</div>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {toPersianDigits(pendingItems.length)} قلم
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("preparing")}
          className={`p-4 rounded-2xl border text-right transition-all ${
            activeTab === "preparing"
              ? "bg-blue-500/10 border-blue-500 shadow-lg"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-xs text-blue-400 font-semibold">روی اجاق / در حال پخت</div>
          <div className="text-2xl font-black text-blue-400 mt-1">
            {toPersianDigits(preparingItems.length)} قلم
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ready")}
          className={`p-4 rounded-2xl border text-right transition-all ${
            activeTab === "ready"
              ? "bg-emerald-500/10 border-emerald-500 shadow-lg"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-xs text-emerald-400 font-semibold">آماده تحویل به سالن</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {toPersianDigits(readyItems.length)} قلم
          </div>
        </button>
      </div>

      {/* KDS Item Cards Grid */}
      {displayedItems.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <ChefHat className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="font-bold text-slate-300 text-sm">هیچ آیتمی در این وضعیت وجود ندارد.</h3>
          <p className="text-xs text-slate-500">
            به محض ثبت سفارش توسط گارسون، آیتم‌ها بلافاصله روی این صفحه ظاهر می‌شوند.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedItems.map((item) => {
            const elapsed = getElapsedMinutes(item.created_at);
            const isUrgent = elapsed >= 15;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 space-y-3.5 flex flex-col justify-between transition-all ${
                  item.status === "pending"
                    ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60"
                    : item.status === "preparing"
                    ? "bg-blue-500/5 border-blue-500/30 hover:border-blue-500/60"
                    : "bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/60"
                } ${isUrgent && item.status !== "ready" ? "glow-urgent" : ""}`}
              >
                {/* Card Top: Table & Elapsed Timer */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-100">
                      {item.table_number}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      v{toPersianDigits(item.version)}
                    </span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                      isUrgent
                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{toPersianDigits(elapsed)} دقیقه قبل</span>
                  </div>
                </div>

                {/* Item Name & Quantity */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-extrabold text-base text-slate-100">
                      {item.menu_item_name}
                    </h3>
                    <span className="font-black text-lg text-brand-400 mr-2">
                      × {toPersianDigits(item.quantity)}
                    </span>
                  </div>

                  {/* Cooking / Preparation Notes Prominently Styled */}
                  {item.notes ? (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>یادداشت مشتری: {item.notes}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">بدون توضیح اضافه</div>
                  )}
                </div>

                {/* Status Transition Action Buttons */}
                <div className="pt-2">
                  {item.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item, "preparing")}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition-all"
                    >
                      <Flame className="w-4 h-4" />
                      <span>شروع پخت (قفل لغو گارسون)</span>
                    </button>
                  )}

                  {item.status === "preparing" && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item, "ready")}
                      className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>غذا پخته و آماده شد</span>
                    </button>
                  )}

                  {item.status === "ready" && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item, "served")}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      <span>تحویل به مهماندار سالن</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
