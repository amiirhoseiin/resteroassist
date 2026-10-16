"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAuditEvent } from "@/lib/logger";
import { parsePersianOrderNote } from "@/lib/ai-parser";

// Input Schemas
const AddItemSchema = z.object({
  orderId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(250).optional().nullable(),
});

const UpdateItemDetailsSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(250).optional().nullable(),
  expectedVersion: z.number().int().min(1),
});

const UpdateStatusSchema = z.object({
  itemId: z.string().uuid(),
  newStatus: z.enum(["pending", "preparing", "ready", "served", "cancelled"]),
  expectedVersion: z.number().int().min(1),
});

const CancelItemSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().max(250).optional().nullable(),
  expectedVersion: z.number().int().min(1).optional(),
});

const ApplyDiscountSchema = z.object({
  orderId: z.string().uuid(),
  discountToman: z.number().int().min(0),
  expectedVersion: z.number().int().min(1).optional(),
});

const SettleOrderSchema = z.object({
  orderId: z.string().uuid(),
  discountToman: z.number().int().min(0).optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

/**
 * Create or retrieve an active order for a dining table
 */
export async function createOrGetTableOrder(tableId: string) {
  const startTime = Date.now();
  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    const { data, error } = await supabase.rpc("rpc_create_order", {
      p_table_id: tableId,
    });

    if (error) {
      logAuditEvent({
        actor_id: actorId,
        action: "create_order_failed",
        latency_ms: Date.now() - startTime,
        error_code: error.code || "DB_ERROR",
        metadata: { message: error.message, tableId },
      });
      return { success: false, error: error.message };
    }

    logAuditEvent({
      actor_id: actorId,
      order_id: data.id,
      action: "create_order_success",
      latency_ms: Date.now() - startTime,
      metadata: { tableId },
    });

    revalidatePath("/pos");
    return { success: true, order: data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت سفارش",
    };
  }
}

/**
 * Add item to order atomically with Zero-Trust DB price snapshot
 */
export async function addItemToOrder(input: z.infer<typeof AddItemSchema>) {
  const startTime = Date.now();
  const validated = AddItemSchema.safeParse(input);

  if (!validated.success) {
    return { success: false, error: "داده‌های ورودی نامعتبر است." };
  }

  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    const { data, error } = await supabase.rpc("rpc_add_order_item", {
      p_order_id: validated.data.orderId,
      p_menu_item_id: validated.data.menuItemId,
      p_quantity: validated.data.quantity,
      p_notes: validated.data.notes || null,
    });

    if (error) {
      logAuditEvent({
        actor_id: actorId,
        order_id: validated.data.orderId,
        action: "add_item_failed",
        latency_ms: Date.now() - startTime,
        error_code: error.code || "DB_ERROR",
        metadata: { message: error.message },
      });
      return { success: false, error: error.message };
    }

    logAuditEvent({
      actor_id: actorId,
      order_id: validated.data.orderId,
      action: "add_item_success",
      latency_ms: Date.now() - startTime,
      metadata: { itemId: data?.id, quantity: validated.data.quantity },
    });

    revalidatePath("/pos");
    revalidatePath("/kds");
    revalidatePath("/cashier");
    return { success: true, item: data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در افزودن آیتم به سفارش",
    };
  }
}

/**
 * Update item preparation status with optimistic locking
 */
export async function updateItemStatus(input: z.infer<typeof UpdateStatusSchema>) {
  const startTime = Date.now();
  const validated = UpdateStatusSchema.safeParse(input);

  if (!validated.success) {
    return { success: false, error: "داده‌های تغییر وضعیت نامعتبر است." };
  }

  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    const { data, error } = await supabase.rpc("rpc_update_item_status", {
      p_item_id: validated.data.itemId,
      p_new_status: validated.data.newStatus,
      p_expected_version: validated.data.expectedVersion,
    });

    if (error) {
      logAuditEvent({
        actor_id: actorId,
        action: "update_status_failed",
        latency_ms: Date.now() - startTime,
        error_code: error.code || "CONCURRENCY_ERROR",
        metadata: { message: error.message, itemId: validated.data.itemId },
      });
      return { success: false, error: error.message };
    }

    logAuditEvent({
      actor_id: actorId,
      action: "update_status_success",
      latency_ms: Date.now() - startTime,
      metadata: {
        itemId: validated.data.itemId,
        newStatus: validated.data.newStatus,
        version: data?.version,
      },
    });

    revalidatePath("/pos");
    revalidatePath("/kds");
    revalidatePath("/cashier");
    return { success: true, item: data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای سیستمی در تغییر وضعیت",
    };
  }
}

