"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateItemStatus } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ChefHat,
  Flame,
  CheckCircle2,
  Clock,
  User,
  Volume2,
  VolumeX,
  RefreshCw,
  Loader2,
  LayoutGrid,
  Columns3,
  Layers,
  AlertTriangle,
  Sparkles,
  UtensilsCrossed,
  CheckCheck,
  Bell,
  AlertCircle,
} from "lucide-react";
import {
  cn,
  getElapsedMinutes,
  toPersianDigits,
  translateServerError,
} from "@/lib/utils";

type KitchenStatus = "pending" | "preparing" | "ready";
type ViewMode = "master" | "kanban" | "batch";

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
  // Augmented fields
  menu_item_name?: string;
  category?: string;
  table_number?: string;
  branch_name?: string;
  waiter_name?: string;
}

interface KitchenTicket {
  orderId: string;
  tableNumber: string;
  branchName: string;
  waiterName: string;
  earliest: string;
  items: KdsItem[];
  // Calculated stage indicators
  totalCount: number;
  pendingCount: number;
  preparingCount: number;
  readyCount: number;
  stageLabel: string;
  stageColor: string;
  progressPercent: number;
}

interface BatchItemSummary {
  menuItemId: string;
  menuItemName: string;
  category: string;
  totalQuantity: number;
  pendingQuantity: number;
  preparingQuantity: number;
  readyQuantity: number;
  tables: { tableNumber: string; quantity: number; notes?: string | null }[];
}

