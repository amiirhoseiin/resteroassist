"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { addItemToOrder, parseVoiceNoteAction } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import { formatToman, toPersianDigits, translateServerError } from "@/lib/utils";
import type { ParsedOrderItem } from "@/lib/ai-parser";

interface AiScratchpadProps {
  orderId: string | null;
  tableNumber: string | null;
  menuItemMap: Record<string, { name: string; price_toman: number }>;
  onItemsAdded: () => void;
}

const SAMPLE_PROMPTS = [
  "دو تا کباب لقمه با کره اضافه و یه دوغ بدون نعنا",
  "یه ته‌چین مرغ بدون بادمجان برای حساسیت",
  "۳ تا چای و باقلوای قزوین تازه‌دم",
];

export function AiScratchpad({
  orderId,
  tableNumber,
  menuItemMap,
  onItemsAdded,
}: AiScratchpadProps) {
  const { showToast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedOrderItem[] | null>(null);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleParse = async () => {
    if (!orderId) {
      showToast("warning", "برای ثبت سریع سفارش، ابتدا یک میز را از فهرست بالا انتخاب کنید.");
      return;
    }
    if (!noteText.trim()) return;

    setIsProcessing(true);
    try {
      const res = await parseVoiceNoteAction(orderId, noteText);

      if (res.success && res.data && res.data.items.length > 0) {
        setParsedItems(res.data.items);
        setSourceUsed(res.source ?? null);
        if (res.source === "heuristic") {
          showToast("info", "پردازش نقشهٔ سفارش با موتور محلی پشتیبان انجام شد.");
        }
      } else {
        showToast(
          "error",
          "دستیار هوشمند موقتاً در دسترس نیست. لطفاً آیتم‌ها را از منوی دستی انتخاب کنید."
        );
      }
    } catch {
      showToast(
        "error",
        "دستیار هوشمند موقتاً در دسترس نیست. لطفاً آیتم‌ها را از منوی دستی انتخاب کنید."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsedItems || parsedItems.length === 0 || !orderId) return;
    setIsAdding(true);

    let hasError = false;
    for (const item of parsedItems) {
      const res = await addItemToOrder({
        orderId,
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        notes: item.notes ?? null,
      });
      if (!res.success) {
        hasError = true;
        showToast("error", translateServerError(res.error));
        break;
      }
    }

    setIsAdding(false);

    if (!hasError) {
      showToast("success", "آیتم‌های شناسایی‌شده در سفارش میز ثبت شدند.");
      setParsedItems(null);
      setNoteText("");
      onItemsAdded();
    }
  };

  return (
    <>
      <section className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-slate-800">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <span>ثبت سریع سفارش با هوش مصنوعی</span>
          </h2>
          <span className="text-[11px] font-medium text-indigo-500/90">
            {tableNumber
              ? `مقصد ثبت: ${tableNumber}`
              : "برای شروع، ابتدا یک میز را انتخاب کنید"}
          </span>
        </div>

        <textarea
          value={noteText}
          maxLength={300}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="مثلاً بنویسید: دو تا کباب لقمه، یه دوغ بدون نعنا و یه ته‌چین برای میز ۴..."
          className="h-24 w-full resize-none rounded-xl border border-indigo-200 bg-white p-3.5 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">نمونه:</span>
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setNoteText(prompt)}
                className="min-h-9 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-slate-400">
              {toPersianDigits(noteText.length)} از ۳۰۰
            </span>
            <button
              type="button"
              disabled={isProcessing || !noteText.trim() || !orderId}
              onClick={handleParse}
              className="flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>{isProcessing ? "در حال تبدیل..." : "تبدیل به آیتم‌های منو"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* پنجرهٔ پیش‌نمایش آیتم‌های شناسایی‌شده */}
      {parsedItems && parsedItems.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-800">
                پیش‌نمایش آیتم‌های شناسایی‌شده (تأیید سالن‌دار)
              </h3>
              <button
                type="button"
                onClick={() => setParsedItems(null)}
                disabled={isAdding}
                aria-label="بستن پیش‌نمایش"
                className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[45vh] space-y-3 overflow-y-auto p-5">
              {parsedItems.map((item, index) => {
                const menuInfo = menuItemMap[item.menu_item_id];
                return (
                  <div key={index} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {menuInfo?.name || "آیتم منو"}
                      </span>
                      <span className="text-xs font-bold text-indigo-600">
                        {toPersianDigits(item.quantity)} عدد
                      </span>
                    </div>
                    {item.notes && (
                      <div className="mt-2 inline-block rounded-md border border-amber-200 bg-amber-100/80 px-2 py-0.5 text-[11px] text-amber-700">
                        یادداشت: {item.notes}
                      </div>
                    )}
                    <div className="mt-2 text-[11px] text-slate-400">
                      قیمت واحد از منو: {formatToman(menuInfo?.price_toman ?? 0)}
                    </div>
                  </div>
                );
              })}

              <div className="text-[11px] text-slate-400">
                منبع تحلیل:{" "}
                {sourceUsed === "openrouter" ? "دستیار هوشمند ابری" : "موتور محلی پشتیبان"}
              </div>
            </div>

            <div className="flex items-stretch gap-2.5 border-t border-slate-200 bg-slate-50/70 px-5 py-4">
              <button
                type="button"
                disabled={isAdding}
                onClick={handleConfirm}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500 disabled:opacity-50"
              >
                {isAdding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>{isAdding ? "در حال ثبت..." : "تأیید و ثبت در سفارش میز"}</span>
              </button>
              <button
                type="button"
                disabled={isAdding}
                onClick={() => setParsedItems(null)}
                className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
