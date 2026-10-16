"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/logger";

const CreateMenuItemSchema = z.object({
  name: z.string().min(2, "نام آیتم منو باید حداقل ۲ حرف باشد"),
  category: z.string().min(2, "دسته‌بندی باید حداقل ۲ حرف باشد"),
  priceToman: z.number().int().min(0, "قیمت باید صفر یا عددی مثبت باشد"),
  isAvailable: z.boolean().default(true),
});

const UpdateMenuItemSchema = z.object({
  id: z.string().uuid("شناسه آیتم نامعتبر است"),
  name: z.string().min(2, "نام آیتم منو باید حداقل ۲ حرف باشد"),
  category: z.string().min(2, "دسته‌بندی باید حداقل ۲ حرف باشد"),
  priceToman: z.number().int().min(0, "قیمت باید صفر یا عددی مثبت باشد"),
  isAvailable: z.boolean(),
});

/**
 * Add a new item to the restaurant's menu (Manager/Owner only)
 */
export async function createMenuItemAction(input: z.infer<typeof CreateMenuItemSchema>) {
  const startTime = Date.now();
  const validated = CreateMenuItemSchema.safeParse(input);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "اطلاعات ورودی نامعتبر است.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: "شما وارد سیستم نشده‌اید." };
    }

    const callerRole = user.app_metadata?.role;
    const callerRestaurantId = user.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران و مالکان مجاز به افزودن غذای جدید به منو هستند." };
    }

    if (!callerRestaurantId) {
      return { success: false, error: "شناسه رستوران یافت نشد." };
    }

    const { data: newItem, error: insertErr } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: callerRestaurantId,
        name: validated.data.name.trim(),
        category: validated.data.category.trim(),
        price_toman: validated.data.priceToman,
        is_available: validated.data.isAvailable,
      })
      .select()
      .single();

    if (insertErr || !newItem) {
      logAuditEvent({
        restaurant_id: callerRestaurantId,
        actor_id: user.id,
        action: "create_menu_item_error",
        latency_ms: Date.now() - startTime,
        error_code: insertErr?.code || "INSERT_ERROR",
        metadata: { message: insertErr?.message },
      });
      return { success: false, error: "خطا در ثبت آیتم در منو: " + insertErr?.message };
    }

    logAuditEvent({
      restaurant_id: callerRestaurantId,
      actor_id: user.id,
      action: "create_menu_item_success",
      latency_ms: Date.now() - startTime,
      metadata: {
        menu_item_id: newItem.id,
        name: validated.data.name,
        price_toman: validated.data.priceToman,
      },
    });

    revalidatePath("/menu");
    revalidatePath("/pos");
    revalidatePath("/kds");
    return { success: true, item: newItem };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت غذای جدید",
    };
  }
}

/**
 * Edit an existing menu item (Manager/Owner only)
 */
export async function updateMenuItemAction(input: z.infer<typeof UpdateMenuItemSchema>) {
  const startTime = Date.now();
  const validated = UpdateMenuItemSchema.safeParse(input);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "اطلاعات ورودی نامعتبر است.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: "شما وارد سیستم نشده‌اید." };
    }

    const callerRole = user.app_metadata?.role;
    const callerRestaurantId = user.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران و مالکان مجاز به ویرایش منو هستند." };
    }

    if (!callerRestaurantId) {
      return { success: false, error: "شناسه رستوران یافت نشد." };
    }

    // Verify item belongs to caller's restaurant
    const { data: existing, error: findErr } = await supabase
      .from("menu_items")
      .select("id, restaurant_id, name")
      .eq("id", validated.data.id)
      .eq("restaurant_id", callerRestaurantId)
      .single();

    if (findErr || !existing) {
      return { success: false, error: "آیتم مورد نظر در منوی این رستوران یافت نشد." };
    }

    const { data: updatedItem, error: updateErr } = await supabase
      .from("menu_items")
      .update({
        name: validated.data.name.trim(),
        category: validated.data.category.trim(),
        price_toman: validated.data.priceToman,
        is_available: validated.data.isAvailable,
      })
      .eq("id", validated.data.id)
      .eq("restaurant_id", callerRestaurantId)
      .select()
      .single();

    if (updateErr || !updatedItem) {
      return { success: false, error: "خطا در ذخیره تغییرات منو: " + updateErr?.message };
    }

    logAuditEvent({
      restaurant_id: callerRestaurantId,
      actor_id: user.id,
      action: "update_menu_item_success",
      latency_ms: Date.now() - startTime,
      metadata: {
        menu_item_id: validated.data.id,
        new_name: validated.data.name,
        new_price: validated.data.priceToman,
        is_available: validated.data.isAvailable,
      },
    });

    revalidatePath("/menu");
    revalidatePath("/pos");
    revalidatePath("/kds");
    return { success: true, item: updatedItem };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای غیرمنتظره در ویرایش منو",
    };
  }
}

/**
 * Toggle availability of a menu item (Quick button: موجود / تمام شد)
 */
export async function toggleMenuItemAvailabilityAction(input: {
  id: string;
  isAvailable: boolean;
}) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: "شما وارد سیستم نشده‌اید." };
    }

    const callerRole = user.app_metadata?.role;
    const callerRestaurantId = user.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران مجاز به تغییر وضعیت موجودی هستند." };
    }

    const { error: updateErr } = await supabase
      .from("menu_items")
      .update({ is_available: input.isAvailable })
      .eq("id", input.id)
      .eq("restaurant_id", callerRestaurantId);

    if (updateErr) {
      return { success: false, error: "خطا در تغییر وضعیت موجودی: " + updateErr.message };
    }

    revalidatePath("/menu");
    revalidatePath("/pos");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در بروزرسانی موجودی منو",
    };
  }
}

/**
 * Delete a menu item (Manager/Owner only)
 */
export async function deleteMenuItemAction(itemId: string) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const callerRole = user?.app_metadata?.role;
    const callerRestaurantId = user?.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران و مالکان مجاز به حذف آیتم از منو هستند." };
    }

    const { error: deleteErr } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", itemId)
      .eq("restaurant_id", callerRestaurantId);

    if (deleteErr) {
      return {
        success: false,
        error: "امکان حذف این آیتم وجود ندارد زیرا در فاکتورهای پیشین ثبت شده است. می‌توانید وضعیت آن را به «ناموجود» تغییر دهید.",
      };
    }

    revalidatePath("/menu");
    revalidatePath("/pos");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در حذف آیتم منو",
    };
  }
}

