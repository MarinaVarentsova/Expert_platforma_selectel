-- Allow unauthenticated (anon) users to read expertise directions.
-- Needed for Register and NewRequest pages which load this reference table
-- before the user is logged in.

CREATE POLICY IF NOT EXISTS "Anon users can read directions"
  ON palata_expertise_directions FOR SELECT TO anon USING (true);
