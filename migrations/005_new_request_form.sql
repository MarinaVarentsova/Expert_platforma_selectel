-- =============================================================================
-- Migration 005: Customer request form support
-- Safe: only adds nullable columns and drops NOT NULL constraints
-- =============================================================================

-- 1. New order status for freshly submitted requests
ALTER TYPE palata_order_status ADD VALUE IF NOT EXISTS 'new';

-- 2. Make customer_id nullable (no auth yet — form creates anonymous requests)
ALTER TABLE palata_requests
    ALTER COLUMN customer_id DROP NOT NULL;

-- 3. New form fields (all nullable so existing rows are unaffected)
ALTER TABLE palata_requests
    ADD COLUMN IF NOT EXISTS requires_travel    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS urgency            TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS materials_available TEXT,
    ADD COLUMN IF NOT EXISTS customer_name      TEXT,
    ADD COLUMN IF NOT EXISTS customer_phone     TEXT,
    ADD COLUMN IF NOT EXISTS customer_email     TEXT;

COMMENT ON COLUMN palata_requests.urgency IS
    'One of: normal | urgent | very_urgent';
COMMENT ON COLUMN palata_requests.requires_travel IS
    'Whether the expert needs to visit the site';

-- 4. Make uploader_id nullable (anonymous file uploads before auth is added)
ALTER TABLE palata_request_files
    ALTER COLUMN uploader_id DROP NOT NULL;

-- =============================================================================
-- 5. Storage bucket — run this block in Supabase SQL Editor
--    (requires storage extension; skip if bucket already exists)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'palata-request-files',
    'palata-request-files',
    TRUE,
    52428800,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- 6. Permissive storage policy for dev (tighten when auth is added)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'objects' AND schemaname = 'storage'
          AND policyname = 'palata_request_files_dev_all'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY "palata_request_files_dev_all"
            ON storage.objects FOR ALL TO public
            USING (bucket_id = 'palata-request-files')
            WITH CHECK (bucket_id = 'palata-request-files');
        $policy$;
    END IF;
END $$;
