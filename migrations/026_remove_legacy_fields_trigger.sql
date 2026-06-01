-- ── 026: remove legacy region/specializations fields from registration trigger ──
-- Apply in Supabase Studio → SQL Editor → New query → Run
-- Rewrites handle_new_auth_user() to stop writing into deprecated columns:
--   palata_customer_profiles.region
--   palata_expert_profiles.regions
--   palata_expert_profiles.specializations
-- All region/direction data now lives exclusively in junction tables
-- (palata_customer_regions, palata_expert_regions, palata_expert_directions).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
DECLARE
  v_role palata_user_role;
BEGIN
  v_role := 'customer'::palata_user_role;
  IF (NEW.raw_user_meta_data->>'role') = 'expert' THEN
    v_role := 'expert'::palata_user_role;
  ELSIF (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    v_role := 'admin'::palata_user_role;
  END IF;

  INSERT INTO public.palata_users (id, email, role, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;

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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
