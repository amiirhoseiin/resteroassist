-- Migration: 20261016000001_staff_and_registration_policies.sql
-- Description: Policies for Staff Management and Restaurant Registration

-- 1. Staff Profiles Policies for Manager Operations
CREATE POLICY "Managers and owners can insert staff in their restaurant"
ON public.staff_profiles FOR INSERT
WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND public.current_user_role() IN ('manager', 'owner')
);

CREATE POLICY "Managers and owners can update staff in their restaurant"
ON public.staff_profiles FOR UPDATE
USING (
    restaurant_id = public.current_restaurant_id()
    AND public.current_user_role() IN ('manager', 'owner')
);

-- 2. Dining Tables and Menu Items insert policies for Managers
CREATE POLICY "Managers and owners can insert tables in their restaurant"
ON public.dining_tables FOR INSERT
WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND public.current_user_role() IN ('manager', 'owner')
);

CREATE POLICY "Managers and owners can insert menu items in their restaurant"
ON public.menu_items FOR INSERT
WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND public.current_user_role() IN ('manager', 'owner')
);
