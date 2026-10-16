-- Migration: 20261016000000_init_schema_and_rls.sql
-- Description: Multi-tenant Iranian Restaurant Operations Schema, RLS, and Atomic RPC Functions

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'manager', 'cashier', 'waiter', 'kitchen');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('open', 'settling', 'paid', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE item_status AS ENUM ('pending', 'preparing', 'ready', 'served', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tables

-- Restaurants
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff Profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dining Tables
CREATE TABLE IF NOT EXISTS public.dining_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    capacity INT NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_branch_table_number UNIQUE (branch_id, table_number)
);

-- Menu Items
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price_toman BIGINT NOT NULL CHECK (price_toman >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES public.dining_tables(id) ON DELETE RESTRICT,
    status order_status NOT NULL DEFAULT 'open',
    discount_toman BIGINT NOT NULL DEFAULT 0 CHECK (discount_toman >= 0),
    version INT NOT NULL DEFAULT 1,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_toman BIGINT NOT NULL CHECK (unit_price_toman >= 0),
    notes TEXT,
    status item_status NOT NULL DEFAULT 'pending',
    version INT NOT NULL DEFAULT 1,
    added_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order Events (Structured Audit Log)
CREATE TABLE IF NOT EXISTS public.order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for high-throughput queries
CREATE INDEX IF NOT EXISTS idx_branches_restaurant ON public.branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON public.staff_profiles(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_branch ON public.dining_tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON public.menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON public.orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_table ON public.orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant_status ON public.order_items(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events(order_id);

-- 3. Auth Metadata Synchronization Trigger
-- Automatically inject restaurant_id, branch_id, and role into auth.users.raw_app_meta_data
CREATE OR REPLACE FUNCTION public.sync_staff_app_metadata()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'restaurant_id', NEW.restaurant_id::text,
        'branch_id', NEW.branch_id::text,
        'role', NEW.role::text,
        'full_name', NEW.full_name
    )
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_staff_metadata ON public.staff_profiles;
CREATE TRIGGER trg_sync_staff_metadata
AFTER INSERT OR UPDATE ON public.staff_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_staff_app_metadata();

-- 4. Helper Functions for RLS
CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS UUID
SECURITY DEFINER
STABLE
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id TEXT;
    v_profile_id UUID;
BEGIN
    -- 1. Try JWT app_metadata first (fastest)
    v_rest_id := auth.jwt() -> 'app_metadata' ->> 'restaurant_id';
    IF v_rest_id IS NOT NULL AND v_rest_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN v_rest_id::uuid;
    END IF;

    -- 2. Fallback to direct staff_profiles lookup
    SELECT restaurant_id INTO v_profile_id
    FROM public.staff_profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
SECURITY DEFINER
STABLE
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_text TEXT;
    v_profile_role user_role;
BEGIN
    v_role_text := auth.jwt() -> 'app_metadata' ->> 'role';
    IF v_role_text IS NOT NULL THEN
        RETURN v_role_text::user_role;
    END IF;

    SELECT role INTO v_profile_role
    FROM public.staff_profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN v_profile_role;
END;
$$;

-- 5. Row Level Security (RLS)

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Restaurants Policies
CREATE POLICY "Staff can view their own restaurant"
ON public.restaurants FOR SELECT
USING (id = public.current_restaurant_id());

-- Branches Policies
CREATE POLICY "Staff can view their restaurant branches"
ON public.branches FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

-- Staff Profiles Policies
CREATE POLICY "Staff can view colleagues in same restaurant"
ON public.staff_profiles FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

-- Dining Tables Policies
CREATE POLICY "Staff can view tables in their restaurant"
ON public.dining_tables FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

-- Menu Items Policies
CREATE POLICY "Staff can view menu items in their restaurant"
ON public.menu_items FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

-- Orders Policies
CREATE POLICY "Staff can view orders in their restaurant"
ON public.orders FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

CREATE POLICY "Waiters and managers can create orders"
ON public.orders FOR INSERT
WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND public.current_user_role() IN ('waiter', 'cashier', 'manager', 'owner')
);

CREATE POLICY "Authorized staff can update orders"
ON public.orders FOR UPDATE
USING (restaurant_id = public.current_restaurant_id());

-- Order Items Policies
CREATE POLICY "Staff can view order items in their restaurant"
ON public.order_items FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

CREATE POLICY "Waiters, cashiers, managers can insert order items"
ON public.order_items FOR INSERT
WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND public.current_user_role() IN ('waiter', 'cashier', 'manager', 'owner')
);

CREATE POLICY "Staff can update order items in their restaurant"
ON public.order_items FOR UPDATE
USING (restaurant_id = public.current_restaurant_id());

-- Order Events Policies
CREATE POLICY "Staff can view events in their restaurant"
ON public.order_events FOR SELECT
USING (restaurant_id = public.current_restaurant_id());

CREATE POLICY "Staff can insert order events in their restaurant"
ON public.order_events FOR INSERT
WITH CHECK (restaurant_id = public.current_restaurant_id());

-- 6. Atomic Postgres RPC Functions (Security Invoker with Enforced Rules)

-- Create / Open an Order
CREATE OR REPLACE FUNCTION public.rpc_create_order(
    p_table_id UUID
)
RETURNS public.orders
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_branch_id UUID;
    v_user_id UUID := auth.uid();
    v_existing_order public.orders;
    v_new_order public.orders;
BEGIN
    IF v_rest_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or no restaurant associated with user';
    END IF;

    -- Verify table exists and belongs to user's restaurant
    SELECT branch_id INTO v_branch_id
    FROM public.dining_tables
    WHERE id = p_table_id AND restaurant_id = v_rest_id;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'Table not found in this restaurant';
    END IF;

    -- Check if an active open or settling order already exists for this table
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE table_id = p_table_id AND status IN ('open', 'settling')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_order.id IS NOT NULL THEN
        RETURN v_existing_order;
    END IF;

    -- Create new order
    INSERT INTO public.orders (
        restaurant_id,
        branch_id,
        table_id,
        status,
        discount_toman,
        version,
        created_by
    ) VALUES (
        v_rest_id,
        v_branch_id,
        p_table_id,
        'open',
        0,
        1,
        v_user_id
    ) RETURNING * INTO v_new_order;

    -- Log audit event
    INSERT INTO public.order_events (
        restaurant_id,
        order_id,
        actor_id,
        event_type,
        payload
    ) VALUES (
        v_rest_id,
        v_new_order.id,
        v_user_id,
        'order_created',
        jsonb_build_object('table_id', p_table_id, 'branch_id', v_branch_id)
    );

    RETURN v_new_order;
END;
$$;

-- Add Item to Order with Zero-Trust DB Price Lookup
CREATE OR REPLACE FUNCTION public.rpc_add_order_item(
    p_order_id UUID,
    p_menu_item_id UUID,
    p_quantity INT,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.order_items
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_order public.orders;
    v_menu_item public.menu_items;
    v_new_item public.order_items;
BEGIN
    IF v_rest_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF v_user_role NOT IN ('waiter', 'cashier', 'manager', 'owner') THEN
        RAISE EXCEPTION 'Kitchen staff cannot add items to orders';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    -- Lock order row for inspection
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND restaurant_id = v_rest_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found in this restaurant';
    END IF;

    IF v_order.status = 'paid' THEN
        RAISE EXCEPTION 'Cannot add items to a paid order';
    END IF;

    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot add items to a cancelled order';
    END IF;

    -- Fetch and verify menu item price directly from DB (Zero-Trust)
    SELECT * INTO v_menu_item
    FROM public.menu_items
    WHERE id = p_menu_item_id AND restaurant_id = v_rest_id;

    IF v_menu_item.id IS NULL THEN
        RAISE EXCEPTION 'Menu item not found or unavailable';
    END IF;

    -- If order was in 'settling' status, bump version and record alert
    IF v_order.status = 'settling' THEN
        UPDATE public.orders
        SET version = version + 1, updated_at = now()
        WHERE id = p_order_id;

        INSERT INTO public.order_events (
            restaurant_id,
            order_id,
            actor_id,
            event_type,
            payload
        ) VALUES (
            v_rest_id,
            p_order_id,
            v_user_id,
            'settling_order_modified',
            jsonb_build_object('warning', 'Item added while order was in settling state')
        );
    END IF;

    -- Insert independent row in order_items
    INSERT INTO public.order_items (
        order_id,
        restaurant_id,
        menu_item_id,
        quantity,
        unit_price_toman,
        notes,
        status,
        version,
        added_by
    ) VALUES (
        p_order_id,
        v_rest_id,
        p_menu_item_id,
        p_quantity,
        v_menu_item.price_toman,
        p_notes,
        'pending',
        1,
        v_user_id
    ) RETURNING * INTO v_new_item;

    -- Record audit event
    INSERT INTO public.order_events (
        restaurant_id,
        order_id,
        actor_id,
        event_type,
        payload
    ) VALUES (
        v_rest_id,
        p_order_id,
        v_user_id,
        'item_added',
        jsonb_build_object(
            'item_id', v_new_item.id,
            'menu_item_name', v_menu_item.name,
            'quantity', p_quantity,
            'unit_price_toman', v_menu_item.price_toman,
            'notes', p_notes
        )
    );

    RETURN v_new_item;
END;
$$;

-- Update Item Status with Optimistic Locking and Role Restrictions
CREATE OR REPLACE FUNCTION public.rpc_update_item_status(
    p_item_id UUID,
    p_new_status item_status,
    p_expected_version INT
)
RETURNS public.order_items
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_item public.order_items;
    v_updated_item public.order_items;
BEGIN
    SELECT * INTO v_item
    FROM public.order_items
    WHERE id = p_item_id AND restaurant_id = v_rest_id
    FOR UPDATE;

    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Order item not found';
    END IF;

    -- Check optimistic concurrency version
    IF v_item.version != p_expected_version THEN
        RAISE EXCEPTION 'Concurrency conflict: item was modified by another user (expected v%, current v%)',
            p_expected_version, v_item.version;
    END IF;

    -- Role transition permissions:
    -- Kitchen or Manager/Owner can move to preparing or ready
    IF p_new_status IN ('preparing', 'ready') THEN
        IF v_user_role NOT IN ('kitchen', 'manager', 'owner') THEN
            RAISE EXCEPTION 'Only kitchen staff or managers can set items to %', p_new_status;
        END IF;
    END IF;

    -- Waiter, Kitchen, Cashier, Manager can move from ready to served
    IF p_new_status = 'served' THEN
        IF v_item.status != 'ready' AND v_user_role = 'waiter' THEN
            RAISE EXCEPTION 'Waiter can only mark ready items as served';
        END IF;
    END IF;

    -- Update item status and bump version
    UPDATE public.order_items
    SET status = p_new_status,
        version = version + 1,
        updated_at = now()
    WHERE id = p_item_id
    RETURNING * INTO v_updated_item;

    -- Audit log
    INSERT INTO public.order_events (
        restaurant_id,
        order_id,
        actor_id,
        event_type,
        payload
    ) VALUES (
        v_rest_id,
        v_item.order_id,
        v_user_id,
        'item_status_changed',
        jsonb_build_object(
            'item_id', p_item_id,
            'old_status', v_item.status,
            'new_status', p_new_status,
            'version', v_updated_item.version
        )
    );

    RETURN v_updated_item;
END;
$$;

-- Cancel Order Item with Cooking Lock Protection
CREATE OR REPLACE FUNCTION public.rpc_cancel_order_item(
    p_item_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_expected_version INT DEFAULT NULL
)
RETURNS public.order_items
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_item public.order_items;
    v_updated_item public.order_items;
BEGIN
    SELECT * INTO v_item
    FROM public.order_items
    WHERE id = p_item_id AND restaurant_id = v_rest_id
    FOR UPDATE;

    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Order item not found';
    END IF;

    IF v_item.status = 'cancelled' THEN
        RETURN v_item; -- Already cancelled
    END IF;

    IF p_expected_version IS NOT NULL AND v_item.version != p_expected_version THEN
        RAISE EXCEPTION 'Concurrency conflict: item version mismatch';
    END IF;

    -- COOKING LOCK: Waiter cannot cancel an item if the kitchen has already started cooking it!
    IF v_item.status IN ('preparing', 'ready', 'served') THEN
        IF v_user_role NOT IN ('manager', 'owner', 'cashier') THEN
            RAISE EXCEPTION 'Kitchen has already started cooking or served this item (%s). Contact manager to cancel.', v_item.status;
        END IF;
    END IF;

    -- Mark item as cancelled
    UPDATE public.order_items
    SET status = 'cancelled',
        version = version + 1,
        updated_at = now()
    WHERE id = p_item_id
    RETURNING * INTO v_updated_item;

    -- Audit log
    INSERT INTO public.order_events (
        restaurant_id,
        order_id,
        actor_id,
        event_type,
        payload
    ) VALUES (
        v_rest_id,
        v_item.order_id,
        v_user_id,
        'item_cancelled',
        jsonb_build_object(
            'item_id', p_item_id,
            'previous_status', v_item.status,
            'reason', p_reason,
            'version', v_updated_item.version
        )
    );

    RETURN v_updated_item;
END;
$$;

-- Calculate Bill Summary (Subtotal, Discount, 10% VAT, Grand Total)
CREATE OR REPLACE FUNCTION public.rpc_get_order_summary(
    p_order_id UUID
)
RETURNS JSONB
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_order public.orders;
    v_subtotal BIGINT := 0;
    v_discount BIGINT := 0;
    v_net BIGINT := 0;
    v_tax_rate NUMERIC(5,2) := 10.00;
    v_vat BIGINT := 0;
    v_grand_total BIGINT := 0;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND restaurant_id = v_rest_id;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Fetch restaurant tax rate
    SELECT tax_rate INTO v_tax_rate
    FROM public.restaurants
    WHERE id = v_rest_id;

    -- Calculate subtotal from non-cancelled items
    SELECT COALESCE(SUM(quantity * unit_price_toman), 0)
    INTO v_subtotal
    FROM public.order_items
    WHERE order_id = p_order_id AND status != 'cancelled';

    v_discount := LEAST(v_order.discount_toman, v_subtotal);
    v_net := v_subtotal - v_discount;
    v_vat := FLOOR(v_net * (COALESCE(v_tax_rate, 10.00) / 100.0));
    v_grand_total := v_net + v_vat;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'status', v_order.status,
        'subtotal_toman', v_subtotal,
        'discount_toman', v_discount,
        'tax_rate_percent', v_tax_rate,
        'vat_toman', v_vat,
        'grand_total_toman', v_grand_total,
        'version', v_order.version
    );
END;
$$;

-- Apply Discount (Cashier / Manager Only)
CREATE OR REPLACE FUNCTION public.rpc_apply_order_discount(
    p_order_id UUID,
    p_discount_toman BIGINT,
    p_expected_version INT DEFAULT NULL
)
RETURNS JSONB
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_order public.orders;
    v_subtotal BIGINT;
BEGIN
    IF v_user_role NOT IN ('cashier', 'manager', 'owner') THEN
        RAISE EXCEPTION 'Only cashiers and managers can apply discounts';
    END IF;

    IF p_discount_toman < 0 THEN
        RAISE EXCEPTION 'Discount cannot be negative';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND restaurant_id = v_rest_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status = 'paid' THEN
        RAISE EXCEPTION 'Cannot discount a paid order';
    END IF;

    IF p_expected_version IS NOT NULL AND v_order.version != p_expected_version THEN
        RAISE EXCEPTION 'Order version conflict';
    END IF;

    -- Calculate subtotal to ensure discount doesn't exceed it
    SELECT COALESCE(SUM(quantity * unit_price_toman), 0)
    INTO v_subtotal
    FROM public.order_items
    WHERE order_id = p_order_id AND status != 'cancelled';

    IF p_discount_toman > v_subtotal THEN
        RAISE EXCEPTION 'Discount (%s Toman) cannot exceed order subtotal (%s Toman)', p_discount_toman, v_subtotal;
    END IF;

    -- Update order discount and version
    UPDATE public.orders
    SET discount_toman = p_discount_toman,
        status = 'settling',
        version = version + 1,
        updated_at = now()
    WHERE id = p_order_id;

    -- Audit log
    INSERT INTO public.order_events (
        restaurant_id,
        order_id,
        actor_id,
        event_type,
        payload
    ) VALUES (
        v_rest_id,
        p_order_id,
        v_user_id,
        'discount_applied',
        jsonb_build_object(
            'discount_toman', p_discount_toman,
            'subtotal_toman', v_subtotal
        )
    );

    RETURN public.rpc_get_order_summary(p_order_id);
END;
$$;

-- Settle and Close Order (Cashier / Manager Only)
CREATE OR REPLACE FUNCTION public.rpc_settle_order(
    p_order_id UUID,
    p_discount_toman BIGINT DEFAULT NULL,
    p_expected_version INT DEFAULT NULL
)
RETURNS JSONB
SECURITY INVOKER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_order public.orders;
    v_summary JSONB;
BEGIN
    IF v_user_role NOT IN ('cashier', 'manager', 'owner') THEN
        RAISE EXCEPTION 'Only cashiers and managers can finalize checkout';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND restaurant_id = v_rest_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status = 'paid' THEN
        RAISE EXCEPTION 'Order is already settled and paid';
    END IF;

    IF p_expected_version IS NOT NULL AND v_order.version != p_expected_version THEN
        RAISE EXCEPTION 'Checkout conflict: order details changed during checkout. Please review the updated bill.';
    END IF;

    IF p_discount_toman IS NOT NULL THEN
        PERFORM public.rpc_apply_order_discount(p_order_id, p_discount_toman, v_order.version);
    END IF;

    -- Mark order as paid
    UPDATE public.orders
    SET status = 'paid',
        version = version + 1,
        updated_at = now()
    WHERE id = p_order_id;

    v_summary := public.rpc_get_order_summary(p_order_id);

    -- Audit log
    INSERT INTO public.order_events (
        restaurant_id,
        order_id,
        actor_id,
        event_type,
        payload
    ) VALUES (
        v_rest_id,
        p_order_id,
        v_user_id,
        'order_settled',
        v_summary
    );

    RETURN v_summary;
END;
$$;

-- 7. Supabase Realtime Publication Setup
-- Enable replica identity full on orders and order_items for realtime diffs
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.order_events REPLICA IDENTITY FULL;
ALTER TABLE public.dining_tables REPLICA IDENTITY FULL;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dining_tables;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
