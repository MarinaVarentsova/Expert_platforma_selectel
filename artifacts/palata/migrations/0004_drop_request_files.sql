-- Migration: drop palata_request_files table
-- Status: PREPARED — do NOT execute automatically.
--
-- The request file upload subsystem has been removed from the application.
-- The table palata_request_files is no longer written to by any production code.
-- No frontend routes, no backend endpoints, no multer dependency.
--
-- Before running this migration on production:
--   1. Verify no rows exist (or confirm they can be discarded):
--        SELECT COUNT(*) FROM public.palata_request_files;
--   2. Apply manually via:
--        psql $PALATA_DATABASE_URL -f migrations/0004_drop_request_files.sql
--
-- The table has two FKs:
--   request_id  → palata_requests(id) ON DELETE CASCADE
--   uploader_id → palata_users(id)
-- No other tables reference palata_request_files.
-- No triggers on this table.

DROP TABLE IF EXISTS public.palata_request_files;
