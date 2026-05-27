-- =============================================================================
-- Migration 014: Fix auth.users for Anna & Marina test accounts
--
-- Problem: auth.users UUIDs don't match palata_users.id from migration 013.
-- Migration 013 uses:
--   MARINA_ID = 55469b80-387d-4ef6-b03c-f56ca48bfab8  (varentsovsmv@gmail.com)
--   ANN_ID    = 13fdcded-0ba9-4baf-bac8-497054fa9082  (podshivailovaann@gmail.com)
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to repeat: uses ON CONFLICT DO UPDATE.
-- =============================================================================

-- ── Step 1: Remove any stale identities and auth.users for these emails ──────
DELETE FROM auth.identities
WHERE provider = 'email'
  AND provider_id IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');

DELETE FROM auth.users
WHERE email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');

-- ── Step 2: Create auth.users with IDs matching palata_users.id ─────────────
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
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',      -- Marina UUID = palata_users.id
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
    '13fdcded-0ba9-4baf-bac8-497054fa9082',      -- Anna UUID = palata_users.id
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

-- ── Step 3: Create auth.identities (required for email/password sign-in) ─────
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
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',
    jsonb_build_object('sub', '55469b80-387d-4ef6-b03c-f56ca48bfab8', 'email', 'varentsovsmv@gmail.com'),
    'email',
    'varentsovsmv@gmail.com',
    NOW(), NOW(), NOW()
),
(
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    jsonb_build_object('sub', '13fdcded-0ba9-4baf-bac8-497054fa9082', 'email', 'podshivailovaann@gmail.com'),
    'email',
    'podshivailovaann@gmail.com',
    NOW(), NOW(), NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ── Step 4: Also ensure palata_users exist with correct IDs ──────────────────
-- (guards against palata_users missing or having wrong UUIDs)
INSERT INTO palata_users (id, role, email, full_name, phone, is_active)
VALUES
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8', 'customer', 'varentsovsmv@gmail.com',    'Варенцова Марина Варенцова',     '+79161234567', TRUE),
    ('13fdcded-0ba9-4baf-bac8-497054fa9082', 'expert',   'podshivailovaann@gmail.com', 'Подшивайлова Анна Подшивайлова', '+79031234567', TRUE)
ON CONFLICT (id) DO UPDATE
    SET role       = EXCLUDED.role,
        email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        is_active  = TRUE;

-- ── Step 5: Verify — should return 2 rows, ids_match = TRUE ──────────────────
SELECT
    au.id           AS auth_id,
    pu.id           AS palata_id,
    au.id = pu.id   AS ids_match,
    au.email,
    pu.role,
    au.email_confirmed_at IS NOT NULL AS confirmed,
    EXISTS (
        SELECT 1 FROM auth.identities ai
        WHERE ai.user_id = au.id AND ai.provider = 'email'
    ) AS has_identity
FROM auth.users au
JOIN palata_users pu ON pu.id = au.id
WHERE au.email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');
