-- Seed Data for Resteroassist
-- Multi-tenant demonstration: Cafe Restaurant Roohi vs. Charcoal Burger Hizom

-- Passwords for all demo accounts: Password123!
-- Crypt hash using blowfish:
-- crypt('Password123!', gen_salt('bf'))

-- Clean existing demo data safely
DELETE FROM auth.users WHERE email LIKE '%@roohi.ir' OR email LIKE '%@hizom.ir';
DELETE FROM public.restaurants WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

--------------------------------------------------------------------------------
-- 1. TENANT 1: Cafe Restaurant Roohi
--------------------------------------------------------------------------------

INSERT INTO public.restaurants (id, name, tax_rate, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'کافه رستوران روحی', 10.00, now());

-- Branches
INSERT INTO public.branches (id, restaurant_id, name, address, created_at) VALUES
('11111111-1111-1111-1111-222222222221', '11111111-1111-1111-1111-111111111111', 'شعبه باغ فردوس', 'تهران، خیابان ولیعصر، نرسیده به میدان تجریش، باغ فردوس', now()),
('11111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'شعبه شهرک غرب', 'تهران، شهرک غرب، بلوار دادمان', now());

-- Auth Users for Roohi
-- Manager: Reza Mohammadi
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'reza@roohi.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "11111111-1111-1111-1111-111111111111", "branch_id": "11111111-1111-1111-1111-222222222221", "role": "manager", "full_name": "رضا محمدی"}'::jsonb,
    '{"full_name": "رضا محمدی"}'::jsonb,
    now(),
    now()
);

-- Cashier: Sara Kazemi
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'sara@roohi.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "11111111-1111-1111-1111-111111111111", "branch_id": "11111111-1111-1111-1111-222222222221", "role": "cashier", "full_name": "سارا کاظمی"}'::jsonb,
    '{"full_name": "سارا کاظمی"}'::jsonb,
    now(),
    now()
);

-- Waiter 1: Amirhossein Rezaei
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'amir@roohi.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "11111111-1111-1111-1111-111111111111", "branch_id": "11111111-1111-1111-1111-222222222221", "role": "waiter", "full_name": "امیرحسین رضایی"}'::jsonb,
    '{"full_name": "امیرحسین رضایی"}'::jsonb,
    now(),
    now()
);

-- Waiter 2: Nima Alavi
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'nima@roohi.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "11111111-1111-1111-1111-111111111111", "branch_id": "11111111-1111-1111-1111-222222222221", "role": "waiter", "full_name": "نیما علوی"}'::jsonb,
    '{"full_name": "نیما علوی"}'::jsonb,
    now(),
    now()
);

-- Kitchen: Ostad Hassan
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'hassan@roohi.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "11111111-1111-1111-1111-111111111111", "branch_id": "11111111-1111-1111-1111-222222222221", "role": "kitchen", "full_name": "استاد حسن"}'::jsonb,
    '{"full_name": "استاد حسن"}'::jsonb,
    now(),
    now()
);

