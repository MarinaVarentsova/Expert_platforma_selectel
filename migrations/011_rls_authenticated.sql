-- =============================================================================
-- Migration 011: Add RLS policies for authenticated users
--
-- Migration 002 only granted SELECT to the 'anon' role.
-- After login, Supabase uses the 'authenticated' role — which had no policies,
-- so all reads were blocked (→ 406) and the app couldn't load user data.
--
-- Run in Supabase SQL Editor.
-- =============================================================================

-- palata_users
DROP POLICY IF EXISTS "auth_read_users" ON palata_users;
CREATE POLICY "auth_read_users"
    ON palata_users FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to update their own record
DROP POLICY IF EXISTS "auth_update_own_user" ON palata_users;
CREATE POLICY "auth_update_own_user"
    ON palata_users FOR UPDATE TO authenticated
    USING (email = auth.jwt() ->> 'email');

-- palata_customer_profiles
DROP POLICY IF EXISTS "auth_read_customer_profiles" ON palata_customer_profiles;
CREATE POLICY "auth_read_customer_profiles"
    ON palata_customer_profiles FOR SELECT TO authenticated USING (true);

-- palata_expert_profiles
DROP POLICY IF EXISTS "auth_read_expert_profiles" ON palata_expert_profiles;
CREATE POLICY "auth_read_expert_profiles"
    ON palata_expert_profiles FOR SELECT TO authenticated USING (true);

-- palata_requests — read all, insert own
DROP POLICY IF EXISTS "auth_read_requests" ON palata_requests;
CREATE POLICY "auth_read_requests"
    ON palata_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_requests" ON palata_requests;
CREATE POLICY "auth_insert_requests"
    ON palata_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_requests" ON palata_requests;
CREATE POLICY "auth_update_requests"
    ON palata_requests FOR UPDATE TO authenticated USING (true);

-- palata_request_matches
DROP POLICY IF EXISTS "auth_read_matches" ON palata_request_matches;
CREATE POLICY "auth_read_matches"
    ON palata_request_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_matches" ON palata_request_matches;
CREATE POLICY "auth_insert_matches"
    ON palata_request_matches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_matches" ON palata_request_matches;
CREATE POLICY "auth_update_matches"
    ON palata_request_matches FOR UPDATE TO authenticated USING (true);

-- palata_request_files
DROP POLICY IF EXISTS "auth_read_request_files" ON palata_request_files;
CREATE POLICY "auth_read_request_files"
    ON palata_request_files FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_request_files" ON palata_request_files;
CREATE POLICY "auth_insert_request_files"
    ON palata_request_files FOR INSERT TO authenticated WITH CHECK (true);

-- palata_request_contacts
DROP POLICY IF EXISTS "auth_read_request_contacts" ON palata_request_contacts;
CREATE POLICY "auth_read_request_contacts"
    ON palata_request_contacts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_request_contacts" ON palata_request_contacts;
CREATE POLICY "auth_insert_request_contacts"
    ON palata_request_contacts FOR INSERT TO authenticated WITH CHECK (true);

-- palata_expert_documents
DROP POLICY IF EXISTS "auth_read_expert_documents" ON palata_expert_documents;
CREATE POLICY "auth_read_expert_documents"
    ON palata_expert_documents FOR SELECT TO authenticated USING (true);

-- palata_status_events
DROP POLICY IF EXISTS "auth_read_status_events" ON palata_status_events;
CREATE POLICY "auth_read_status_events"
    ON palata_status_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_status_events" ON palata_status_events;
CREATE POLICY "auth_insert_status_events"
    ON palata_status_events FOR INSERT TO authenticated WITH CHECK (true);

-- palata_expert_ratings
DROP POLICY IF EXISTS "auth_read_expert_ratings" ON palata_expert_ratings;
CREATE POLICY "auth_read_expert_ratings"
    ON palata_expert_ratings FOR SELECT TO authenticated USING (true);

-- palata_customer_ratings
DROP POLICY IF EXISTS "auth_read_customer_ratings" ON palata_customer_ratings;
CREATE POLICY "auth_read_customer_ratings"
    ON palata_customer_ratings FOR SELECT TO authenticated USING (true);

-- palata_email_events (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'palata_email_events') THEN
        DROP POLICY IF EXISTS "auth_read_email_events" ON palata_email_events;
        CREATE POLICY "auth_read_email_events"
            ON palata_email_events FOR SELECT TO authenticated USING (true);
    END IF;
END;
$$;

-- ── Verify: list all policies on palata_users ─────────────────────────────────
SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'palata_users' ORDER BY policyname;
