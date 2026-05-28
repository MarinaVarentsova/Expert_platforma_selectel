-- =============================================================================
-- Migration 019: Create palata_action_items table
-- Run in Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS palata_action_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    expert_id           UUID REFERENCES palata_users(id) ON DELETE SET NULL,
    customer_id         UUID REFERENCES palata_users(id) ON DELETE SET NULL,
    assigned_to_user_id UUID NOT NULL REFERENCES palata_users(id) ON DELETE CASCADE,
    assigned_role       TEXT NOT NULL CHECK (assigned_role IN ('customer', 'expert', 'admin')),
    action_type         TEXT NOT NULL,
    title               TEXT,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'read', 'resolved', 'cancelled')),
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    is_resolved         BOOLEAN NOT NULL DEFAULT FALSE,
    payload             JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at             TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_action_items_assigned_user  ON palata_action_items (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_action_items_request        ON palata_action_items (request_id);
CREATE INDEX IF NOT EXISTS idx_action_items_action_type    ON palata_action_items (action_type);
CREATE INDEX IF NOT EXISTS idx_action_items_status         ON palata_action_items (status);
CREATE INDEX IF NOT EXISTS idx_action_items_is_read        ON palata_action_items (is_read);
CREATE INDEX IF NOT EXISTS idx_action_items_is_resolved    ON palata_action_items (is_resolved);

-- Composite index for the most common read query (open unresolved items per user)
CREATE INDEX IF NOT EXISTS idx_action_items_open_per_user
    ON palata_action_items (assigned_to_user_id, is_resolved, status);

-- RLS: users can only see their own action items
ALTER TABLE palata_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_items_select_own"
    ON palata_action_items FOR SELECT
    USING (assigned_to_user_id = auth.uid());

CREATE POLICY "action_items_update_own"
    ON palata_action_items FOR UPDATE
    USING (assigned_to_user_id = auth.uid());

-- Service role (anon with elevated perms) can insert/read all — needed for matching engine
CREATE POLICY "action_items_insert_service"
    ON palata_action_items FOR INSERT
    WITH CHECK (true);

CREATE POLICY "action_items_select_service"
    ON palata_action_items FOR SELECT
    USING (true);

COMMENT ON TABLE palata_action_items IS
    'Tasks/notifications requiring user action — drives the Action Center in customer/expert/admin dashboards';
