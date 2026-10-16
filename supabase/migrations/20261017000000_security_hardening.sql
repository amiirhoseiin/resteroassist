-- Migration: 20261017000000_security_hardening.sql
-- Description: Post-audit P0/P1 hardening — the financial core becomes genuinely server-authoritative.
--
-- Closes (see SECURITY_AUDIT_REPORT.md):
--   F-01 (zero-trust pricing bypass)        -> direct DML revoked on orders/order_items; writes only via SECURITY DEFINER RPCs
--   F-02 (checkout bypass)                  -> same revoke + rpc_settle_order preconditions
--   F-03 (paid invoice reopen / item inject)-> PAID_ORDER_IMMUTABLE triggers on orders + order_items (all roles except DB owner)
--   F-04 (cooking-lock bypass)              -> rpc_update_item_status now enforces a real transition matrix; cancel only via rpc_cancel_order_item
--   F-05 (duplicate active order race)      -> advisory lock + partial unique index + idempotent conflict handling in rpc_create_order
--   F-06 (forgeable audit trail)            -> INSERT on order_events revoked; events written only by SECURITY DEFINER RPCs (actor = auth.uid())
--   F-07 (role matrix drift, partial)       -> cancel gating aligned with SCOPE (manager/owner may cancel cooking; served is final)
--   F-14.4/F-14.5 (settle preconditions)    -> settle requires status='settling' AND an explicit expected version
--
-- Design rule: anon/authenticated have SELECT only on the financial tables. Every mutation goes through a
-- self-checking SECURITY DEFINER RPC. SECURITY DEFINER runs as the DB owner (postgres, BYPASSRLS), which is safe
-- here because each RPC re-checks tenant (current_restaurant_id) and role (current_user_role) itself.

-- ============================================================================
-- 0. At most ONE active order per table (partial unique index; race protection)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE status IN ('open', 'settling')
        GROUP BY table_id
        HAVING count(*) > 1
    ) THEN
        RAISE NOTICE 'security_hardening: duplicate active orders exist — unique index skipped. Resolve duplicates, then re-run: CREATE UNIQUE INDEX uq_orders_active_table ON public.orders(table_id) WHERE status IN (''open'',''settling'');';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_active_table
            ON public.orders (table_id)
            WHERE status IN ('open', 'settling');
    END IF;
END $$;

