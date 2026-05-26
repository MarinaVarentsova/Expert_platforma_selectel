-- =============================================================================
-- Migration 008: Email notification log
--
-- Run in Supabase SQL Editor.
-- Logs every outbound email attempt — sent, test_mode, or error.
-- =============================================================================

CREATE TABLE IF NOT EXISTS palata_email_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID REFERENCES palata_requests(id) ON DELETE SET NULL,
    expert_id       UUID REFERENCES palata_users(id)    ON DELETE SET NULL,

    recipient_email TEXT        NOT NULL,
    recipient_type  TEXT        NOT NULL,  -- 'customer' | 'expert' | 'admin'
    email_type      TEXT        NOT NULL,  -- 'request_created' | 'expert_matched' | ...
    subject         TEXT        NOT NULL,
    body_preview    TEXT,                  -- first ~200 chars for debugging

    status          TEXT        NOT NULL DEFAULT 'pending',  -- 'sent' | 'test_mode' | 'error'
    error_text      TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_request  ON palata_email_events(request_id);
CREATE INDEX IF NOT EXISTS idx_email_events_expert   ON palata_email_events(expert_id);
CREATE INDEX IF NOT EXISTS idx_email_events_status   ON palata_email_events(status);
CREATE INDEX IF NOT EXISTS idx_email_events_created  ON palata_email_events(created_at DESC);

COMMENT ON TABLE palata_email_events IS
  'Audit log of all email notifications sent by the platform.';
