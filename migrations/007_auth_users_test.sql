-- =============================================================================
-- Migration 007: Create Supabase Auth users for test accounts
-- 
-- IMPORTANT: Run this in the Supabase SQL Editor (not via Drizzle/psql).
-- This touches auth.* schema which is managed by Supabase internally.
--
-- Creates auth.users entries with UUIDs that match palata_users.id,
-- so auth.users.id = palata_users.id and role is loaded by the app.
--
-- Test accounts after this migration:
--   Варенцова Марина    — varentsovsmv@gmail.com    / Test1234!  (customer)
--   Подшивайлова Анна   — podshivailovaann@gmail.com / Test1234!  (expert)
-- =============================================================================

-- Step 1: Create auth.users rows with matching IDs
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
)
VALUES
(
    '00000002-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'varentsovsmv@gmail.com',
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Варенцова Марина"}',
    NOW(), NOW(),
    '', '', '', ''
),
(
    '00000001-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'podshivailovaann@gmail.com',
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Подшивайлова Анна"}',
    NOW(), NOW(),
    '', '', '', ''
)
ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at  = COALESCE(auth.users.email_confirmed_at, NOW()),
        updated_at          = NOW();

-- Step 2: Create auth.identities rows (needed for email/password sign-in)
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
)
VALUES
(
    '00000002-0000-0000-0000-000000000006',
    '00000002-0000-0000-0000-000000000006',
    jsonb_build_object(
        'sub',   '00000002-0000-0000-0000-000000000006',
        'email', 'varentsovsmv@gmail.com'
    ),
    'email',
    'varentsovsmv@gmail.com',
    NOW(), NOW(), NOW()
),
(
    '00000001-0000-0000-0000-000000000011',
    '00000001-0000-0000-0000-000000000011',
    jsonb_build_object(
        'sub',   '00000001-0000-0000-0000-000000000011',
        'email', 'podshivailovaann@gmail.com'
    ),
    'email',
    'podshivailovaann@gmail.com',
    NOW(), NOW(), NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;
