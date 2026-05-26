-- =============================================================================
-- Migration 012: Align palata_users.id with auth.users.id + proper RLS
--
-- Problem: palata_users rows were created with synthetic UUIDs before auth was
-- connected. Auth users were later created with different UUIDs. The app can't
-- match session.user.id → palata_users.id.
--
-- Fix:
--   1. Update palata_users.id and all FK references to match real auth UUIDs.
--      Uses session_replication_role=replica to bypass FK constraint checks
--      (same approach as migration 006).
--   2. Drop old anon-only and email-based RLS policies; add proper ones using
--      auth.uid() = id.
--
-- Auth UUIDs (from Supabase Dashboard → Authentication → Users):
--   podshivailovaann@gmail.com  →  13fdcded-0ba9-4baf-bac8-497054fa9082  (expert)
--   varentsovsmv@gmail.com      →  55469b80-387d-4ef6-b03c-f56ca48bfab8  (customer)
--
-- Run in Supabase SQL Editor.
-- =============================================================================

SET session_replication_role = replica;

-- ── 1. Update palata_users primary keys ──────────────────────────────────────

UPDATE palata_users
SET id = '13fdcded-0ba9-4baf-bac8-497054fa9082', updated_at = NOW()
WHERE email = 'podshivailovaann@gmail.com';

UPDATE palata_users
SET id = '55469b80-387d-4ef6-b03c-f56ca48bfab8', updated_at = NOW()
WHERE email = 'varentsovsmv@gmail.com';

-- ── 2. Cascade FK updates: palata_expert_profiles ────────────────────────────

UPDATE palata_expert_profiles
SET user_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE user_id = '00000001-0000-0000-0000-000000000011';

-- ── 3. Cascade FK updates: palata_customer_profiles ──────────────────────────

UPDATE palata_customer_profiles
SET user_id = '55469b80-387d-4ef6-b03c-f56ca48bfab8'
WHERE user_id = '00000002-0000-0000-0000-000000000006';

-- ── 4. Cascade FK updates: palata_requests ───────────────────────────────────

UPDATE palata_requests
SET customer_id = '55469b80-387d-4ef6-b03c-f56ca48bfab8'
WHERE customer_id = '00000002-0000-0000-0000-000000000006';

UPDATE palata_requests
SET assigned_expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE assigned_expert_id = '00000001-0000-0000-0000-000000000011';

-- ── 5. Cascade FK updates: palata_request_matches ────────────────────────────

UPDATE palata_request_matches
SET expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE expert_id = '00000001-0000-0000-0000-000000000011';

-- ── 6. Cascade FK updates: palata_request_contacts ───────────────────────────

UPDATE palata_request_contacts
SET expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE expert_id = '00000001-0000-0000-0000-000000000011';

UPDATE palata_request_contacts
SET customer_id = '55469b80-387d-4ef6-b03c-f56ca48bfab8'
WHERE customer_id = '00000002-0000-0000-0000-000000000006';

-- ── 7. Cascade FK updates: palata_status_events ──────────────────────────────

UPDATE palata_status_events
SET actor_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE actor_id = '00000001-0000-0000-0000-000000000011';

UPDATE palata_status_events
SET actor_id = '55469b80-387d-4ef6-b03c-f56ca48bfab8'
WHERE actor_id = '00000002-0000-0000-0000-000000000006';

-- ── 8. Cascade FK updates: palata_email_events (if exists) ───────────────────

UPDATE palata_email_events
SET expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE expert_id = '00000001-0000-0000-0000-000000000011';

SET session_replication_role = DEFAULT;

-- ── 9. RLS — drop old policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_read_users"        ON palata_users;
DROP POLICY IF EXISTS "auth_read_users"        ON palata_users;
DROP POLICY IF EXISTS "auth_update_own_user"   ON palata_users;

-- ── 10. RLS — palata_users: proper policies ───────────────────────────────────
--
-- SELECT: any authenticated user can read all rows (app shows expert/customer
--         info across the platform — admin sees all, experts see customer, etc.)
-- UPDATE: only own row (auth.uid() = id)
-- INSERT: service-level only (no policy = blocked from client)

CREATE POLICY "authenticated_read_all_users"
    ON palata_users
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "authenticated_update_own_user"
    ON palata_users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ── 11. Ensure write policies exist on other tables for authenticated ─────────
--  (Migration 011 already added SELECT; these add missing INSERT/UPDATE)

-- palata_requests
DROP POLICY IF EXISTS "auth_insert_requests" ON palata_requests;
CREATE POLICY "auth_insert_requests"
    ON palata_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_requests" ON palata_requests;
CREATE POLICY "auth_update_requests"
    ON palata_requests FOR UPDATE TO authenticated USING (true);

-- palata_request_matches
DROP POLICY IF EXISTS "auth_insert_matches" ON palata_request_matches;
CREATE POLICY "auth_insert_matches"
    ON palata_request_matches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_matches" ON palata_request_matches;
CREATE POLICY "auth_update_matches"
    ON palata_request_matches FOR UPDATE TO authenticated USING (true);

-- palata_request_contacts
DROP POLICY IF EXISTS "auth_insert_request_contacts" ON palata_request_contacts;
CREATE POLICY "auth_insert_request_contacts"
    ON palata_request_contacts FOR INSERT TO authenticated WITH CHECK (true);

-- palata_status_events
DROP POLICY IF EXISTS "auth_insert_status_events" ON palata_status_events;
CREATE POLICY "auth_insert_status_events"
    ON palata_status_events FOR INSERT TO authenticated WITH CHECK (true);

-- palata_request_files
DROP POLICY IF EXISTS "auth_insert_request_files" ON palata_request_files;
CREATE POLICY "auth_insert_request_files"
    ON palata_request_files FOR INSERT TO authenticated WITH CHECK (true);

-- ── 12. Verify ───────────────────────────────────────────────────────────────

SELECT
    pu.id              AS palata_id,
    pu.email,
    pu.role,
    pu.full_name,
    (pu.id::text = au.id::text) AS id_matches_auth
FROM palata_users pu
LEFT JOIN auth.users au ON au.email = pu.email
WHERE pu.email IN ('podshivailovaann@gmail.com', 'varentsovsmv@gmail.com');
