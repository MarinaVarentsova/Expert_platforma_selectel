-- =============================================================================
-- ПАЛАТА СУДЕБНЫХ ЭКСПЕРТОВ — RLS Policies (dev / anon read)
-- Запускать в Supabase SQL Editor.
-- Разрешает анонимному ключу читать все основные таблицы.
-- В проде заменить на политики с auth.uid().
-- =============================================================================

-- palata_users
ALTER TABLE palata_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_users" ON palata_users;
CREATE POLICY "anon_read_users"
    ON palata_users FOR SELECT TO anon USING (true);

-- palata_customer_profiles
ALTER TABLE palata_customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_customer_profiles" ON palata_customer_profiles;
CREATE POLICY "anon_read_customer_profiles"
    ON palata_customer_profiles FOR SELECT TO anon USING (true);

-- palata_expert_profiles
ALTER TABLE palata_expert_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_expert_profiles" ON palata_expert_profiles;
CREATE POLICY "anon_read_expert_profiles"
    ON palata_expert_profiles FOR SELECT TO anon USING (true);

-- palata_requests
ALTER TABLE palata_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_requests" ON palata_requests;
CREATE POLICY "anon_read_requests"
    ON palata_requests FOR SELECT TO anon USING (true);

-- palata_request_matches
ALTER TABLE palata_request_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_request_matches" ON palata_request_matches;
CREATE POLICY "anon_read_request_matches"
    ON palata_request_matches FOR SELECT TO anon USING (true);

-- palata_request_files
ALTER TABLE palata_request_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_request_files" ON palata_request_files;
CREATE POLICY "anon_read_request_files"
    ON palata_request_files FOR SELECT TO anon USING (true);

-- palata_request_contacts
ALTER TABLE palata_request_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_request_contacts" ON palata_request_contacts;
CREATE POLICY "anon_read_request_contacts"
    ON palata_request_contacts FOR SELECT TO anon USING (true);

-- palata_expert_documents
ALTER TABLE palata_expert_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_expert_documents" ON palata_expert_documents;
CREATE POLICY "anon_read_expert_documents"
    ON palata_expert_documents FOR SELECT TO anon USING (true);

-- palata_status_events
ALTER TABLE palata_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_status_events" ON palata_status_events;
CREATE POLICY "anon_read_status_events"
    ON palata_status_events FOR SELECT TO anon USING (true);

-- palata_expert_ratings
ALTER TABLE palata_expert_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_expert_ratings" ON palata_expert_ratings;
CREATE POLICY "anon_read_expert_ratings"
    ON palata_expert_ratings FOR SELECT TO anon USING (true);

-- palata_customer_ratings
ALTER TABLE palata_customer_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_customer_ratings" ON palata_customer_ratings;
CREATE POLICY "anon_read_customer_ratings"
    ON palata_customer_ratings FOR SELECT TO anon USING (true);

-- palata_email_events
ALTER TABLE palata_email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_email_events" ON palata_email_events;
CREATE POLICY "anon_read_email_events"
    ON palata_email_events FOR SELECT TO anon USING (true);
