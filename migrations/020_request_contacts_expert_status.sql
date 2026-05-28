-- =============================================================================
-- Migration 020: Add contact_opened_at and expert_status to palata_request_contacts
-- Run in Supabase SQL Editor
-- =============================================================================

ALTER TABLE palata_request_contacts
    ADD COLUMN IF NOT EXISTS contact_opened_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expert_status       TEXT;

COMMENT ON COLUMN palata_request_contacts.contact_opened_at IS
    'Timestamp when the customer opened contacts with this expert';

COMMENT ON COLUMN palata_request_contacts.expert_status IS
    'Expert status in this contact record (e.g. selected_by_customer, accepted_work)';

-- Populate contact_opened_at for existing records from revealed_at fallback
UPDATE palata_request_contacts
SET contact_opened_at = revealed_at
WHERE contact_opened_at IS NULL AND revealed_at IS NOT NULL;