-- Staff Profiles for Roohi
INSERT INTO public.staff_profiles (id, restaurant_id, branch_id, full_name, role) VALUES
('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'رضا محمدی', 'manager'),
('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'سارا کاظمی', 'cashier'),
('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'امیرحسین رضایی', 'waiter'),
('10000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'نیما علوی', 'waiter'),
('10000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'استاد حسن', 'kitchen');

-- Tables for Roohi (Branch Bagh Ferdows)
INSERT INTO public.dining_tables (id, restaurant_id, branch_id, table_number, capacity) VALUES
('11111111-3333-1111-1111-000000000001', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'میز ۱', 2),
('11111111-3333-1111-1111-000000000002', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'میز ۲', 4),
('11111111-3333-1111-1111-000000000003', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'میز ۳', 4),
('11111111-3333-1111-1111-000000000004', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'میز ۴', 6),
('11111111-3333-1111-1111-000000000005', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'میز ۵', 2),
('11111111-3333-1111-1111-000000000012', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', 'میز ۱۲', 4);

-- Menu Items for Roohi
INSERT INTO public.menu_items (id, restaurant_id, category, name, price_toman, is_available) VALUES
('11111111-4444-1111-1111-000000000001', '11111111-1111-1111-1111-111111111111', 'غذاهای اصلی', 'کباب لقمه زعفرانی', 480000, true),
('11111111-4444-1111-1111-000000000002', '11111111-1111-1111-1111-111111111111', 'غذاهای اصلی', 'ته‌چین مرغ و بادمجان', 420000, true),
('11111111-4444-1111-1111-000000000003', '11111111-1111-1111-1111-111111111111', 'غذاهای اصلی', 'قیمه نثار قزوینی', 510000, true),
('11111111-4444-1111-1111-000000000004', '11111111-1111-1111-1111-111111111111', 'نوشیدنی', 'دوغ محلی کوزه‌ای', 65000, true),
('11111111-4444-1111-1111-000000000005', '11111111-1111-1111-1111-111111111111', 'نوشیدنی', 'شربت بیدمشک و بهارنارنج', 95000, true),
('11111111-4444-1111-1111-000000000006', '11111111-1111-1111-1111-111111111111', 'دسر و چای', 'چای و باقلوای قزوین', 120000, true);

--------------------------------------------------------------------------------
-- 2. TENANT 2: Charcoal Burger Hizom
--------------------------------------------------------------------------------

INSERT INTO public.restaurants (id, name, tax_rate, created_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'برگر زغالی هیزم', 10.00, now());

-- Branches
INSERT INTO public.branches (id, restaurant_id, name, address, created_at) VALUES
('22222222-2222-2222-2222-333333333331', '22222222-2222-2222-2222-222222222222', 'شعبه ونک', 'تهران، میدان ونک، خیابان ملاصدرا', now());

-- Auth Users for Hizom
-- Manager: Farhad Rahimi
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'farhad@hizom.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "22222222-2222-2222-2222-222222222222", "branch_id": "22222222-2222-2222-2222-333333333331", "role": "manager", "full_name": "فرهاد رحیمی"}'::jsonb,
    '{"full_name": "فرهاد رحیمی"}'::jsonb,
    now(),
    now()
);

-- Cashier: Kianoush Rad
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'kianoush@hizom.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "22222222-2222-2222-2222-222222222222", "branch_id": "22222222-2222-2222-2222-333333333331", "role": "cashier", "full_name": "کیانوش راد"}'::jsonb,
    '{"full_name": "کیانوش راد"}'::jsonb,
    now(),
    now()
);

-- Waiter: Mehdi Moradi
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'mehdi@hizom.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "22222222-2222-2222-2222-222222222222", "branch_id": "22222222-2222-2222-2222-333333333331", "role": "waiter", "full_name": "مهدی مرادی"}'::jsonb,
    '{"full_name": "مهدی مرادی"}'::jsonb,
    now(),
    now()
);

-- Kitchen: Ali Ashpaz
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '20000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ali@hizom.ir',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "restaurant_id": "22222222-2222-2222-2222-222222222222", "branch_id": "22222222-2222-2222-2222-333333333331", "role": "kitchen", "full_name": "علی آشپز"}'::jsonb,
    '{"full_name": "علی آشپز"}'::jsonb,
    now(),
    now()
);

-- Staff Profiles for Hizom
INSERT INTO public.staff_profiles (id, restaurant_id, branch_id, full_name, role) VALUES
('20000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'فرهاد رحیمی', 'manager'),
('20000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'کیانوش راد', 'cashier'),
('20000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'مهدی مرادی', 'waiter'),
('20000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'علی آشپز', 'kitchen');

-- Tables for Hizom (Branch Vanak)
INSERT INTO public.dining_tables (id, restaurant_id, branch_id, table_number, capacity) VALUES
('22222222-3333-2222-2222-000000000001', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'میز ۱', 2),
('22222222-3333-2222-2222-000000000002', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'میز ۲', 4),
('22222222-3333-2222-2222-000000000003', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-333333333331', 'میز ۳', 4);

-- Menu Items for Hizom
INSERT INTO public.menu_items (id, restaurant_id, category, name, price_toman, is_available) VALUES
('22222222-4444-2222-2222-000000000001', '22222222-2222-2222-2222-222222222222', 'برگر', 'دوبل چیزبرگر هیزم', 390000, true),
('22222222-4444-2222-2222-000000000002', '22222222-2222-2222-2222-222222222222', 'برگر', 'اسموکی بیکن برگر', 440000, true),
('22222222-4444-2222-2222-000000000003', '22222222-2222-2222-2222-222222222222', 'پیش‌غذا و ساید', 'سیب‌زمینی سرخ‌کرده ترافل', 180000, true),
('22222222-4444-2222-2222-000000000004', '22222222-2222-2222-2222-222222222222', 'نوشیدنی', 'لیموناد دست‌ساز', 75000, true);

--------------------------------------------------------------------------------
-- 3. INITIAL SHIFT STATE (Orders & Items)
--------------------------------------------------------------------------------

-- ROOHI: Table 4 (In Service - 3 items)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES (
    '11111111-5555-1111-1111-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-222222222221',
    '11111111-3333-1111-1111-000000000004',
    'open',
    0,
    3,
    '10000000-0000-0000-0000-000000000003', -- Amir (Waiter 1)
    now() - interval '25 minutes',
    now() - interval '10 minutes'
);

-- Items for Table 4:
-- 1. Kabab Loghmeh Zaferani x2 (preparing)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '11111111-6666-1111-1111-000000000041',
    '11111111-5555-1111-1111-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '11111111-4444-1111-1111-000000000001',
    2,
    480000,
    'کره اضافه',
    'preparing',
    2,
    '10000000-0000-0000-0000-000000000003',
    now() - interval '25 minutes'
);

-- 2. Tahchin Morgh va Badamjan x1 (pending)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '11111111-6666-1111-1111-000000000042',
    '11111111-5555-1111-1111-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '11111111-4444-1111-1111-000000000002',
    1,
    420000,
    'بدون بادمجان برای حساسیت',
    'pending',
    1,
    '10000000-0000-0000-0000-000000000004', -- Nima (Waiter 2 added concurrently!)
    now() - interval '18 minutes'
);

-- 3. Doogh Mahalli Koozeei x2 (ready)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '11111111-6666-1111-1111-000000000043',
    '11111111-5555-1111-1111-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '11111111-4444-1111-1111-000000000004',
    2,
    65000,
    'لیوان با یخ زیاد',
    'ready',
    2,
    '10000000-0000-0000-0000-000000000003',
    now() - interval '20 minutes'
);

-- ROOHI: Table 12 (Ready for Checkout / Settling with note "Doogh without mint")
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES (
    '11111111-5555-1111-1111-000000000012',
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-222222222221',
    '11111111-3333-1111-1111-000000000012',
    'settling',
    50000, -- 50,000 Toman discount already applied by cashier
    2,
    '10000000-0000-0000-0000-000000000003',
    now() - interval '45 minutes',
    now() - interval '5 minutes'
);

-- Items for Table 12:
-- 1. Gheymeh Nesar x2 (served)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '11111111-6666-1111-1111-000000000121',
    '11111111-5555-1111-1111-000000000012',
    '11111111-1111-1111-1111-111111111111',
    '11111111-4444-1111-1111-000000000003',
    2,
    510000,
    'خلال پسته فراوان',
    'served',
    3,
    '10000000-0000-0000-0000-000000000003',
    now() - interval '45 minutes'
);

-- 2. Doogh Mahalli Koozeei x2 with note "Doogh without mint" (served)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '11111111-6666-1111-1111-000000000122',
    '11111111-5555-1111-1111-000000000012',
    '11111111-1111-1111-1111-111111111111',
    '11111111-4444-1111-1111-000000000004',
    2,
    65000,
    'دوغ بدون نعنا',
    'served',
    3,
    '10000000-0000-0000-0000-000000000003',
    now() - interval '40 minutes'
);

-- 3. Chai va Baghlava Qazvin x1 (served)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '11111111-6666-1111-1111-000000000123',
    '11111111-5555-1111-1111-000000000012',
    '11111111-1111-1111-1111-111111111111',
    '11111111-4444-1111-1111-000000000006',
    1,
    120000,
    'چای دمی تازه‌دم',
    'served',
    3,
    '10000000-0000-0000-0000-000000000004',
    now() - interval '15 minutes'
);

