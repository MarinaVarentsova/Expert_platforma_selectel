-- Add pending_customer value to palata_match_status enum.
-- After running this migration, re-enable pending_customer in the matchers.
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'pending_customer';
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'selected_by_customer';
