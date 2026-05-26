-- =============================================================================
-- Migration 003: Add registry number fields to palata_expert_profiles
-- Safe to run on existing data — uses ADD COLUMN IF NOT EXISTS with NULL default
-- =============================================================================

ALTER TABLE palata_expert_profiles
    ADD COLUMN IF NOT EXISTS palata_registry_number      TEXT,
    ADD COLUMN IF NOT EXISTS centrsudexpert_registry_number TEXT;

-- Comments for clarity
COMMENT ON COLUMN palata_expert_profiles.palata_registry_number          IS 'Registration number in the Палата судебных экспертов РФ registry';
COMMENT ON COLUMN palata_expert_profiles.centrsudexpert_registry_number  IS 'Registration number in the Центр судебных экспертиз registry';
