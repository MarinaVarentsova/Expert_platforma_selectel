-- Migration: create palata_admin_audit_log table
-- Run once before using POST /api/palata/admin/users/:userId/delete

CREATE TABLE IF NOT EXISTS public.palata_admin_audit_log (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  action         VARCHAR(100) NOT NULL,
  initiated_by   UUID         NOT NULL,   -- admin user id
  target_user_id UUID,                    -- subject of the operation
  details        JSONB        NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for quick lookup by target user
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.palata_admin_audit_log (target_user_id, created_at DESC);

-- Note: intentionally no FK on target_user_id because the user row
-- may be anonymized / deactivated at the time of audit query.
