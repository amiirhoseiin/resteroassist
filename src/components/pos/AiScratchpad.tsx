"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Info,
  Loader2,
  Mic,
  MicOff,
  Minus,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { addItemToOrder, parseVoiceNoteAction } from "@/actions/order-actions";
import { useToast } from "@/components/ui/ToastProvider";
import { formatToman, toPersianDigits, translateServerError } from "@/lib/utils";
import type { ParsedOrderItem } from "@/lib/ai-parser";

interface AiScratchpadProps {
  orderId: string | null;
  tableNumber: string | null;
  menuItemMap: Record<string, { name: string; price_toman: number }>;
  menuItems?: Array<{ id: string; name: string; category: string }>;
  onItemsAdded: () => void;
}

interface DraftItem {
  menu_item_id: string;
  quantity: number;
  notes: string | null;
  confidence?: "high" | "medium" | "low";
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const SAMPLE_PROMPTS = [
  "دو تا کباب لقمه با کره اضافه و یه دوغ بدون نعنا",
  "یه ته‌چین مرغ بدون بادمجان برای حساسیت",
  "۳ تا چای و باقلوای قزوین تازه‌دم",
];

const CONFIDENCE_BADGES: Record<string, { label: string; className: string }> = {
  high: { label: "مطمئن", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
  medium: { label: "حدودی", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" },
  low: { label: "نامطمئن", className: "border-rose-500/25 bg-rose-500/10 text-rose-300" },
};

const FA_TO_EN_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** فقط ارقام یک رشته را برمی‌گرداند (فارسی/عربی → لاتین) */
function digitsOnly(value: string): string {
  return value
    .replace(/[۰-۹٠-٩]/g, (digit) => FA_TO_EN_DIGITS[digit] ?? digit)
    .replace(/\D/g, "");
}

export function AiScratchpad({
  orderId,
  tableNumber,
  menuItemMap,
  menuItems,
  onItemsAdded,
}: AiScratchpadProps) {
  const { showToast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [unmatchedText, setUnmatchedText] = useState<string | null>(null);
  const [tableHint, setTableHint] = useState<string | null>(null);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [swapQuery, setSwapQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const menuOptions = useMemo(() => {
    if (menuItems && menuItems.length > 0) {
      return menuItems.map((item) => ({ id: item.id, name: item.name, category: item.category }));
    }
    return Object.entries(menuItemMap).map(([id, value]) => ({
      id,
      name: value.name,
      category: "",
    }));
  }, [menuItems, menuItemMap]);

  const filteredOptions = useMemo(() => {
    const query = swapQuery.trim();
    if (!query) return menuOptions.slice(0, 40);
    return menuOptions.filter((option) => option.name.includes(query)).slice(0, 40);
  }, [menuOptions, swapQuery]);

  const draftCount = draftItems.reduce((sum, item) => sum + item.quantity, 0);
  const draftTotal = draftItems.reduce(
    (sum, item) => sum + (menuItemMap[item.menu_item_id]?.price_toman ?? 0) * item.quantity,
    0
  );

  const tableMismatch = useMemo(() => {
    if (!tableHint || !tableNumber) return false;
    const currentDigits = digitsOnly(tableNumber);
    return currentDigits.length > 0 && currentDigits !== tableHint;
  }, [tableHint, tableNumber]);

  const closePreview = () => {
    setIsPreviewOpen(false);
    setDraftItems([]);
    setUnmatchedText(null);
    setTableHint(null);
    setSwapIndex(null);
  };

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
        setDraftItems(
          res.data.items.map((item: ParsedOrderItem) => ({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            notes: item.notes ?? null,
            confidence: item.confidence,
          }))
        );
        setUnmatchedText(res.data.unmatched_text ?? null);
        setTableHint(res.data.table_number ?? null);
        setSourceUsed(res.source ?? null);
        setSwapIndex(null);
        setSwapQuery("");
        setIsPreviewOpen(true);
        if (res.source === "heuristic") {
          showToast("info", "پردازش یادداشت سفارش با موتور هوشمند محلی (آفلاین) انجام شد.");
        }
      } else {
        showToast(
          "error",
          res.error ||
            "در یادداشت شما آیتمی شناسایی نشد؛ لطفاً اقلام را از منوی دستی انتخاب کنید."
        );
      }
    } catch {
      showToast(
        "error",
        "ارتباط با دستیار هوشمند برقرار نشد؛ لطفاً اقلام را از منوی دستی انتخاب کنید."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      showToast("warning", "ضبط صوتی در این مرورگر پشتیبانی نمی‌شود؛ لطفاً یادداشت را تایپ کنید.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "fa-IR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) transcript += result[0].transcript;
      }
      if (transcript.trim()) {
        setNoteText((prev) =>
          `${prev} ${transcript}`.replace(/\s+/g, " ").trim().slice(0, 300)
        );
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      showToast("error", "ضبط صوتی با خطا مواجه شد؛ لطفاً دوباره تلاش کنید.");
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const updateDraftItem = (index: number, patch: Partial<DraftItem>) => {
    setDraftItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeDraftItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
    setSwapIndex(null);
  };

  const stepQuantity = (index: number, delta: number) => {
    setDraftItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, quantity: Math.min(50, Math.max(1, item.quantity + delta)) }
          : item
      )
    );
  };

  const handleConfirm = async () => {
    if (!orderId || draftItems.length === 0) return;
    setIsAdding(true);
    const itemsToSend = [...draftItems];

    let addedCount = 0;
    for (const item of itemsToSend) {
      const res = await addItemToOrder({
        orderId,
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        notes: item.notes?.trim() ? item.notes.trim() : null,
      });
      if (!res.success) {
        showToast("error", translateServerError(res.error));
        break;
      }
      addedCount++;
    }

    setIsAdding(false);

    if (addedCount === 0) return;

    if (addedCount === itemsToSend.length) {
      showToast(
        "success",
        `${toPersianDigits(addedCount)} قلم از یادداشت هوشمند در سفارش میز ثبت شد.`
      );
      closePreview();
      setNoteText("");
    } else {
      showToast(
        "warning",
        `${toPersianDigits(addedCount)} قلم ثبت شد؛ ثبت بقیهٔ اقلام کامل نشد، لطفاً دوباره تأیید کنید.`
      );
      setDraftItems((prev) => prev.slice(addedCount));
    }
    onItemsAdded();
  };

  return (
    <>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                <span>ثبت سریع سفارش با هوش مصنوعی</span>
              </h2>
              <span className="text-[11px] text-slate-400">
                {tableNumber ? `مقصد ثبت: ${tableNumber}` : "ابتدا میز را انتخاب کنید"}
              </span>
            </div>
          </div>

          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
            تبدیل یادداشت محاوره‌ای به اقلام منو
          </span>
        </div>

        <textarea
          value={noteText}
          maxLength={300}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="مثلاً بنویسید: دو تا کباب لقمه یکی کم‌روغن با یه دوغ بدون نعنا و یه ته‌چین مرغ..."
          className="h-20 w-full resize-none rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-100 placeholder-slate-500 transition-colors focus:border-purple-500 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500 text-[10px]">پیشنهاد:</span>
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setNoteText(prompt)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[10px] text-slate-500 font-mono">
              {toPersianDigits(noteText.length)}/۳۰۰
            </span>
            <button
              type="button"
              onClick={toggleVoice}
              disabled={isProcessing || !orderId}
              title={isListening ? "توقف ضبط صوتی" : "ضبط صوتی یادداشت (فارسی)"}
              aria-label={isListening ? "توقف ضبط صوتی" : "ضبط صوتی یادداشت"}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all disabled:opacity-40 ${
                isListening
                  ? "animate-pulse border-rose-500/40 bg-rose-500/15 text-rose-300"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              disabled={isProcessing || !noteText.trim() || !orderId}
              onClick={handleParse}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all hover:bg-purple-500 disabled:opacity-40"
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{isProcessing ? "در حال پردازش..." : "شناسایی هوشمند اقلام"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Preview Dialog */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            data-testid="ai-preview-modal"
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>اقلام شناسایی‌شده برای تأیید سالن‌دار</span>
              </h3>
              <button
                type="button"
                onClick={closePreview}
                disabled={isAdding}
                aria-label="بستن پیش‌نمایش"
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[55vh] space-y-2.5 overflow-y-auto p-5">
              {draftItems.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-500">
                  همهٔ اقلام حذف شدند؛ برای ثبت، یادداشت را دوباره تحلیل کنید یا از منوی دستی
                  اضافه کنید.
                </p>
              ) : (
                draftItems.map((item, index) => {
                  const menuInfo = menuItemMap[item.menu_item_id];
                  const badge = item.confidence ? CONFIDENCE_BADGES[item.confidence] : null;
                  const isSwapping = swapIndex === index;
                  return (
                    <div
                      key={index}
                      data-testid="ai-preview-item"
                      className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">
                            {menuInfo?.name || "آیتم منو"}
                          </span>
                          {badge && (
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">تعداد:</span>
                          <button
                            type="button"
                            aria-label="کاهش تعداد"
                            disabled={isAdding || item.quantity <= 1}
                            onClick={() => stepQuantity(index, -1)}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span
                            data-testid="ai-qty"
                            className="min-w-[3.5rem] text-center text-xs font-black text-amber-400"
                          >
                            {toPersianDigits(item.quantity)} پرس
                          </span>
                          <button
                            type="button"
                            aria-label="افزایش تعداد"
                            disabled={isAdding || item.quantity >= 50}
                            onClick={() => stepQuantity(index, 1)}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <input
                          data-testid="ai-note"
                          value={item.notes ?? ""}
                          maxLength={200}
                          disabled={isAdding}
                          onChange={(event) =>
                            updateDraftItem(index, { notes: event.target.value })
                          }
                          placeholder="یادداشت برای آشپزخانه (مثلاً بدون نعنا)"
                          className="h-8 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-[11px] text-slate-100 placeholder-slate-500 transition-colors focus:border-purple-500 focus:outline-none disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={isAdding}
                          onClick={() => {
                            setSwapIndex(isSwapping ? null : index);
                            setSwapQuery("");
                          }}
                          className="h-8 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
                        >
                          تغییر آیتم
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDraftItem(index)}
                          disabled={isAdding}
                          aria-label="حذف این قلم"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {isSwapping && (
                        <div className="mt-2 rounded-xl border border-purple-500/25 bg-slate-950 p-2">
                          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2">
                            <Search className="h-3.5 w-3.5 text-slate-500" />
                            <input
                              autoFocus
                              value={swapQuery}
                              onChange={(event) => setSwapQuery(event.target.value)}
                              placeholder="جستجوی آیتم…"
                              className="h-8 flex-1 bg-transparent text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none"
                            />
                          </div>
                          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                            {filteredOptions.length === 0 && (
                              <p className="p-2 text-[10px] text-slate-500">آیتمی یافت نشد.</p>
                            )}
                            {filteredOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  updateDraftItem(index, {
                                    menu_item_id: option.id,
                                    confidence: "high",
                                  });
                                  setSwapIndex(null);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right text-[11px] text-slate-300 transition-colors hover:bg-slate-800"
                              >
                                <span>{option.name}</span>
                                <span className="text-[10px] text-slate-500">
                                  {option.category}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-1.5 text-[11px] text-slate-400">
                        قیمت واحد: {formatToman(menuInfo?.price_toman ?? 0)}
                      </div>
                    </div>
                  );
                })
              )}

              {unmatchedText && (
                <div
                  data-testid="ai-unmatched"
                  className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[11px] text-amber-300"
                >
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <span className="font-bold">این بخش از یادداشت شناسایی نشد:</span>{" "}
                    <span>«{unmatchedText}»</span>
                    <p className="mt-1 text-[10px] text-amber-300/80">
                      می‌توانید آن را از منوی دستی همین صفحه اضافه کنید.
                    </p>
                  </div>
                </div>
              )}

              {tableMismatch && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-[11px] text-rose-300">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    در یادداشت به «میز {toPersianDigits(tableHint ?? "")}» اشاره شده اما سفارش
                    فعلی روی {tableNumber} است؛ پیش از تأیید مطمئن شوید.
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                <span>
                  منبع پردازش:{" "}
                  {sourceUsed === "openrouter"
                    ? "مدل زبانی هوش مصنوعی ابری (Google Gemini Flash)"
                    : "موتور هوشمند محلی (آفلاین)"}
                </span>
                {draftItems.length > 0 && (
                  <span className="text-slate-400">
                    {toPersianDigits(draftCount)} قلم — جمع:{" "}
                    <span className="font-bold text-amber-400">{formatToman(draftTotal)}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/50 px-5 py-4">
              <button
                type="button"
                disabled={isAdding}
                onClick={closePreview}
                className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isAdding || draftItems.length === 0}
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 text-xs font-black shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isAdding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>{isAdding ? "در حال ثبت اقلام..." : "تأیید و ثبت در سفارش میز"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
