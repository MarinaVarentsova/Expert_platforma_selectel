-- =============================================================================
-- Migration 009: Fix / reset passwords for test accounts
--
-- Run in Supabase SQL Editor.
-- Works regardless of how the auth.users rows were originally created.
-- =============================================================================

-- ── Step 1: Reset passwords by email (safe — doesn't touch UUIDs) ───────────
UPDATE auth.users
SET
    encrypted_password  = crypt('Test1234!', gen_salt('bf')),
    email_confirmed_at  = COALESCE(email_confirmed_at, NOW()),
    updated_at          = NOW()
WHERE email IN (
    'varentsovsmv@gmail.com',
    'podshivailovaann@gmail.com'
);

-- ── Step 2: If rows don't exist at all — create them from scratch ────────────
-- This uses the IDs that match palata_users.id so the app can load roles.
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
SELECT
    pu.id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    pu.email,
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', pu.full_name),
    NOW(), NOW(),
    '', '', '', ''
FROM palata_users pu
WHERE pu.email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com')
  AND NOT EXISTS (
      SELECT 1 FROM auth.users au WHERE au.email = pu.email
  );

-- ── Step 3: Ensure auth.identities exist (required for email sign-in) ────────
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
SELECT
    au.id,
    au.id,
    jsonb_build_object('sub', au.id::text, 'email', au.email),
    'email',
    au.email,
    NOW(), NOW(), NOW()
FROM auth.users au
WHERE au.email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com')
  AND NOT EXISTS (
      SELECT 1 FROM auth.identities ai
      WHERE ai.provider = 'email' AND ai.provider_id = au.email
  );

-- ── Step 4: Verify — should return 2 rows with matching IDs ──────────────────
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
    )               AS has_identity
FROM auth.users au
JOIN palata_users pu ON pu.email = au.email
WHERE au.email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');
