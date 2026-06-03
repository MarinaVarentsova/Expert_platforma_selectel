-- =============================================================================
-- Migration 032: guarantee palata_expert_regions read access for matching
-- =============================================================================
-- PROBLEM: Migration 025 created read policies inside DO $$ IF NOT EXISTS $$
-- blocks that may have silently failed or been dropped. Without these policies
-- the only active rule is "Expert manage own regions" FOR ALL, which returns
-- 0 rows when a customer (or anon) queries other experts' regions.
-- This breaks travel-order matching: expertRegionMap is always empty.
--
-- FIX: DROP + CREATE (not IF NOT EXISTS) guarantees the policies exist.
-- Safe to run multiple times.
-- =============================================================================

-- Run in Supabase Studio → SQL Editor → New query → Run

DROP POLICY IF EXISTS "Authenticated read expert_regions" ON palata_expert_regions;
CREATE POLICY "Authenticated read expert_regions"
  ON palata_expert_regions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anon read expert_regions" ON palata_expert_regions;
CREATE POLICY "Anon read expert_regions"
  ON palata_expert_regions
  FOR SELECT TO anon
  USING (true);
