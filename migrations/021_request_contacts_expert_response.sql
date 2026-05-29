-- =============================================================================
-- Migration 021: Add expert response fields to palata_request_contacts
-- Run in Supabase SQL Editor
-- =============================================================================

ALTER TABLE palata_request_contacts
    ADD COLUMN IF NOT EXISTS expert_status_updated_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_reason             TEXT,
    ADD COLUMN IF NOT EXISTS expert_comment             TEXT;

COMMENT ON COLUMN palata_request_contacts.expert_status_updated_at IS
    'Timestamp when expert_status was last updated (accepted_work / declined / etc.)';

COMMENT ON COLUMN palata_request_contacts.failure_reason IS
    'Decline reason code when expert_status = declined';

COMMENT ON COLUMN palata_request_contacts.expert_comment IS
    'Free-text comment from expert when declining or setting a start date';