export default function KdsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<KdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("master");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [batchActionOrderId, setBatchActionOrderId] = useState<string | null>(null);
  const [recentAlert, setRecentAlert] = useState<{ message: string; timestamp: string } | null>(null);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const prevItemsCountRef = useRef<number>(0);

  // Synthesized chime using Web Audio API
  const playChime = useCallback(() => {
    if (!audioEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {
      // Audio autoplay policy fallback
    }
  }, [audioEnabled]);

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
          menu_items (name, category),
          orders ( 
            created_by, 
            dining_tables (table_number, branch_id, branches (name)) 
          )
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
        category: raw.menu_items?.category || "منو",
        table_number: raw.orders?.dining_tables?.table_number || "میز نامشخص",
        branch_name: raw.orders?.dining_tables?.branches?.name || "سالن اصلی",
        waiter_name: staffMap[raw.orders?.created_by] || "سالن‌دار شیفت",
      }));

      // Play alert chime if new items arrived
      if (prevItemsCountRef.current > 0 && flattened.length > prevItemsCountRef.current) {
        playChime();
      }
      prevItemsCountRef.current = flattened.length;

      setItems(flattened);
    }

    setLoading(false);
  }, [playChime]);

  useEffect(() => {
    fetchKdsItems();

    // Supabase Realtime Subscription for live kitchen updates
    const supabase = createClient();
    const channel = supabase
      .channel("kds_master_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        (payload: any) => {
          fetchKdsItems();
          playChime();

          const nowStr = new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
          if (payload.eventType === "INSERT") {
            setRecentAlert({
              message: "قلم جدیدی توسط سالن‌دار به سفارشات آشپزخانه افزوده شد.",
              timestamp: nowStr,
            });
            if (payload.new?.order_id) {
              setHighlightOrderId(payload.new.order_id);
              setTimeout(() => setHighlightOrderId(null), 10000);
            }
          } else if (payload.eventType === "UPDATE") {
            setRecentAlert({
              message: "سفارش سالن ویرایش شد یا تغییر وضعیت یافت.",
              timestamp: nowStr,
            });
            if (payload.new?.order_id) {
              setHighlightOrderId(payload.new.order_id);
              setTimeout(() => setHighlightOrderId(null), 10000);
            }
          } else if (payload.eventType === "DELETE") {
            setRecentAlert({
              message: "یک قلم از سفارشات سالن لغو یا حذف شد.",
              timestamp: nowStr,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_events" },
        (payload: any) => {
          if (payload.new?.event_type === "item_edited") {
            fetchKdsItems();
            playChime();
            setRecentAlert({
              message: "🔔 سالن‌دار جزئیات سفارش (تعداد یا یادداشت مشتری) را ویرایش کرد!",
              timestamp: new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
            });
            if (payload.new?.order_id) {
              setHighlightOrderId(payload.new.order_id);
              setTimeout(() => setHighlightOrderId(null), 10000);
            }
          }
        }
      )
      .subscribe();

    // Heartbeat minute timer for elapsed times
    const timer = setInterval(() => {
      setItems((prev) => [...prev]);
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
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
        ? `شروع پخت «${item.menu_item_name}» ثبت شد.`
        : `«${item.menu_item_name}» آماده تحویل به سالن شد.`;
    showToast("success", label);
    await fetchKdsItems();
  };

  // Batch action for an entire ticket / order
  const handleBatchAdvanceOrder = async (ticket: KitchenTicket, targetStatus: "preparing" | "ready") => {
    setBatchActionOrderId(ticket.orderId);

    const itemsToAdvance = ticket.items.filter((i) => {
      if (targetStatus === "preparing") return i.status === "pending";
      if (targetStatus === "ready") return i.status === "preparing";
      return false;
    });

    let successCount = 0;
    for (const item of itemsToAdvance) {
      const res = await updateItemStatus({
        itemId: item.id,
        newStatus: targetStatus,
        expectedVersion: item.version,
      });
      if (res.success) successCount++;
    }

    setBatchActionOrderId(null);

    if (successCount > 0) {
      showToast(
        "success",
        targetStatus === "preparing"
          ? `${toPersianDigits(successCount)} قلم از سفارش ${ticket.tableNumber} وارد مرحله پخت شد.`
          : `${toPersianDigits(successCount)} قلم از سفارش ${ticket.tableNumber} آماده تحویل شد.`
      );
    }
    await fetchKdsItems();
  };

  // Group items into tickets by table/order with stage calculation
  const tickets = useMemo<KitchenTicket[]>(() => {
    const byOrder = new Map<string, KitchenTicket>();

    for (const item of items) {
      const existing = byOrder.get(item.order_id);
      if (existing) {
        existing.items.push(item);
        if (item.created_at < existing.earliest) existing.earliest = item.created_at;
      } else {
        byOrder.set(item.order_id, {
          orderId: item.order_id,
          tableNumber: item.table_number || "میز نامشخص",
          branchName: item.branch_name || "سالن اصلی",
          waiterName: item.waiter_name || "سالن‌دار شیفت",
          earliest: item.created_at,
          items: [item],
          totalCount: 0,
          pendingCount: 0,
          preparingCount: 0,
          readyCount: 0,
          stageLabel: "",
          stageColor: "",
          progressPercent: 0,
        });
      }
    }

    const ticketList = Array.from(byOrder.values());

    // Calculate stage details for each ticket
    ticketList.forEach((t) => {
      t.totalCount = t.items.length;
      t.pendingCount = t.items.filter((i) => i.status === "pending").length;
      t.preparingCount = t.items.filter((i) => i.status === "preparing").length;
      t.readyCount = t.items.filter((i) => i.status === "ready").length;

      t.progressPercent = Math.round((t.readyCount / t.totalCount) * 100);

      if (t.readyCount === t.totalCount) {
        t.stageLabel = "آماده تحویل کامل به سالن";
        t.stageColor = "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
      } else if (t.preparingCount > 0 || t.readyCount > 0) {
        t.stageLabel = "روی اجاق و آماده‌سازی";
        t.stageColor = "border-amber-500/40 bg-amber-500/15 text-amber-300";
      } else {
        t.stageLabel = "سفارش جدید (در صف پخت)";
        t.stageColor = "border-blue-500/40 bg-blue-500/15 text-blue-300";
      }
    });

    return ticketList.sort((a, b) => a.earliest.localeCompare(b.earliest));
  }, [items]);

  // Aggregated items for the station/batch expeditor view
  const batchSummaries = useMemo<BatchItemSummary[]>(() => {
    const summaryMap = new Map<string, BatchItemSummary>();

    for (const item of items) {
      const existing = summaryMap.get(item.menu_item_id);
      if (existing) {
        existing.totalQuantity += item.quantity;
        if (item.status === "pending") existing.pendingQuantity += item.quantity;
        if (item.status === "preparing") existing.preparingQuantity += item.quantity;
        if (item.status === "ready") existing.readyQuantity += item.quantity;
        existing.tables.push({
          tableNumber: item.table_number || "میز نامشخص",
          quantity: item.quantity,
          notes: item.notes,
        });
      } else {
        summaryMap.set(item.menu_item_id, {
          menuItemId: item.menu_item_id,
          menuItemName: item.menu_item_name || "آیتم منو",
          category: item.category || "منو",
          totalQuantity: item.quantity,
          pendingQuantity: item.status === "pending" ? item.quantity : 0,
          preparingQuantity: item.status === "preparing" ? item.quantity : 0,
          readyQuantity: item.status === "ready" ? item.quantity : 0,
          tables: [
            {
              tableNumber: item.table_number || "میز نامشخص",
              quantity: item.quantity,
              notes: item.notes,
            },
          ],
        });
      }
    }

    return Array.from(summaryMap.values()).sort(
      (a, b) => b.totalQuantity - a.totalQuantity
    );
  }, [items]);

  // Summary counts
  const totalPending = items.filter((i) => i.status === "pending").length;
  const totalPreparing = items.filter((i) => i.status === "preparing").length;
  const totalReady = items.filter((i) => i.status === "ready").length;

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-950 p-8">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
          <span>در حال دریافت سفارش‌های آشپزخانه و جایگاه‌های میز...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex-1 bg-slate-950 p-4 lg:p-6 text-slate-100 space-y-6">
      {/* Top Header & Chef Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-850 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ChefHat className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 flex items-center gap-2">
                <span>نمایشگر KDS سرآشپز</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  مانیتور زندهٔ جایگاه‌ها
                </span>
              </h1>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
                مشاهده هم‌زمان کلیه سفارش‌ها، جایگاه میزها، درصد پیشرفت پخت و تغییر وضعیت سریع
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher & Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode("master")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "master"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>نمای جامع میزها ({toPersianDigits(tickets.length)})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "kanban"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>کانبان مرحله‌ای</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("batch")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "batch"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>تجمیع منقل و بار</span>
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setAudioEnabled((enabled) => !enabled)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors",
              audioEnabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
            )}
            title={audioEnabled ? "صدای هشدار فعال است" : "صدای هشدار غیرفعال است"}
          >
            {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden sm:inline">{audioEnabled ? "هشدار صوتی: روشن" : "هشدار صوتی: خاموش"}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 text-xs font-bold text-slate-300 transition-colors hover:text-white hover:border-slate-700"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-amber-400")} />
            <span>بروزرسانی</span>
          </button>
        </div>
      </div>

      {/* Live Kitchen Alert Banner (Order Created / Edited / Added) */}
      {recentAlert && (
        <div className="p-3.5 rounded-2xl bg-amber-500/20 border-2 border-amber-500/50 text-amber-300 flex items-center justify-between gap-3 shadow-lg shadow-amber-500/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/30 text-amber-200">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <span className="font-extrabold text-xs sm:text-sm text-slate-50">
                هشدار زندهٔ تغییر در سفارشات سالن:
              </span>{" "}
              <span className="text-xs text-amber-200 font-semibold">{recentAlert.message}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-400 font-mono px-2 py-0.5 rounded bg-slate-900 border border-amber-500/30">
              {recentAlert.timestamp}
            </span>
            <button
              type="button"
              onClick={() => setRecentAlert(null)}
              className="text-xs text-amber-400 hover:text-white px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
            >
              ✕ بستن
            </button>
          </div>
        </div>
      )}

      {/* KPI Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/70 text-right">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>سفارش‌های فعال میزها</span>
            <UtensilsCrossed className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-black text-slate-100 mt-1">{toPersianDigits(tickets.length)} میز</div>
        </div>

        <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-right">
          <div className="text-[11px] text-blue-400 flex items-center justify-between">
            <span>در انتظار پخت (Pending)</span>
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black text-blue-300 mt-1">{toPersianDigits(totalPending)} قلم</div>
        </div>

        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-right">
          <div className="text-[11px] text-amber-400 flex items-center justify-between">
            <span>روی اجاق / آماده‌سازی</span>
            <Flame className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black text-amber-300 mt-1">{toPersianDigits(totalPreparing)} قلم</div>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-right">
          <div className="text-[11px] text-emerald-400 flex items-center justify-between">
            <span>آماده تحویل به سالن</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black text-emerald-300 mt-1">{toPersianDigits(totalReady)} قلم</div>
        </div>
      </div>

      {/* Empty State */}
      {tickets.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-16 text-center">
          <div className="space-y-3 max-w-sm">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-800 border border-slate-700">
              <ChefHat className="h-8 w-8 text-amber-400" />
            </span>
            <h3 className="font-bold text-base text-slate-200">همه سفارش‌ها آماده شده‌اند!</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              در حال حاضر هیچ سفارش بازی در آشپزخانه یا بار وجود ندارد. به محض ثبت سفارش توسط سالن‌داران با صدای هشدار به شما اطلاع داده خواهد شد.
            </p>
          </div>
        </div>
      ) : null}

      {/* ==================================================================== */}
      {/* VIEW 1: CHEF MASTER BOARD (All Orders & Tables Simultaneously)       */}
      {/* ==================================================================== */}
      {tickets.length > 0 && viewMode === "master" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {tickets.map((ticket) => {
            const elapsed = getElapsedMinutes(ticket.earliest);
            const isUrgent = elapsed >= 15;
            const isBatchBusy = batchActionOrderId === ticket.orderId;
            const isHighlighted = highlightOrderId === ticket.orderId;

            return (
              <article
                key={ticket.orderId}
                className={cn(
                  "overflow-hidden rounded-2xl border-2 bg-slate-900/95 flex flex-col justify-between transition-all shadow-md",
                  isHighlighted
                    ? "border-amber-400 ring-4 ring-amber-400/40 shadow-2xl shadow-amber-500/20 animate-pulse"
                    : isUrgent
                    ? "border-rose-500/50 shadow-rose-500/10"
                    : "border-slate-800 hover:border-slate-700"
                )}
              >
                {/* Ticket Header: Table Location + Timer + Stage */}
                <div>
                  <div className="p-4 border-b border-slate-800 bg-slate-950/60 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black text-slate-50 tracking-tight">
                            {ticket.tableNumber}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                            {ticket.branchName}
                          </span>
                          {isHighlighted && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center gap-1 animate-bounce">
                              <Bell className="w-3 h-3" />
                              <span>تغییر یافت!</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
                          <User className="h-3 w-3 text-slate-500" />
                          <span>گارسون: {ticket.waiterName}</span>
                        </div>
                      </div>

                      <div className="text-left">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
                            isUrgent
                              ? "border-rose-500/40 bg-rose-500/20 text-rose-300 animate-pulse"
                              : "border-slate-700 bg-slate-800 text-slate-300"
                          )}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          <span>{toPersianDigits(elapsed)} دقیقه</span>
                        </span>
                      </div>
                    </div>

                    {/* Order Stage Badge & Progress Bar */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-850">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("px-2 py-0.5 rounded-md border text-[11px] font-bold", ticket.stageColor)}>
                          {ticket.stageLabel}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold">
                          {toPersianDigits(ticket.readyCount)} از {toPersianDigits(ticket.totalCount)} آماده
                        </span>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                          style={{ width: `${ticket.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ticket Items List */}
                  <div className="p-4 space-y-2.5">
                    {ticket.items.map((item) => {
                      const isItemBusy = busyItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 hover:border-slate-750 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="grid h-7 min-w-7 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/15 px-1.5 text-xs font-black text-amber-300">
                                {toPersianDigits(item.quantity)}×
                              </span>
                              <span className="text-sm font-bold text-slate-100">
                                {item.menu_item_name}
                              </span>
                            </div>

                            {/* Item Status Mini Badge */}
                            <span
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-md font-semibold border",
                                item.status === "pending" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                item.status === "preparing" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                item.status === "ready" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              )}
                            >
                              {item.status === "pending" && "در صف"}
                              {item.status === "preparing" && "روی اجاق"}
                              {item.status === "ready" && "آماده ✓"}
                            </span>
                          </div>

                          {/* Customer notes */}
                          {item.notes && (
                            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs text-amber-300 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                              <span>یادداشت مشتری: {item.notes}</span>
                            </div>
                          )}

                          {/* Item Action Button */}
                          {item.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item, "preparing")}
                              disabled={isItemBusy}
                              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 shadow-sm transition-colors disabled:opacity-50"
                            >
                              {isItemBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Flame className="h-3.5 w-3.5" />
                              )}
                              <span>شروع پخت</span>
                            </button>
                          )}

                          {item.status === "preparing" && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item, "ready")}
                              disabled={isItemBusy}
                              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-sm transition-colors disabled:opacity-50"
                            >
                              {isItemBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              <span>اعلام آماده تحویل به سالن</span>
                            </button>
                          )}

                          {item.status === "ready" && (
                            <div className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-300">
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>تحویل به سالن‌دار ✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ticket Footer: Batch Actions for Entire Order */}
                <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-1.5">
                  {ticket.pendingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBatchAdvanceOrder(ticket, "preparing")}
                      disabled={isBatchBusy}
                      className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-amber-400 hover:text-amber-300 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {isBatchBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
                      <span>شروع پخت همه اقلام این میز ({toPersianDigits(ticket.pendingCount)})</span>
                    </button>
                  )}

                  {ticket.preparingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBatchAdvanceOrder(ticket, "ready")}
                      disabled={isBatchBusy}
                      className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 hover:text-emerald-300 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {isBatchBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>آماده‌سازی کامل همه اقلام ({toPersianDigits(ticket.preparingCount)})</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: KITCHEN KANBAN STAGES (3 Columns Workflow)                  */}
      {/* ==================================================================== */}
      {tickets.length > 0 && viewMode === "kanban" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Column 1: Pending */}
          <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="font-extrabold text-sm text-slate-100">در انتظار پخت (Pending)</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold">
                {toPersianDigits(totalPending)}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              {items.filter((i) => i.status === "pending").length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">هیچ آیتمی در صف انتظار پخت نیست.</div>
              ) : (
                items
                  .filter((i) => i.status === "pending")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-amber-400">{item.table_number}</span>
                        <span className="text-[10px] text-slate-400">
                          {toPersianDigits(getElapsedMinutes(item.created_at))} دقیقه پیش
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                          {toPersianDigits(item.quantity)}×
                        </span>
                        <span className="text-sm font-bold text-slate-100">{item.menu_item_name}</span>
                      </div>

                      {item.notes && (
                        <div className="text-[11px] p-1.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {item.notes}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStatusChange(item, "preparing")}
                        disabled={busyItemId === item.id}
                        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
                      >
                        {busyItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
                        <span>شروع پخت و انتقال به اجاق</span>
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Column 2: Preparing */}
          <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-sm text-slate-100">روی اجاق و آماده‌سازی (Preparing)</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">
                {toPersianDigits(totalPreparing)}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              {items.filter((i) => i.status === "preparing").length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">هیچ غذایی هم‌اکنون روی اجاق نیست.</div>
              ) : (
                items
                  .filter((i) => i.status === "preparing")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-amber-400">{item.table_number}</span>
                        <span className="text-[10px] text-slate-400">
                          {toPersianDigits(getElapsedMinutes(item.created_at))} دقیقه پیش
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                          {toPersianDigits(item.quantity)}×
                        </span>
                        <span className="text-sm font-bold text-slate-100">{item.menu_item_name}</span>
                      </div>

                      {item.notes && (
                        <div className="text-[11px] p-1.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {item.notes}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStatusChange(item, "ready")}
                        disabled={busyItemId === item.id}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                      >
                        {busyItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>آماده تحویل به سالن‌دار</span>
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Column 3: Ready */}
          <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-sm text-slate-100">آماده تحویل به سالن (Ready)</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                {toPersianDigits(totalReady)}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              {items.filter((i) => i.status === "ready").length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">هیچ آیتم آماده‌ای در انتظار تحویل نیست.</div>
              ) : (
                items
                  .filter((i) => i.status === "ready")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-emerald-400">{item.table_number}</span>
                        <span className="text-[10px] text-slate-400">
                          {toPersianDigits(getElapsedMinutes(item.created_at))} دقیقه پیش
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          {toPersianDigits(item.quantity)}×
                        </span>
                        <span className="text-sm font-bold text-slate-100">{item.menu_item_name}</span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-emerald-400 pt-1">
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>آماده سرو روی میز</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 3: BATCH EXPEDITOR VIEW (Aggregated items across all tables)    */}
      {/* ==================================================================== */}
      {tickets.length > 0 && viewMode === "batch" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>نمای تجمیعی منقل و بار — نیاز پخت کل رستوران</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                تعداد کل پرس‌های مورد نیاز برای پخت هم‌زمان بدون نیاز به تفکیک میز به میز
              </p>
            </div>
            <span className="text-xs text-amber-400 font-bold">
              {toPersianDigits(batchSummaries.length)} قلم مجزا در جریان پخت
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batchSummaries.map((summary) => (
              <div
                key={summary.menuItemId}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-100">{summary.menuItemName}</h3>
                    <span className="text-[11px] text-slate-400">{summary.category}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-2xl font-black text-amber-400">
                      {toPersianDigits(summary.totalQuantity)}
                    </span>
                    <span className="text-xs text-slate-400 mr-1">پرس</span>
                  </div>
                </div>

                {/* Sub status counts */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <span className="block text-[10px] text-blue-400">در صف</span>
                    <span className="font-black text-blue-300">{toPersianDigits(summary.pendingQuantity)}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="block text-[10px] text-amber-400">روی اجاق</span>
                    <span className="font-black text-amber-300">{toPersianDigits(summary.preparingQuantity)}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="block text-[10px] text-emerald-400">آماده تحویل</span>
                    <span className="font-black text-emerald-300">{toPersianDigits(summary.readyQuantity)}</span>
                  </div>
                </div>

                {/* Tables breakdown */}
                <div className="space-y-1.5 pt-2 border-t border-slate-850">
                  <div className="text-[11px] text-slate-400 font-semibold">تفکیک بر حسب میزها:</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {summary.tables.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-950/60"
                      >
                        <span className="text-slate-200 font-bold">{t.tableNumber}</span>
                        <div className="flex items-center gap-2">
                          {t.notes && (
                            <span className="text-[10px] text-amber-400 truncate max-w-[120px]">
                              ({t.notes})
                            </span>
                          )}
                          <span className="font-black text-amber-300">{toPersianDigits(t.quantity)} پرس</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
