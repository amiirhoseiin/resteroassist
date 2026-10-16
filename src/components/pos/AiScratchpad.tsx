"use client";

import { useState } from "react";
import { Mic, Sparkles, Send, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { parseVoiceNoteAction, addItemToOrder } from "@/actions/order-actions";
import type { ParsedOrderItem } from "@/lib/ai-parser";

interface AiScratchpadProps {
  orderId: string;
  menuItemMap: Record<string, { name: string; price_toman: number }>;
  onItemsAdded: () => void;
}

const SAMPLE_PROMPTS = [
  "۲ تا کباب لقمه زعفرانی با کره اضافه و ۲ تا دوغ محلی",
  "یه ته‌چین مرغ و بادمجان بدون بادمجان برای حساسیت",
  "۳ تا چای و باقلوای قزوین تازه‌دم",
  "یک قیمه نثار با خلال پسته فراوان و یه شربت بیدمشک",
];

export function AiScratchpad({ orderId, menuItemMap, onItemsAdded }: AiScratchpadProps) {
  const [noteText, setNoteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedOrderItem[] | null>(null);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleParse = async () => {
    if (!noteText.trim()) return;
    setIsProcessing(true);
    setFeedback(null);
    setParsedItems(null);

    try {
      const res = await parseVoiceNoteAction(orderId, noteText);
      if (res.success && res.data && res.data.items.length > 0) {
        setParsedItems(res.data.items);
        setSourceUsed(res.source);
        if (res.source === "heuristic") {
          setFeedback({
            type: "info",
            msg: "پردازش با موتور محلی پشتیبان فارسی انجام شد (پایدار در شرایط عدم دسترسی اینترنت بین‌الملل).",
          });
        }
      } else {

        setFeedback({
          type: "error",
          msg: res.error || "آیتمی از متن تشخیص داده نشد. لطفاً از منو دستی انتخاب کنید.",
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "خطا در برقراری ارتباط با دستیار صوتی",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAndAdd = async () => {
    if (!parsedItems || parsedItems.length === 0) return;
    setIsAdding(true);

    try {
      for (const item of parsedItems) {
        await addItemToOrder({
          orderId,
          menuItemId: item.menu_item_id,
          quantity: item.quantity,
          notes: item.notes,
        });
      }

      setFeedback({
        type: "success",
        msg: "همه آیتم‌های یادداشت هوشمند با موفقیت به سفارش افزوده شدند.",
      });
      setParsedItems(null);
      setNoteText("");
      onItemsAdded();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : "خطا در افزودن برخی آیتم‌ها",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-200">
            دفترچه یادداشت هوشمند گارسون (هوش مصنوعی فارسی)
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          حداکثر ۳۰۰ کاراکتر • قیمت‌گذاری Zero-Trust از دیتابیس
        </span>
      </div>

      {/* Persian Input Box */}
      <div className="relative">
        <textarea
          value={noteText}
          maxLength={300}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="متن عامیانه یا صوت دیکته شده گارسون را اینجا بنویسید (مثال: ۲ تا لاته یکی کم‌شیر با یه چیزکیک)..."
          className="w-full h-20 p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
        />
        <div className="absolute left-2.5 bottom-2.5 flex items-center gap-1.5 text-xs">
          <span className="text-[10px] text-slate-500">{noteText.length}/300</span>
          <button
            type="button"
            disabled={isProcessing || !noteText.trim()}
            onClick={handleParse}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium text-xs shadow-md shadow-brand-500/20 disabled:opacity-50 transition-all"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال تبدیل...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>استخراج ساختار یافته</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sample Quick Chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-slate-500">پیش‌نمونه‌های تست:</span>
        {SAMPLE_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setNoteText(prompt)}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
            feedback.type === "error"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              : feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Parsed Items Preview */}
      {parsedItems && parsedItems.length > 0 && (
        <div className="bg-slate-950/80 border border-brand-500/30 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-brand-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              آیتم‌های استخراج شده ({parsedItems.length} ردیف)
            </span>
            <span className="text-[10px] text-slate-400">
              منبع پردازش: {sourceUsed === "openrouter" ? "OpenRouter (Gemini 2.5 Flash)" : "موتور محلی فال‌بک"}
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {parsedItems.map((item, idx) => {
              const menuInfo = menuItemMap[item.menu_item_id];
              return (
                <div key={idx} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-200">
                      {menuInfo?.name || "آیتم منو"}
                    </span>
                    <span className="mr-2 text-brand-400 font-medium">
                      × {item.quantity} عدد
                    </span>
                    {item.notes && (
                      <span className="mr-2 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                        یادداشت: {item.notes}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400">
                    قیمت واحد امن: {(menuInfo?.price_toman || 0).toLocaleString("fa-IR")} تومان
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={isAdding}
            onClick={handleConfirmAndAdd}
            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
          >
            {isAdding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال درج مستقل در پایگاه داده...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>تایید نهایی و ثبت در سفارش میز</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
