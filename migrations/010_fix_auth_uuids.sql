-- =============================================================================
-- Migration 010: Fix auth.users UUID mismatch
--
-- Problem: Supabase Auth created users with auto-generated UUIDs that don't
-- match palata_users.id. The app looks up roles by session.user.id = palata_users.id,
-- so login succeeds in Supabase but the app can't find the user record.
--
-- Fix: delete the mismatched auth.users rows and recreate using the UUIDs
-- that are already in palata_users.
--
-- Run in Supabase SQL Editor.
-- =============================================================================

-- ── Step 1: Remove existing auth rows (wrong UUIDs) ─────────────────────────
DELETE FROM auth.identities
WHERE provider = 'email'
  AND provider_id IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');

DELETE FROM auth.users
WHERE email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');

-- ── Step 2: Recreate auth.users with UUIDs that match palata_users.id ────────
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
WHERE pu.email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');

-- ── Step 3: Recreate auth.identities (required for email/password login) ─────
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
    pu.id,
    pu.id,
    jsonb_build_object('sub', pu.id::text, 'email', pu.email),
    'email',
    pu.email,
    NOW(), NOW(), NOW()
FROM palata_users pu
WHERE pu.email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');

-- ── Step 4: Verify — both rows must show ids_match = true ────────────────────
SELECT
    au.id           AS auth_id,
    pu.id           AS palata_id,
    (au.id = pu.id) AS ids_match,
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
