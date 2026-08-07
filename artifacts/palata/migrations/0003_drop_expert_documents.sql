-- Migration: drop palata_expert_documents table
-- Status: PREPARED — do NOT execute automatically.
--
-- The expert document upload subsystem has been removed from the application.
-- The table palata_expert_documents is no longer written to by any production code.
--
-- Before running this migration on production:
--   1. Verify no rows exist (or confirm they can be discarded):
--        SELECT COUNT(*) FROM public.palata_expert_documents;
--   2. Apply manually via:
--        psql $PALATA_DATABASE_URL -f migrations/0003_drop_expert_documents.sql
--
-- The table has one FK: expert_id → palata_users(id) ON DELETE CASCADE.
-- No other tables reference palata_expert_documents.
-- The trigger trg_palata_expert_documents_updated_at is dropped automatically with the table.

DROP TABLE IF EXISTS public.palata_expert_documents;
