import { z } from "zod";
import { logAuditEvent } from "./logger";

// Zod schema for structured output validation
export const ParsedOrderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
  notes: z.string().max(200).nullable().optional(),
});

export const ParsedOrderResponseSchema = z.object({
  items: z.array(ParsedOrderItemSchema),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  unmatched_text: z.string().optional(),
});

export type ParsedOrderItem = z.infer<typeof ParsedOrderItemSchema>;
export type ParsedOrderResponse = z.infer<typeof ParsedOrderResponseSchema>;

export interface MenuItemRef {
  id: string;
  name: string;
  category: string;
}

/**
 * Intelligent local Persian keyword extractor as emergency fallback
 * when OpenRouter / external network is unavailable or timed out.
 */
function localPersianMenuMatcher(
  persianText: string,
  menuItems: MenuItemRef[]
): ParsedOrderItem[] {
  const normalized = persianText
    .toLowerCase()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک");

  const results: ParsedOrderItem[] = [];
  const wordsToNumbers: Record<string, number> = {
    "یک": 1,
    "یه": 1,
    "۱": 1,
    "1": 1,
    "دو": 2,
    "۲": 2,
    "2": 2,
    "سه": 3,
    "۳": 3,
    "3": 3,
    "چهار": 4,
    "۴": 4,
    "4": 4,
    "پنج": 5,
    "۵": 5,
    "5": 5,
    "شش": 6,
    "۶": 6,
    "6": 6,
  };

  for (const item of menuItems) {
    const itemNameNorm = item.name
      .toLowerCase()
      .replace(/[ي]/g, "ی")
      .replace(/[ك]/g, "ک");

    // Check if key words of menu item appear in text
    const keyWords = itemNameNorm.split(" ").filter((w) => w.length > 2);
    const matches = keyWords.filter((w) => normalized.includes(w));

    if (matches.length >= Math.min(2, keyWords.length)) {
      // Find quantity preceding this match
      let quantity = 1;
      const index = normalized.indexOf(matches[0]);
      const prefix = normalized.substring(Math.max(0, index - 25), index);

      for (const [word, num] of Object.entries(wordsToNumbers)) {
        if (prefix.includes(word)) {
          quantity = num;
          break;
        }
      }

      // Check for common notes
      let notes: string | null = null;
      if (normalized.includes("کم شیر") || normalized.includes("کم‌شیر")) {
        notes = "کم‌شیر";
      } else if (normalized.includes("بدون شکر")) {
        notes = "بدون شکر";
      } else if (normalized.includes("کره اضافه")) {
        notes = "کره اضافه";
      } else if (normalized.includes("بدون نعنا") || normalized.includes("بدون نعناع")) {
        notes = "بدون نعناع";
      } else if (normalized.includes("بدون بادمجان")) {
        notes = "بدون بادمجان";
      } else if (normalized.includes("یخ زیاد")) {
        notes = "لیوان با یخ زیاد";
      }

      results.push({
        menu_item_id: item.id,
        quantity,
        notes,
      });
    }
  }

  return results;
}

/**
 * Main AI Scratchpad parser:
 * Calls OpenRouter (Gemini 2.5 Flash), enforces 300 char input, 4s timeout,
 * validates via Zod, and falls back gracefully.
 */
export async function parsePersianOrderNote(
  inputRaw: string,
  menuItems: MenuItemRef[],
  restaurantId: string,
  actorId?: string
): Promise<{ success: boolean; data?: ParsedOrderResponse; error?: string; source: "openrouter" | "heuristic" | "error" }> {
  const startTime = Date.now();

  // Guard 1: Sanitize and limit input length to 300 characters
  const sanitizedInput = inputRaw.trim().slice(0, 300);

  if (!sanitizedInput) {
    return {
      success: false,
      error: "متن سفارش خالی است.",
      source: "error",
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.AI_MODEL || "google/gemini-2.5-flash";

  // If OpenRouter API key is provided, attempt AI parsing with 4s hard timeout
  if (apiKey && apiKey !== "sk-or-v1-your-key-here") {
    try {
      const menuCatalogPrompt = menuItems
        .map((m) => `- ID: "${m.id}", نام: "${m.name}", دسته‌بندی: "${m.category}"`)
        .join("\n");

      const systemPrompt = `شما دستیار ثبت سفارش رستوران در ایران هستید.
وظیفه شما تبدیل یادداشت محاوره‌ای و عامیانه گارسون به ساختار داده JSON است.
قوانین اکید:
۱. فقط و فقط از منوی ارائه شده آیتم‌ها را استخراج کن. هرگز آیتمی خارج از منو اضافه نکن.
۲. قیمت به هیچ عنوان توسط شما تعیین نمی‌شود.
۳. خروجی باید یک JSON معتبر باشد:
{
  "items": [
    {
      "menu_item_id": "UUID_STRING",
      "quantity": NUMBER,
      "notes": "STRING_OR_NULL"
    }
  ]
}
۴. به فارسی عامیانه مسلط باش (مثلا "۲ تا لاته یکی کم‌شیر با چیزکیک").
۵. هیچ متن اضافه، هیچ تگ Markdown و هیچ توضیحی نده. فقط JSON خالص.`;

      const userDelimitedMessage = `<<<MENU_CATALOG>>>
${menuCatalogPrompt}
<<<END_MENU_CATALOG>>>

<<<WAITER_NOTE>>>
${sanitizedInput}
<<<END_WAITER_NOTE>>>`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second hard timeout

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://resteroassist.ir",
          "X-Title": "Resteroassist AI Scratchpad",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userDelimitedMessage },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;

        if (content) {
          const rawParsed = JSON.parse(content);
          const validated = ParsedOrderResponseSchema.safeParse(rawParsed);

          if (validated.success && validated.data.items.length > 0) {
            // Verify menu_item_ids actually belong to current menu
            const validItemIds = new Set(menuItems.map((m) => m.id));
            const filteredItems = validated.data.items.filter((item) =>
              validItemIds.has(item.menu_item_id)
            );

            if (filteredItems.length > 0) {
              logAuditEvent({
                restaurant_id: restaurantId,
                actor_id: actorId,
                action: "ai_note_parsed_success",
                latency_ms: Date.now() - startTime,
                metadata: { model, itemCount: filteredItems.length },
              });

              return {
                success: true,
                data: { items: filteredItems },
                source: "openrouter",
              };
            }
          }
        }
      }
    } catch (err: unknown) {
      logAuditEvent({
        restaurant_id: restaurantId,
        actor_id: actorId,
        action: "ai_note_parse_fallback_triggered",
        latency_ms: Date.now() - startTime,
        error_code: err instanceof Error ? err.name : "UNKNOWN_ERROR",
        metadata: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // Graceful Local Fallback: Parse using heuristic extractor
  const fallbackItems = localPersianMenuMatcher(sanitizedInput, menuItems);
  if (fallbackItems.length > 0) {
    logAuditEvent({
      restaurant_id: restaurantId,
      actor_id: actorId,
      action: "ai_note_heuristic_match_used",
      latency_ms: Date.now() - startTime,
      metadata: { itemCount: fallbackItems.length },
    });

    return {
      success: true,
      data: { items: fallbackItems },
      source: "heuristic",
    };
  }

  // If nothing could be extracted, return standard fallback message
  return {
    success: false,
    error: "سیستم هوش مصنوعی موقتاً در دسترس نیست؛ لطفاً آیتم‌ها را به صورت دستی انتخاب کنید.",
    source: "error",
  };
}

