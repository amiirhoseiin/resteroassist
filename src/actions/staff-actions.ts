"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/logger";

const HireStaffSchema = z.object({
  fullName: z.string().min(2, "نام و نام‌خانوادگی باید حداقل ۲ حرف باشد"),
  email: z.string().email("ایمیل وارد شده نامعتبر است"),
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
  role: z.enum(["waiter", "kitchen", "cashier", "manager"]),
  branchId: z.string().uuid("شناسه شعبه نامعتبر است"),
});

const RegisterRestaurantSchema = z.object({
  restaurantName: z.string().min(2, "نام رستوران باید حداقل ۲ حرف باشد"),
  branchName: z.string().min(2, "نام شعبه اصلی باید حداقل ۲ حرف باشد"),
  ownerFullName: z.string().min(2, "نام و نام‌خانوادگی مالک باید حداقل ۲ حرف باشد"),
  ownerEmail: z.string().email("ایمیل نامعتبر است"),
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
});

/**
 * Hire a new staff member for the current restaurant (Manager/Owner only)
 */
export async function hireStaffMemberAction(input: z.infer<typeof HireStaffSchema>) {
  const startTime = Date.now();
  const validated = HireStaffSchema.safeParse(input);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "داده‌های ورودی نامعتبر است.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: "شما وارد سیستم نشده‌اید." };
    }

    // Role check: Only manager or owner can hire staff
    const callerRole = user.app_metadata?.role;
    const callerRestaurantId = user.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران و مالکان مجاز به استخدام پرسنل هستند." };
    }

    if (!callerRestaurantId) {
      return { success: false, error: "شناسه رستوران شما یافت نشد." };
    }

    const adminClient = createAdminClient();

    // Verify branch belongs to caller's restaurant
    const { data: branchData, error: branchErr } = await adminClient
      .from("branches")
      .select("id, name")
      .eq("id", validated.data.branchId)
      .eq("restaurant_id", callerRestaurantId)
      .single();

    if (branchErr || !branchData) {
      return { success: false, error: "شعبه انتخاب‌شده متعلق به این رستوران نیست." };
    }

    // Check if email already exists
    const { data: existingUser } = await adminClient
      .from("staff_profiles")
      .select("id")
      .eq("id", user.id)
      .limit(1);

    // Create user in Supabase Auth via Admin Client
    const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: validated.data.email,
      password: validated.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: validated.data.fullName,
      },
      app_metadata: {
        provider: "email",
        providers: ["email"],
        restaurant_id: callerRestaurantId,
        branch_id: validated.data.branchId,
        role: validated.data.role,
        full_name: validated.data.fullName,
      },
    });

    if (createAuthErr || !createdAuth.user) {
      logAuditEvent({
        restaurant_id: callerRestaurantId,
        actor_id: user.id,
        action: "hire_staff_auth_error",
        latency_ms: Date.now() - startTime,
        error_code: createAuthErr?.code || "AUTH_CREATE_ERROR",
        metadata: { message: createAuthErr?.message, email: validated.data.email },
      });
      return {
        success: false,
        error: createAuthErr?.message || "خطا در ایجاد حساب کاربری پرسنل جدید (ممکن است ایمیل تکراری باشد).",
      };
    }

    const newUserId = createdAuth.user.id;

    // Insert staff profile
    const { error: profileErr } = await adminClient.from("staff_profiles").insert({
      id: newUserId,
      restaurant_id: callerRestaurantId,
      branch_id: validated.data.branchId,
      full_name: validated.data.fullName,
      role: validated.data.role,
    });

    if (profileErr) {
      // Rollback user creation
      await adminClient.auth.admin.deleteUser(newUserId);
      return { success: false, error: "خطا در ایجاد پروفایل پرسنل: " + profileErr.message };
    }

    logAuditEvent({
      restaurant_id: callerRestaurantId,
      actor_id: user.id,
      action: "staff_hired_success",
      latency_ms: Date.now() - startTime,
      metadata: {
        new_staff_id: newUserId,
        full_name: validated.data.fullName,
        role: validated.data.role,
        branch_id: validated.data.branchId,
      },
    });

    revalidatePath("/staff");
    return {
      success: true,
      user: {
        id: newUserId,
        fullName: validated.data.fullName,
        role: validated.data.role,
        email: validated.data.email,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت پرسنل جدید",
    };
  }
}

