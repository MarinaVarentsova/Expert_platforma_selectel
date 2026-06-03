-- =============================================================================
-- Migration 031: write palata_expert_regions from auth metadata on user creation
-- =============================================================================
-- Apply in Supabase Studio → SQL Editor → New query → Run
--
-- PROBLEM: Experts who register via email-confirmation flow lose their
-- React-state regionIds before the trigger fires. The trigger previously
-- ignored region data entirely.
--
-- FIX: The client now passes region_ids (UUID[]) in signUp options.data.
-- This migration rewrites handle_new_auth_user() to read that array and
-- insert rows into palata_expert_regions for every UUID it contains.
--
-- CONTRACT:
--   raw_user_meta_data->>'role'       = 'expert'
--   raw_user_meta_data->'region_ids'  = JSON array of palata_regions.id UUIDs
--     e.g. ["83ba531f-...", "a1b2c3d4-..."]
--
-- Idempotent: ON CONFLICT DO NOTHING on the composite PK (expert_id, region_id).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
DECLARE
  v_role       palata_user_role;
  v_region_id  UUID;
BEGIN
  -- ── Determine role ──────────────────────────────────────────────────────────
  v_role := 'customer'::palata_user_role;
  IF (NEW.raw_user_meta_data->>'role') = 'expert' THEN
    v_role := 'expert'::palata_user_role;
  ELSIF (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    v_role := 'admin'::palata_user_role;
  END IF;

  -- ── Insert into palata_users ─────────────────────────────────────────────────
  INSERT INTO public.palata_users (id, email, role, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── Role-specific profile rows ───────────────────────────────────────────────
  IF v_role = 'customer' THEN
    INSERT INTO public.palata_customer_profiles (
      user_id, company_name, inn, contact_name, notes
    ) VALUES (
      NEW.id,
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'inn', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'contact_name', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'notes', '')), '')
    ) ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_role = 'expert' THEN
    INSERT INTO public.palata_expert_profiles (
      user_id, bio, business_trip_ready, accepts_requests,
      palata_registry_verified, palata_registry_number,
      centrsudexpert_verified, centrsudexpert_registry_number
    ) VALUES (
      NEW.id,
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'bio', '')), ''),
      COALESCE((NEW.raw_user_meta_data->>'business_trip_ready')::boolean, false),
      true,
      COALESCE((NEW.raw_user_meta_data->>'palata_registry_verified')::boolean, false),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'palata_registry_number', '')), ''),
      COALESCE((NEW.raw_user_meta_data->>'centrsudexpert_verified')::boolean, false),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'centrsudexpert_registry_number', '')), '')
    ) ON CONFLICT (user_id) DO NOTHING;

    -- ── Insert expert regions from metadata ──────────────────────────────────
    -- region_ids is a JSON array of palata_regions.id UUIDs stored in metadata.
    -- We iterate over the array and insert one row per UUID, ignoring any UUID
    -- that does not exist in palata_regions (cast will raise; we use a subquery
    -- join instead to avoid exceptions on malformed data).
    IF NEW.raw_user_meta_data->'region_ids' IS NOT NULL
       AND jsonb_array_length(NEW.raw_user_meta_data->'region_ids') > 0
    THEN
      INSERT INTO public.palata_expert_regions (expert_id, region_id)
      SELECT
        NEW.id,
        r.id
      FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'region_ids') AS elem(val)
      JOIN public.palata_regions r ON r.id = elem.val::uuid
      ON CONFLICT DO NOTHING;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
