-- =============================================================================
-- Migration 018: Add customer_comment column to palata_requests
-- Run in Supabase SQL Editor
-- =============================================================================

ALTER TABLE palata_requests
    ADD COLUMN IF NOT EXISTS customer_comment TEXT;

COMMENT ON COLUMN palata_requests.customer_comment IS
    'Free-text comment from customer submitted with the order form';