/**
 * Register a new restaurant tenant and setup its initial branch, owner, tables and menu
 */
export async function registerRestaurantAction(input: z.infer<typeof RegisterRestaurantSchema>) {
  const startTime = Date.now();
  const validated = RegisterRestaurantSchema.safeParse(input);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "داده‌های ورودی نامعتبر است.",
    };
  }

  const adminClient = createAdminClient();

  try {
    // 1. Create Restaurant Row
    const { data: newRest, error: restErr } = await adminClient
      .from("restaurants")
      .insert({
        name: validated.data.restaurantName,
        tax_rate: 10.00,
      })
      .select("id")
      .single();

    if (restErr || !newRest) {
      return { success: false, error: "خطا در ثبت اطلاعات رستوران: " + restErr?.message };
    }

    const restaurantId = newRest.id;

    // 2. Create Primary Branch
    const { data: newBranch, error: branchErr } = await adminClient
      .from("branches")
      .insert({
        restaurant_id: restaurantId,
        name: validated.data.branchName,
        address: "شعبه مرکزی",
      })
      .select("id")
      .single();

    if (branchErr || !newBranch) {
      return { success: false, error: "خطا در ایجاد شعبه اصلی: " + branchErr?.message };
    }

    const branchId = newBranch.id;

    // 3. Create Owner User in Supabase Auth
    const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
      email: validated.data.ownerEmail,
      password: validated.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: validated.data.ownerFullName,
      },
      app_metadata: {
        provider: "email",
        providers: ["email"],
        restaurant_id: restaurantId,
        branch_id: branchId,
        role: "owner",
        full_name: validated.data.ownerFullName,
      },
    });

    if (authErr || !authUser.user) {
      // Clean up restaurant
      await adminClient.from("restaurants").delete().eq("id", restaurantId);
      return {
        success: false,
        error: authErr?.message || "خطا در ایجاد حساب کاربری مدیر مجموعه (ممکن است ایمیل قبلاً ثبت شده باشد).",
      };
    }

    const ownerUserId = authUser.user.id;

    // 4. Create Staff Profile
    await adminClient.from("staff_profiles").insert({
      id: ownerUserId,
      restaurant_id: restaurantId,
      branch_id: branchId,
      full_name: validated.data.ownerFullName,
      role: "owner",
    });

    // 5. Seed Starter Dining Tables (میز ۱ تا ۴)
    await adminClient.from("dining_tables").insert([
      { restaurant_id: restaurantId, branch_id: branchId, table_number: "میز ۱", capacity: 2 },
      { restaurant_id: restaurantId, branch_id: branchId, table_number: "میز ۲", capacity: 4 },
      { restaurant_id: restaurantId, branch_id: branchId, table_number: "میز ۳", capacity: 4 },
      { restaurant_id: restaurantId, branch_id: branchId, table_number: "میز ۴", capacity: 6 },
    ]);

    // 6. Seed Starter Menu Items
    await adminClient.from("menu_items").insert([
      { restaurant_id: restaurantId, category: "غذاهای اصلی", name: "غذای ویژه سرآشپز", price_toman: 350000, is_available: true },
      { restaurant_id: restaurantId, category: "پیش‌غذا", name: "سالاد مخصوص", price_toman: 110000, is_available: true },
      { restaurant_id: restaurantId, category: "نوشیدنی", name: "نوشیدنی خنک دست‌ساز", price_toman: 55000, is_available: true },
    ]);

    logAuditEvent({
      restaurant_id: restaurantId,
      actor_id: ownerUserId,
      action: "restaurant_registered_success",
      latency_ms: Date.now() - startTime,
      metadata: {
        restaurant_name: validated.data.restaurantName,
        branch_name: validated.data.branchName,
        owner_email: validated.data.ownerEmail,
      },
    });

    return {
      success: true,
      restaurant: {
        id: restaurantId,
        name: validated.data.restaurantName,
        ownerEmail: validated.data.ownerEmail,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطای غیرمنتظره در ثبت‌نام مجموعه",
    };
  }
}



/**
 * Update staff member role / permissions (Manager/Owner only)
 */
