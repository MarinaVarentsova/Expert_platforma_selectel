-- Make request_id nullable in palata_action_items
-- so cert-expiry notifications (not tied to a specific request) can be stored.
ALTER TABLE palata_action_items
  ALTER COLUMN request_id DROP NOT NULL;
