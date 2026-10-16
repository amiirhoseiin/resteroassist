-- Migration: 20261016000002_menu_items_management.sql
-- Description: Policies for Manager Menu Items Update and Delete

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'menu_items' 
        AND policyname = 'Managers and owners can update menu items in their restaurant'
    ) THEN
        CREATE POLICY "Managers and owners can update menu items in their restaurant"
        ON public.menu_items FOR UPDATE
        USING (
            restaurant_id = public.current_restaurant_id()
            AND public.current_user_role() IN ('manager', 'owner')
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'menu_items' 
        AND policyname = 'Managers and owners can delete menu items in their restaurant'
    ) THEN
        CREATE POLICY "Managers and owners can delete menu items in their restaurant"
        ON public.menu_items FOR DELETE
        USING (
            restaurant_id = public.current_restaurant_id()
            AND public.current_user_role() IN ('manager', 'owner')
        );
    END IF;
END $$;