-- ROOHI: 5 Paid Orders from Today Noon
-- Order 1: Table 1 (Paid)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES ('11111111-5555-1111-1111-000000000101', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', '11111111-3333-1111-1111-000000000001', 'paid', 0, 2, '10000000-0000-0000-0000-000000000003', now() - interval '4 hours', now() - interval '3 hours 15 minutes');
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, status, version, added_by, created_at)
VALUES ('11111111-6666-1111-1111-000000001011', '11111111-5555-1111-1111-000000000101', '11111111-1111-1111-1111-111111111111', '11111111-4444-1111-1111-000000000001', 1, 480000, 'served', 2, '10000000-0000-0000-0000-000000000003', now() - interval '4 hours');

-- Order 2: Table 2 (Paid)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES ('11111111-5555-1111-1111-000000000102', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', '11111111-3333-1111-1111-000000000002', 'paid', 20000, 2, '10000000-0000-0000-0000-000000000003', now() - interval '3 hours 40 minutes', now() - interval '2 hours 50 minutes');
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, status, version, added_by, created_at)
VALUES ('11111111-6666-1111-1111-000000001021', '11111111-5555-1111-1111-000000000102', '11111111-1111-1111-1111-111111111111', '11111111-4444-1111-1111-000000000002', 2, 420000, 'served', 2, '10000000-0000-0000-0000-000000000003', now() - interval '3 hours 40 minutes');

-- Order 3: Table 3 (Paid)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES ('11111111-5555-1111-1111-000000000103', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', '11111111-3333-1111-1111-000000000003', 'paid', 0, 2, '10000000-0000-0000-0000-000000000004', now() - interval '3 hours 10 minutes', now() - interval '2 hours 20 minutes');
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, status, version, added_by, created_at)
VALUES ('11111111-6666-1111-1111-000000001031', '11111111-5555-1111-1111-000000000103', '11111111-1111-1111-1111-111111111111', '11111111-4444-1111-1111-000000000003', 1, 510000, 'served', 2, '10000000-0000-0000-0000-000000000004', now() - interval '3 hours 10 minutes');

