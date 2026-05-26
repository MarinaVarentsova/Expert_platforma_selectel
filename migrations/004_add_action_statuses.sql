-- =============================================================================
-- Migration 004: Add new status values and can_start_from_date field
-- Safe: only adds new enum values and a nullable column
-- =============================================================================

-- New match statuses
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'contacts_opened';
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'can_start_from';
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'accepted_work';
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'closed_by_other_expert';

-- New order statuses
ALTER TYPE palata_order_status ADD VALUE IF NOT EXISTS 'expert_selection';
ALTER TYPE palata_order_status ADD VALUE IF NOT EXISTS 'in_work';

-- Date field for "Могу взять с даты"
ALTER TABLE palata_request_matches
    ADD COLUMN IF NOT EXISTS can_start_from_date DATE;

COMMENT ON COLUMN palata_request_matches.can_start_from_date IS
    'Set when expert signals they can start from a specific date (status = can_start_from)';