/**
 * Cancel an order item enforcing Cooking Lock
 */
export async function cancelOrderItem(input: z.infer<typeof CancelItemSchema>) {
  const startTime = Date.now();
  const validated = CancelItemSchema.safeParse(input);

  if (!validated.success) {
    return { success: false, error: "درخواست لغو آیتم نامعتبر است." };
  }

  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    const { data, error } = await supabase.rpc("rpc_cancel_order_item", {
      p_item_id: validated.data.itemId,
      p_reason: validated.data.reason || null,
      p_expected_version: validated.data.expectedVersion || null,
    });

    if (error) {
      logAuditEvent({
        actor_id: actorId,
        action: "cancel_item_blocked",
        latency_ms: Date.now() - startTime,
        error_code: error.code || "COOKING_LOCK_ERROR",
        metadata: { message: error.message, itemId: validated.data.itemId },
      });
      return { success: false, error: error.message };
    }

    logAuditEvent({
      actor_id: actorId,
      action: "cancel_item_success",
      latency_ms: Date.now() - startTime,
      metadata: { itemId: validated.data.itemId },
    });

    revalidatePath("/pos");
    revalidatePath("/kds");
    revalidatePath("/cashier");
    return { success: true, item: data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در لغو آیتم سفارش",
    };
  }
}

/**
 * Apply discount to order (Cashier / Manager only)
 */
export async function applyOrderDiscount(input: z.infer<typeof ApplyDiscountSchema>) {
  const startTime = Date.now();
  const validated = ApplyDiscountSchema.safeParse(input);

  if (!validated.success) {
    return { success: false, error: "مبلغ تخفیف نامعتبر است." };
  }

  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    const { data, error } = await supabase.rpc("rpc_apply_order_discount", {
      p_order_id: validated.data.orderId,
      p_discount_toman: validated.data.discountToman,
      p_expected_version: validated.data.expectedVersion || null,
    });

    if (error) {
      logAuditEvent({
        actor_id: actorId,
        order_id: validated.data.orderId,
        action: "apply_discount_failed",
        latency_ms: Date.now() - startTime,
        error_code: error.code || "DISCOUNT_ERROR",
        metadata: { message: error.message },
      });
      return { success: false, error: error.message };
    }

    logAuditEvent({
      actor_id: actorId,
      order_id: validated.data.orderId,
      action: "apply_discount_success",
      latency_ms: Date.now() - startTime,
      metadata: { discountToman: validated.data.discountToman, summary: data },
    });

    revalidatePath("/cashier");
    return { success: true, summary: data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در اعمال تخفیف",
    };
  }
}

/**
 * Settle and close order (10% VAT + Final Payment)
 */
export async function settleOrder(input: z.infer<typeof SettleOrderSchema>) {
  const startTime = Date.now();
  const validated = SettleOrderSchema.safeParse(input);

  if (!validated.success) {
    return { success: false, error: "اطلاعات تسویه نامعتبر است." };
  }

  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    const { data, error } = await supabase.rpc("rpc_settle_order", {
      p_order_id: validated.data.orderId,
      p_discount_toman: validated.data.discountToman || null,
      p_expected_version: validated.data.expectedVersion || null,
    });

    if (error) {
      logAuditEvent({
        actor_id: actorId,
        order_id: validated.data.orderId,
        action: "settle_order_failed",
        latency_ms: Date.now() - startTime,
        error_code: error.code || "CHECKOUT_ERROR",
        metadata: { message: error.message },
      });
      return { success: false, error: error.message };
    }

    logAuditEvent({
      actor_id: actorId,
      order_id: validated.data.orderId,
      action: "settle_order_success",
      latency_ms: Date.now() - startTime,
      metadata: { summary: data },
    });

    revalidatePath("/cashier");
    revalidatePath("/pos");
    revalidatePath("/kds");
    return { success: true, summary: data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در تسویه نهایی فاکتور",
    };
  }
}

