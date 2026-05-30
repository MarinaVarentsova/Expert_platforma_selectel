-- ── 022: registration trigger + RLS policies for profile editing ────────────
-- Apply in Supabase Studio → SQL Editor → New query → Run
-- This migration enables:
-- 1. Auto-creation of palata_users + profile on auth.users INSERT
-- 2. UPDATE policies for customers/experts to edit their own profiles
-- 3. INSERT policies for new registrations
-- 4. Expert document policies
-- 5. Storage bucket for expert documents

-- ── 1. Trigger: auto-create records on Supabase Auth signup ────────────────

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

  -- Create palata_users record
  INSERT INTO public.palata_users (id, email, role, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create role-specific profile
  IF v_role = 'customer' THEN
    INSERT INTO public.palata_customer_profiles (
      user_id, company_name, inn, contact_name, region, notes
    ) VALUES (
      NEW.id,
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'inn', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'contact_name', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'region', '')), ''),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'notes', '')), '')
    ) ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_role = 'expert' THEN
    INSERT INTO public.palata_expert_profiles (
      user_id, bio, business_trip_ready, accepts_requests,
      palata_registry_verified, palata_registry_number,
      centrsudexpert_verified, centrsudexpert_registry_number,
      specializations, regions
    ) VALUES (
      NEW.id,
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'bio', '')), ''),
      COALESCE((NEW.raw_user_meta_data->>'business_trip_ready')::boolean, false),
      true,
      COALESCE((NEW.raw_user_meta_data->>'palata_registry_verified')::boolean, false),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'palata_registry_number', '')), ''),
      COALESCE((NEW.raw_user_meta_data->>'centrsudexpert_verified')::boolean, false),
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'centrsudexpert_registry_number', '')), ''),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'specializations')),
        '{}'::text[]
      ),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'regions')),
        '{}'::text[]
      )
    ) ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ── 2. palata_customer_profiles: INSERT + UPDATE for own record ────────────

DROP POLICY IF EXISTS "auth_insert_own_customer_profile" ON public.palata_customer_profiles;
CREATE POLICY "auth_insert_own_customer_profile"
  ON public.palata_customer_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "auth_update_own_customer_profile" ON public.palata_customer_profiles;
CREATE POLICY "auth_update_own_customer_profile"
  ON public.palata_customer_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 3. palata_expert_profiles: INSERT + UPDATE for own record ──────────────

DROP POLICY IF EXISTS "auth_insert_own_expert_profile" ON public.palata_expert_profiles;
CREATE POLICY "auth_insert_own_expert_profile"
  ON public.palata_expert_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "auth_update_own_expert_profile" ON public.palata_expert_profiles;
CREATE POLICY "auth_update_own_expert_profile"
  ON public.palata_expert_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 4. palata_expert_documents: INSERT + SELECT + DELETE for own records ───

DROP POLICY IF EXISTS "auth_insert_own_expert_documents" ON public.palata_expert_documents;
CREATE POLICY "auth_insert_own_expert_documents"
  ON public.palata_expert_documents FOR INSERT TO authenticated
  WITH CHECK (expert_id = auth.uid());

DROP POLICY IF EXISTS "auth_delete_own_expert_documents" ON public.palata_expert_documents;
CREATE POLICY "auth_delete_own_expert_documents"
  ON public.palata_expert_documents FOR DELETE TO authenticated
  USING (expert_id = auth.uid());

-- ── 5. Storage bucket for expert documents ─────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('palata-expert-documents', 'palata-expert-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "expert_upload_own_documents" ON storage.objects;
CREATE POLICY "expert_upload_own_documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'palata-expert-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "expert_delete_own_documents" ON storage.objects;
CREATE POLICY "expert_delete_own_documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'palata-expert-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "public_read_expert_documents" ON storage.objects;
CREATE POLICY "public_read_expert_documents"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'palata-expert-documents');
