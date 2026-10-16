"use client";

import { useState } from "react";
import PosPage from "@/app/(dashboard)/pos/page";
import KdsPage from "@/app/(dashboard)/kds/page";
import CashierPage from "@/app/(dashboard)/cashier/page";
import { SplitSquareVertical, UtensilsCrossed, ChefHat, Receipt } from "lucide-react";

export default function DemoSplitPage() {
  const [leftTab, setLeftTab] = useState<"pos" | "cashier">("pos");

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-65px)] overflow-hidden">
      {/* Subheader info for demo presentation */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <SplitSquareVertical className="w-4 h-4 text-brand-400" />
          <span className="font-bold text-slate-200">
            نمایش دوگانه همزمان عملیات شیفت (مناسب برای ضبط ویدیو و بررسی گردش کار زنده)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">پنل سمت راست:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setLeftTab("pos")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                leftTab === "pos" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              سفارش‌گیر سالن (Waiter)
            </button>
            <button
              type="button"
              onClick={() => setLeftTab("cashier")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                leftTab === "cashier" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              صندوق و مالی (Cashier)
            </button>
          </div>
        </div>
      </div>

      {/* Two Panes Side by Side */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-800 overflow-hidden">
        {/* Left Pane: Waiter POS or Cashier */}
        <div className="h-full overflow-y-auto bg-slate-950/70 p-2">
          {leftTab === "pos" ? <PosPage /> : <CashierPage />}
        </div>

        {/* Right Pane: Kitchen Display System (KDS) */}
        <div className="h-full overflow-y-auto bg-slate-950/90 p-2">
          <KdsPage />
        </div>
      </div>
    </div>
  );
}
