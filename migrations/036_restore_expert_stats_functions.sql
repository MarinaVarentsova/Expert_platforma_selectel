-- =============================================================================
-- Migration 036: restore expert stats trigger functions
-- =============================================================================
-- Context: palata_refresh_expert_stats() and palata_refresh_expert_stats_on_match()
-- were deployed as empty stubs (BEGIN RETURN NEW; END), so the existing triggers
-- trg_palata_refresh_expert_stats_on_rating and trg_palata_refresh_expert_stats_on_match
-- never updated avg_customer_rating / completed_orders_count.
-- This migration replaces the stubs with correct implementations and backfills
-- all existing profiles.
-- =============================================================================

-- ── 1. Restore palata_refresh_expert_stats ────────────────────────────────────
-- Fires AFTER INSERT OR UPDATE ON palata_expert_ratings (FOR EACH ROW).
-- Updates avg_customer_rating and completed_orders_count for the rated expert.

CREATE OR REPLACE FUNCTION public.palata_refresh_expert_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.palata_expert_profiles ep
    SET
        avg_customer_rating = (
            SELECT ROUND(AVG(score)::NUMERIC, 2)
            FROM public.palata_expert_ratings
            WHERE expert_id = NEW.expert_id
        ),
        completed_orders_count = (
            SELECT COUNT(*)
            FROM public.palata_request_matches
            WHERE expert_id = NEW.expert_id
              AND status = 'completed'
        ),
        decline_rate = (
            SELECT
                CASE WHEN COUNT(*) = 0 THEN 0
                     ELSE ROUND(
                         COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC
                         / COUNT(*)::NUMERIC,
                         4
                     )
                END
            FROM public.palata_request_matches
            WHERE expert_id = NEW.expert_id
        ),
        updated_at = NOW()
    WHERE ep.user_id = NEW.expert_id;

    RETURN NEW;
END;
$$;

-- ── 2. Restore palata_refresh_expert_stats_on_match ──────────────────────────
-- Fires AFTER INSERT OR UPDATE OF status ON palata_request_matches (FOR EACH ROW).
-- Updates completed_orders_count and decline_rate when a match status changes.

CREATE OR REPLACE FUNCTION public.palata_refresh_expert_stats_on_match()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.palata_expert_profiles ep
    SET
        completed_orders_count = (
            SELECT COUNT(*)
            FROM public.palata_request_matches
            WHERE expert_id = NEW.expert_id
              AND status = 'completed'
        ),
        decline_rate = (
            SELECT
                CASE WHEN COUNT(*) = 0 THEN 0
                     ELSE ROUND(
                         COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC
                         / COUNT(*)::NUMERIC,
                         4
                     )
                END
            FROM public.palata_request_matches
            WHERE expert_id = NEW.expert_id
        ),
        updated_at = NOW()
    WHERE ep.user_id = NEW.expert_id;

    RETURN NEW;
END;
$$;

-- ── 3. Backfill all existing expert profiles ──────────────────────────────────
-- One-time recalculation so current production data is correct immediately
-- after applying this migration, without waiting for the next rating/match event.

UPDATE public.palata_expert_profiles ep
SET
    avg_customer_rating = (
        SELECT ROUND(AVG(score)::NUMERIC, 2)
        FROM public.palata_expert_ratings
        WHERE expert_id = ep.user_id
    ),
    completed_orders_count = (
        SELECT COUNT(*)
        FROM public.palata_request_matches
        WHERE expert_id = ep.user_id
          AND status = 'completed'
    ),
    decline_rate = (
        SELECT
            CASE WHEN COUNT(*) = 0 THEN 0
                 ELSE ROUND(
                     COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC
                     / COUNT(*)::NUMERIC,
                     4
                 )
            END
        FROM public.palata_request_matches
        WHERE expert_id = ep.user_id
    ),
    updated_at = NOW();
