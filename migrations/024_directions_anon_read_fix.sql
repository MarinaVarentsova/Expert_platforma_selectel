-- Fix: grant anon role read access to palata_expertise_directions.
-- Migration 023 used "CREATE POLICY IF NOT EXISTS" which PostgreSQL does NOT support
-- and therefore silently failed. This migration uses the correct pattern.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'palata_expertise_directions'
      AND policyname = 'Anon users can read directions'
  ) THEN
    EXECUTE 'CREATE POLICY "Anon users can read directions"
      ON palata_expertise_directions FOR SELECT TO anon USING (true)';
  END IF;
END $$;
