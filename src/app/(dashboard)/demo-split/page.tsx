"use client";

import { useState } from "react";
import PosPage from "@/app/(dashboard)/pos/page";
import KdsPage from "@/app/(dashboard)/kds/page";
import CashierPage from "@/app/(dashboard)/cashier/page";
import { SplitSquareVertical, UtensilsCrossed, ChefHat, Receipt } from "lucide-react";

export default function DemoSplitPage() {
  const [leftTab, setLeftTab] = useState<"pos" | "cashier">("pos");

  return (
    <div className="flex h-[calc(100vh-3.8rem)] flex-1 flex-col overflow-hidden">
      {/* نوار اطلاعات نمایش دوگانه */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <SplitSquareVertical className="h-4 w-4 text-brand-400" />
          <span className="font-bold text-slate-200">
            نمایش همزمان سالن و آشپزخانه (مناسب برای بررسی گردش کار زنده)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">نمای پنل کناری:</span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setLeftTab("pos")}
              className={`flex h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition-colors ${
                leftTab === "pos"
                  ? "bg-brand-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
              <span>ثبت سفارش سالن</span>
            </button>
            <button
              type="button"
              onClick={() => setLeftTab("cashier")}
              className={`flex h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition-colors ${
                leftTab === "cashier"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>صندوق و تسویه</span>
            </button>
          </div>
        </div>
      </div>

      {/* دو پنل کنار هم */}
      <div className="grid flex-1 grid-cols-1 divide-y divide-slate-800 overflow-hidden lg:grid-cols-2 lg:divide-x lg:divide-x-reverse lg:divide-y-0">
        {/* پنل اول: سالن یا صندوق */}
        <div className="h-full overflow-y-auto bg-slate-950/70 p-2">
          {leftTab === "pos" ? <PosPage /> : <CashierPage />}
        </div>

        {/* پنل دوم: مانیتور آشپزخانه */}
        <div className="flex h-full flex-col overflow-y-auto bg-slate-950/90 p-2">
          <div className="px-2 pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-bold text-slate-300">
              <ChefHat className="h-3.5 w-3.5 text-amber-400" />
              <span>مانیتور آشپزخانه</span>
            </span>
          </div>
          <KdsPage />
        </div>
      </div>
    </div>
  );
}