-- ============================================================================
-- 1. Paid invoices are immutable — enforced for EVERY role (F-03)
--    (DB-owner sessions — migrations, seed, dashboard repair — may bypass.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_paid_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF session_user IN ('postgres', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_TABLE_NAME = 'orders' THEN
        IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
            RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: order % is settled and cannot be modified', OLD.id;
        ELSIF TG_OP = 'DELETE' AND OLD.status = 'paid' THEN
            RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: order % is settled and cannot be deleted', OLD.id;
        END IF;
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- order_items: the parent order decides
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.status = 'paid') THEN
            RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: cannot add items to a settled order';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id IN (OLD.order_id, NEW.order_id) AND o.status = 'paid') THEN
            RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: cannot modify items of a settled order';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = OLD.order_id AND o.status = 'paid') THEN
            RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: cannot delete items of a settled order';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_paid_immutable ON public.orders;
CREATE TRIGGER trg_orders_paid_immutable
BEFORE UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_immutability();

DROP TRIGGER IF EXISTS trg_order_items_paid_immutable ON public.order_items;
CREATE TRIGGER trg_order_items_paid_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_immutability();

-- ============================================================================
-- 2. Revoke direct writes on the financial tables; keep SELECT (RLS-filtered)
--    (F-01, F-02, F-06)
-- ============================================================================
DROP POLICY IF EXISTS "Waiters and managers can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authorized staff can update orders" ON public.orders;
DROP POLICY IF EXISTS "Waiters, cashiers, managers can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Staff can update order items in their restaurant" ON public.order_items;
DROP POLICY IF EXISTS "Staff can insert order events in their restaurant" ON public.order_events;

REVOKE ALL PRIVILEGES ON public.orders       FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.order_items  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.order_events FROM anon, authenticated;

GRANT SELECT ON public.orders       TO anon, authenticated;
GRANT SELECT ON public.order_items  TO anon, authenticated;
GRANT SELECT ON public.order_events TO anon, authenticated;

-- Existing mutating RPCs that are NOT rewritten below still need server-side write authority
ALTER FUNCTION public.rpc_add_order_item(uuid, uuid, integer, text) SECURITY DEFINER;

-- rpc_apply_order_discount — converted to SECURITY DEFINER, and RAISE formatting fixed.
-- Note: in plpgsql RAISE, "%s" is *not* a specifier — it substitutes the argument and keeps
-- the literal "s" (e.g. "(preparings)"). The correct form is a bare "%".
CREATE OR REPLACE FUNCTION public.rpc_apply_order_discount(
    p_order_id UUID,
    p_discount_toman BIGINT,
    p_expected_version INT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
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
        RAISE EXCEPTION 'Discount (% Toman) cannot exceed order subtotal (% Toman)', p_discount_toman, v_subtotal;
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

-- ============================================================================
-- 3. rpc_create_order — race-safe + idempotent (F-05) + role gate
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_order(
    p_table_id UUID
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_branch_id UUID;
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_existing_order public.orders;
    v_new_order public.orders;
BEGIN
    IF v_rest_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or no restaurant associated with user';
    END IF;

    IF v_user_role NOT IN ('waiter', 'cashier', 'manager', 'owner') THEN
        RAISE EXCEPTION 'Kitchen staff cannot create orders';
    END IF;

    -- Verify table exists and belongs to user's restaurant
    SELECT branch_id INTO v_branch_id
    FROM public.dining_tables
    WHERE id = p_table_id AND restaurant_id = v_rest_id;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'Table not found in this restaurant';
    END IF;

    -- Serialize concurrent create attempts for the same table (audit F-05)
    PERFORM pg_advisory_xact_lock(hashtext('rpc_create_order:' || p_table_id::text)::bigint);

    -- Check if an active open or settling order already exists for this table
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE table_id = p_table_id AND status IN ('open', 'settling')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_order.id IS NOT NULL THEN
        RETURN v_existing_order;
    END IF;

    BEGIN
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
    EXCEPTION
        WHEN unique_violation THEN
            -- A concurrent transaction won the race; return its order (idempotent create)
            SELECT * INTO v_existing_order
            FROM public.orders
            WHERE table_id = p_table_id AND status IN ('open', 'settling')
            ORDER BY created_at DESC
            LIMIT 1;
            RETURN v_existing_order;
    END;

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

-- ============================================================================
-- 4. rpc_update_item_status — real cooking-lock transition matrix (F-04)
--    pending -> preparing -> ready -> served ; cancellations only via the cancel RPC;
--    cancelled/served are terminal; settled orders are frozen.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_item_status(
    p_item_id UUID,
    p_new_status item_status,
    p_expected_version INT
)
RETURNS public.order_items
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_item public.order_items;
    v_order_status order_status;
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

    -- Cancellation is never a "status transition" — it has its own gated RPC
    IF p_new_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cancellation must go through rpc_cancel_order_item (cooking lock)';
    END IF;

    IF v_item.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cancelled items cannot be reactivated';
    END IF;

    IF v_item.status = 'served' THEN
        RAISE EXCEPTION 'Served items are final';
    END IF;

    -- No item transitions on a settled order
    SELECT o.status INTO v_order_status
    FROM public.orders o
    WHERE o.id = v_item.order_id;

    IF v_order_status = 'paid' THEN
        RAISE EXCEPTION 'Order is already paid; items are locked';
    END IF;

    -- Transition matrix (status x role)
    IF p_new_status = 'preparing' THEN
        IF v_item.status <> 'pending' THEN
            RAISE EXCEPTION 'Invalid transition: % -> preparing', v_item.status;
        END IF;
        IF v_user_role NOT IN ('kitchen', 'manager', 'owner') THEN
            RAISE EXCEPTION 'Only kitchen staff or managers can set items to preparing';
        END IF;
    ELSIF p_new_status = 'ready' THEN
        IF v_item.status <> 'preparing' THEN
            RAISE EXCEPTION 'Invalid transition: % -> ready', v_item.status;
        END IF;
        IF v_user_role NOT IN ('kitchen', 'manager', 'owner') THEN
            RAISE EXCEPTION 'Only kitchen staff or managers can set items to ready';
        END IF;
    ELSIF p_new_status = 'served' THEN
        IF v_item.status <> 'ready' THEN
            RAISE EXCEPTION 'Only ready items can be marked as served';
        END IF;
        IF v_user_role NOT IN ('waiter', 'kitchen', 'manager', 'owner') THEN
            RAISE EXCEPTION 'Only floor or kitchen staff can mark items as served';
        END IF;
    ELSIF p_new_status = 'pending' THEN
        RAISE EXCEPTION 'Items cannot be reverted to pending';
    ELSE
        RAISE EXCEPTION 'Unsupported status transition to %', p_new_status;
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

-- ============================================================================
-- 5. rpc_cancel_order_item — SCOPE role matrix (F-04/F-07)
--    pending: floor/cashier/manager/owner can cancel (cooking not started)
--    preparing/ready: manager/owner only ("Kitchen has already started cooking…" otherwise)
--    served: final — nobody cancels a served item
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_cancel_order_item(
    p_item_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_expected_version INT DEFAULT NULL
)
RETURNS public.order_items
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_item public.order_items;
    v_order_status order_status;
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

    SELECT o.status INTO v_order_status
    FROM public.orders o
    WHERE o.id = v_item.order_id;

    IF v_order_status = 'paid' THEN
        RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: cannot cancel items of a settled order';
    END IF;

    -- COOKING LOCK matrix
    IF v_item.status = 'served' THEN
        RAISE EXCEPTION 'Served items are final and cannot be cancelled';
    ELSIF v_item.status IN ('preparing', 'ready') THEN
        IF v_user_role NOT IN ('manager', 'owner') THEN
            RAISE EXCEPTION 'Kitchen has already started cooking or served this item (%). Contact manager to cancel.', v_item.status;
        END IF;
    ELSIF v_item.status = 'pending' THEN
        IF v_user_role NOT IN ('waiter', 'cashier', 'manager', 'owner') THEN
            RAISE EXCEPTION 'Only floor or cashier staff can cancel pending items';
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

-- ============================================================================
-- 6. rpc_settle_order — checkout preconditions (F-02, F-14.4)
--    Requires status='settling' (the deliberate "lock for checkout" step) AND
--    an explicit expected version (no blind settle on a stale bill).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_settle_order(
    p_order_id UUID,
    p_discount_toman BIGINT DEFAULT NULL,
    p_expected_version INT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
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

    IF v_order.status <> 'settling' THEN
        RAISE EXCEPTION 'Order must be locked for checkout (settling) before payment';
    END IF;

    IF p_expected_version IS NULL THEN
        RAISE EXCEPTION 'Checkout requires the expected order version';
    END IF;

    IF v_order.version <> p_expected_version THEN
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

-- ============================================================================
-- 7. rpc_update_item_details — replaces the last direct-DML app path
--    (order-actions.ts updateOrderItemDetails). Edits only pending items,
--    enforces optimistic locking, and keeps the ORDER version in sync so a
--    stale checkout screen is rejected at settle time.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_item_details(
    p_item_id UUID,
    p_quantity INT,
    p_notes TEXT DEFAULT NULL,
    p_expected_version INT DEFAULT NULL
)
RETURNS public.order_items
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_rest_id UUID := public.current_restaurant_id();
    v_user_id UUID := auth.uid();
    v_user_role user_role := public.current_user_role();
    v_item public.order_items;
    v_order public.orders;
    v_updated_item public.order_items;
BEGIN
    IF v_user_role NOT IN ('waiter', 'cashier', 'manager', 'owner') THEN
        RAISE EXCEPTION 'Kitchen staff cannot edit order items';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    IF p_notes IS NOT NULL AND char_length(p_notes) > 250 THEN
        RAISE EXCEPTION 'Order item notes cannot exceed 250 characters';
    END IF;

    SELECT * INTO v_item
    FROM public.order_items
    WHERE id = p_item_id AND restaurant_id = v_rest_id
    FOR UPDATE;

    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Order item not found';
    END IF;

    IF p_expected_version IS NOT NULL AND v_item.version != p_expected_version THEN
        RAISE EXCEPTION 'Concurrency conflict: item was modified by another user (expected v%, current v%)',
            p_expected_version, v_item.version;
    END IF;

    IF v_item.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending items can be edited';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_item.order_id
    FOR UPDATE;

    IF v_order.status = 'paid' THEN
        RAISE EXCEPTION 'PAID_ORDER_IMMUTABLE: cannot edit items of a settled order';
    END IF;

    UPDATE public.order_items
    SET quantity = p_quantity,
        notes = p_notes,
        version = version + 1,
        updated_at = now()
    WHERE id = p_item_id
    RETURNING * INTO v_updated_item;

    -- Bump the order version so any in-flight checkout screen is invalidated
    UPDATE public.orders
    SET version = version + 1,
        updated_at = now()
    WHERE id = v_item.order_id;

    -- Audit event (KDS / cashier realtime listeners)
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
        'item_edited',
        jsonb_build_object(
            'item_id', p_item_id,
            'new_quantity', p_quantity,
            'new_notes', p_notes
        )
    );

    RETURN v_updated_item;
END;
$$;

-- ============================================================================
-- Verification ladder (run as an authenticated staff account via PostgREST):
--   1) PATCH /rest/v1/orders?id=eq.<id>                          -> 401/403 (permission denied)
--   2) POST  /rest/v1/order_items {unit_price_toman: 1, ...}     -> 401/403
--   3) POST  /rest/v1/order_events {actor_id: <anyone>, ...}     -> 401/403
--   4) rpc_update_item_status(p_new_status := 'cancelled')       -> raiseException (use cancel RPC)
--   5) PATCH a paid order                                        -> PAID_ORDER_IMMUTABLE
--   6) rpc_settle_order on an 'open' order                       -> "locked for checkout (settling)"
-- ============================================================================
