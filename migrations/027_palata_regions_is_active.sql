-- ── 027: add is_active to palata_regions ──────────────────────────────────────
-- Allows soft-disabling regions without deleting them.
-- All existing rows default to true (active).

ALTER TABLE palata_regions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
