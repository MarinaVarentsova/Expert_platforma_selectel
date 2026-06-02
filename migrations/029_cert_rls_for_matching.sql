-- ── 029: allow authenticated users to read verified certificates ──────────────
-- Matching runs as the customer's session, so it cannot read other experts'
-- certificates under the existing "Expert manages own certificates" policy.
-- This policy adds a read-only window restricted to status='verified' rows,
-- which is safe because verified professional credentials are not sensitive.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'palata_expert_certificates'
    AND   policyname = 'Authenticated can read verified certs'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Authenticated can read verified certs"
        ON palata_expert_certificates
        FOR SELECT TO authenticated
        USING (status = 'verified')
    $pol$;
  END IF;
END $$;
