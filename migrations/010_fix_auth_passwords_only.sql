-- =============================================================================
-- Migration 010: Reset passwords for existing auth users (safe — no UUID changes)
--
-- The auth.users rows already exist with their own UUIDs.
-- We just reset the password so Test1234! works.
-- The app now looks up palata_users by email, so UUID mismatch is no longer
-- an issue.
--
-- Run in Supabase SQL Editor.
-- =============================================================================

UPDATE auth.users
SET
    encrypted_password = crypt('Test1234!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at         = NOW()
WHERE email IN (
    'varentsovsmv@gmail.com',
    'podshivailovaann@gmail.com'
);

-- Verify — should return 2 rows, both confirmed = true
SELECT
    id,
    email,
    email_confirmed_at IS NOT NULL AS confirmed,
    updated_at
FROM auth.users
WHERE email IN ('varentsovsmv@gmail.com', 'podshivailovaann@gmail.com');