/**
 * AI Smart Waiter Scratchpad Action
 * Parses conversational Persian notes into structured items matching tenant menu
 */
export async function parseVoiceNoteAction(orderId: string, noteText: string) {
  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;

    // Fetch active menu items for this restaurant
    const { data: menuItems, error: menuErr } = await supabase
      .from("menu_items")
      .select("id, name, category")
      .eq("is_available", true);

    if (menuErr || !menuItems || menuItems.length === 0) {
      return {
        success: false,
        error: "منوی فعلی رستوران در دسترس نیست.",
        source: "error" as const,
        data: undefined,
      };
    }

    const { data: orderData } = await supabase
      .from("orders")
      .select("restaurant_id")
      .eq("id", orderId)
      .single();

    const restaurantId = orderData?.restaurant_id || "unspecified";

    const parseResult = await parsePersianOrderNote(
      noteText,
      menuItems,
      restaurantId,
      actorId
    );

    return parseResult;
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در پردازش هوشمند یادداشت",
      source: "error" as const,
      data: undefined,
    };
  }
}

/**
 * Update quantity and notes for an existing pending order item
 */
export async function updateOrderItemDetails(input: z.infer<typeof UpdateItemDetailsSchema>) {
  const startTime = Date.now();
  const validated = UpdateItemDetailsSchema.safeParse(input);

  if (!validated.success) {
    return { success: false, error: "داده‌های ویرایش آیتم نامعتبر است." };
  }

  const supabase = await createClient();

  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id;
    const userRole = userResp?.user?.app_metadata?.role;
    const restaurantId = userResp?.user?.app_metadata?.restaurant_id;

    if (!userRole || !["waiter", "cashier", "manager", "owner"].includes(userRole)) {
      return { success: false, error: "دسترسی غیرمجاز برای ویرایش سفارش" };
    }

    // Fetch existing item
    const { data: item, error: fetchErr } = await supabase
      .from("order_items")
      .select("id, order_id, restaurant_id, status, version")
      .eq("id", validated.data.itemId)
      .eq("restaurant_id", restaurantId)
      .single();

    if (fetchErr || !item) {
      return { success: false, error: "آیتم مورد نظر یافت نشد." };
    }

    // Check version for optimistic locking
    if (item.version !== validated.data.expectedVersion) {
      return {
        success: false,
        error: "این آیتم همزمان توسط همکار دیگری تغییر یافته است؛ لطفاً صفحه را بروزرسانی کنید.",
      };
    }

    // Check status: only pending items can be edited
    if (item.status !== "pending") {
      return {
        success: false,
        error: "امکان تغییر وجود ندارد؛ آشپزخانه پخت این آیتم را آغاز کرده یا آماده شده است.",
      };
    }

    // Update item
    const { data: updatedItem, error: updateErr } = await supabase
      .from("order_items")
      .update({
        quantity: validated.data.quantity,
        notes: validated.data.notes || null,
        version: item.version + 1,
      })
      .eq("id", validated.data.itemId)
      .eq("version", item.version)
      .select()
      .single();

    if (updateErr || !updatedItem) {
      return { success: false, error: "خطا در بروزرسانی اطلاعات آیتم: " + updateErr?.message };
    }

    // Record audit event in order_events for Kitchen Realtime Notification
    await supabase.from("order_events").insert({
      restaurant_id: restaurantId,
      order_id: item.order_id,
      actor_id: actorId,
      event_type: "item_edited",
      payload: {
        item_id: item.id,
        new_quantity: validated.data.quantity,
        new_notes: validated.data.notes,
      },
    });

    logAuditEvent({
      restaurant_id: restaurantId,
      actor_id: actorId,
      order_id: item.order_id,
      action: "order_item_edited",
      latency_ms: Date.now() - startTime,
      metadata: { itemId: item.id, quantity: validated.data.quantity },
    });

    revalidatePath("/pos");
    revalidatePath("/kds");
    revalidatePath("/cashier");
    return { success: true, item: updatedItem };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای غیرمنتظره در ویرایش آیتم",
    };
  }
}