export async function updateStaffRoleAction(input: {
  staffId: string;
  newRole: "waiter" | "kitchen" | "cashier" | "manager";
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
      return { success: false, error: "فقط مدیران مجاز به تغییر دسترسی همکاران هستند." };
    }

    const adminClient = createAdminClient();

    // Verify target staff belongs to caller's restaurant
    const { data: targetProfile, error: targetErr } = await adminClient
      .from("staff_profiles")
      .select("id, role, restaurant_id, full_name")
      .eq("id", input.staffId)
      .eq("restaurant_id", callerRestaurantId)
      .single();

    if (targetErr || !targetProfile) {
      return { success: false, error: "همکار مورد نظر در این رستوران یافت نشد." };
    }

    if (targetProfile.role === "owner" && callerRole !== "owner") {
      return { success: false, error: "تغییر دسترسی مالک مجموعه امکان‌پذیر نیست." };
    }

    // Update staff profile role
    await adminClient
      .from("staff_profiles")
      .update({ role: input.newRole })
      .eq("id", input.staffId);

    // Update auth app_metadata
    await adminClient.auth.admin.updateUserById(input.staffId, {
      app_metadata: { role: input.newRole },
    });

    logAuditEvent({
      restaurant_id: callerRestaurantId,
      actor_id: user.id,
      action: "staff_role_updated",
      metadata: {
        target_staff_id: input.staffId,
        old_role: targetProfile.role,
        new_role: input.newRole,
      },
    });

    revalidatePath("/staff");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در تغییر نقش پرسنل",
    };
  }
}

/**
 * Remove/delete a staff member (Manager/Owner only)
 */
export async function deleteStaffMemberAction(staffId: string) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: "شما وارد سیستم نشده‌اید." };
    }

    const callerRole = user.app_metadata?.role;
    const callerRestaurantId = user.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران مجاز به حذف همکاران هستند." };
    }

    if (user.id === staffId) {
      return { success: false, error: "نمی‌توانید حساب کاربری خودتان را حذف کنید." };
    }

    const adminClient = createAdminClient();

    // Verify target staff belongs to caller's restaurant
    const { data: targetProfile, error: targetErr } = await adminClient
      .from("staff_profiles")
      .select("id, role, restaurant_id")
      .eq("id", staffId)
      .eq("restaurant_id", callerRestaurantId)
      .single();

    if (targetErr || !targetProfile) {
      return { success: false, error: "همکار مورد نظر در این رستوران یافت نشد." };
    }

    if (targetProfile.role === "owner") {
      return { success: false, error: "مالک مجموعه قابل حذف نیست." };
    }

    // Delete staff profile and user
    await adminClient.from("staff_profiles").delete().eq("id", staffId);
    await adminClient.auth.admin.deleteUser(staffId);

    logAuditEvent({
      restaurant_id: callerRestaurantId,
      actor_id: user.id,
      action: "staff_deleted",
      metadata: { deleted_staff_id: staffId },
    });

    revalidatePath("/staff");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در حذف همکار",
    };
  }
}

/**
 * Reset staff password by manager (Manager/Owner only)
 */
export async function resetStaffPasswordAction(input: {
  staffId: string;
  newPassword: string;
}) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const callerRole = user?.app_metadata?.role;
    const callerRestaurantId = user?.app_metadata?.restaurant_id;

    if (!callerRole || !["manager", "owner"].includes(callerRole)) {
      return { success: false, error: "فقط مدیران مجاز به تغییر رمز عبور پرسنل هستند." };
    }

    if (input.newPassword.length < 6) {
      return { success: false, error: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد." };
    }

    const adminClient = createAdminClient();

    // Verify target belongs to caller's restaurant
    const { data: targetProfile } = await adminClient
      .from("staff_profiles")
      .select("id")
      .eq("id", input.staffId)
      .eq("restaurant_id", callerRestaurantId)
      .single();

    if (!targetProfile) {
      return { success: false, error: "پرسنل مورد نظر در این رستوران یافت نشد." };
    }

    await adminClient.auth.admin.updateUserById(input.staffId, {
      password: input.newPassword,
    });

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطا در تنظیم مجدد رمز عبور",
    };
  }
}