-- Order 4: Table 5 (Paid)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES ('11111111-5555-1111-1111-000000000104', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', '11111111-3333-1111-1111-000000000005', 'paid', 0, 2, '10000000-0000-0000-0000-000000000003', now() - interval '2 hours 30 minutes', now() - interval '1 hour 45 minutes');
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, status, version, added_by, created_at)
VALUES ('11111111-6666-1111-1111-000000001041', '11111111-5555-1111-1111-000000000104', '11111111-1111-1111-1111-111111111111', '11111111-4444-1111-1111-000000000005', 2, 95000, 'served', 2, '10000000-0000-0000-0000-000000000003', now() - interval '2 hours 30 minutes');

-- Order 5: Table 1 (Paid)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES ('11111111-5555-1111-1111-000000000105', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-222222222221', '11111111-3333-1111-1111-000000000001', 'paid', 10000, 2, '10000000-0000-0000-0000-000000000004', now() - interval '1 hour 40 minutes', now() - interval '1 hour');
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, status, version, added_by, created_at)
VALUES ('11111111-6666-1111-1111-000000001051', '11111111-5555-1111-1111-000000000105', '11111111-1111-1111-1111-111111111111', '11111111-4444-1111-1111-000000000006', 2, 120000, 'served', 2, '10000000-0000-0000-0000-000000000004', now() - interval '1 hour 40 minutes');

-- HIZOM: Table 2 (In Service with 2 burgers)
INSERT INTO public.orders (id, restaurant_id, branch_id, table_id, status, discount_toman, version, created_by, created_at, updated_at)
VALUES (
    '22222222-5555-2222-2222-000000000002',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-333333333331',
    '22222222-3333-2222-2222-000000000002',
    'open',
    0,
    2,
    '20000000-0000-0000-0000-000000000003', -- Mehdi (Waiter)
    now() - interval '15 minutes',
    now() - interval '5 minutes'
);

-- Items for Hizom Table 2:
-- 1. Double Cheeseburger x2 (preparing)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '22222222-6666-2222-2222-000000000021',
    '22222222-5555-2222-2222-000000000002',
    '22222222-2222-2222-2222-222222222222',
    '22222222-4444-2222-2222-000000000001',
    2,
    390000,
    'مدیوم‌ول، بدون پیاز کاراملی',
    'preparing',
    2,
    '20000000-0000-0000-0000-000000000003',
    now() - interval '15 minutes'
);

-- 2. Truffle Fries x1 (ready)
INSERT INTO public.order_items (id, order_id, restaurant_id, menu_item_id, quantity, unit_price_toman, notes, status, version, added_by, created_at)
VALUES (
    '22222222-6666-2222-2222-000000000022',
    '22222222-5555-2222-2222-000000000002',
    '22222222-2222-2222-2222-222222222222',
    '22222222-4444-2222-2222-000000000003',
    1,
    180000,
    'سس ترافل اضافه',
    'ready',
    2,
    '20000000-0000-0000-0000-000000000003',
    now() - interval '10 minutes'
);

-- Update default tokens for GoTrue v2 compatibility
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  is_sso_user = COALESCE(is_sso_user, false),
  is_anonymous = COALESCE(is_anonymous, false);

-- Link auth identities
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT 
  id, 
  id, 
  jsonb_build_object('sub', id::text, 'email', email), 
  'email', 
  id::text, 
  now(), 
  now(), 
  now()
FROM auth.users
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Log initial audit trail events
INSERT INTO public.order_events (restaurant_id, order_id, actor_id, event_type, payload, created_at)
VALUES
('11111111-1111-1111-1111-111111111111', '11111111-5555-1111-1111-000000000004', '10000000-0000-0000-0000-000000000003', 'order_created', '{"table_number": "میز ۴"}'::jsonb, now() - interval '25 minutes'),
('11111111-1111-1111-1111-111111111111', '11111111-5555-1111-1111-000000000012', '10000000-0000-0000-0000-000000000003', 'order_created', '{"table_number": "میز ۱۲"}'::jsonb, now() - interval '45 minutes'),
('11111111-1111-1111-1111-111111111111', '11111111-5555-1111-1111-000000000012', '10000000-0000-0000-0000-000000000002', 'discount_applied', '{"discount_toman": 50000}'::jsonb, now() - interval '5 minutes'),
('22222222-2222-2222-2222-222222222222', '22222222-5555-2222-2222-000000000002', '20000000-0000-0000-0000-000000000003', 'order_created', '{"table_number": "میز ۲"}'::jsonb, now() - interval '15 minutes');

