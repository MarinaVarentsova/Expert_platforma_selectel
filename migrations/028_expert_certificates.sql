-- ── 028: expert certificates ────────────────────────────────────────────────
-- Stores which certificate numbers an expert has entered and their
-- verification status. Directions are derived automatically from
-- palata_certificates → palata_specialty_codes → palata_expert_directions.

CREATE TABLE IF NOT EXISTS palata_expert_certificates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id           UUID        NOT NULL REFERENCES palata_users(id) ON DELETE CASCADE,
  certificate_number  TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  cert_valid_to       DATE,
  cert_expert_name    TEXT,
  cert_direction_ids  TEXT[],
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (expert_id, certificate_number)
);

ALTER TABLE palata_expert_certificates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'palata_expert_certificates'
    AND   policyname = 'Expert manages own certificates'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Expert manages own certificates"
        ON palata_expert_certificates
        FOR ALL TO authenticated
        USING  (expert_id = auth.uid())
        WITH CHECK (expert_id = auth.uid())
    $pol$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON palata_expert_certificates TO authenticated;
