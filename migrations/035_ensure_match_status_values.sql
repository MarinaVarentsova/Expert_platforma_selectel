-- =============================================================================
-- Migration 035: Ensure palata_match_status enum values are present in Selectel.
-- Idempotent — safe to apply multiple times.
--
-- These values were introduced in migration 004 but may be absent from the
-- Selectel production schema if that migration was not applied there.
-- Apply: psql $PALATA_DATABASE_URL -f migrations/035_ensure_match_status_values.sql
-- =============================================================================

ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'accepted_work';
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'closed_by_other_expert';
ALTER TYPE palata_match_status ADD VALUE IF NOT EXISTS 'can_start_from';
