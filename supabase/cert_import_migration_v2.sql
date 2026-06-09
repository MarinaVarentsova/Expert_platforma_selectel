-- =============================================================================
-- БЕЗОПАСНАЯ миграция v2 — только то, чего ещё нет в базе.
-- НЕ трогает: palata_certificates, palata_expert_certificates,
--             palata_expert_directions, palata_expertise_directions,
--             palata_users, palata_specialty_codes,
--             palata_certificate_specialty_codes, RLS, matching.
-- Запустить один раз в Supabase SQL Editor.
-- =============================================================================

-- 1. Журнал загрузок (новая таблица, если нет)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.palata_certificate_import_logs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  file_name              text,
  total_rows             integer NOT NULL DEFAULT 0,
  active_count           integer NOT NULL DEFAULT 0,
  expired_count          integer NOT NULL DEFAULT 0,
  parse_error_count      integer NOT NULL DEFAULT 0,
  linked_experts_count   integer NOT NULL DEFAULT 0,
  unlinked_experts_count integer NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'ok',
  error_message          text
);

-- 2. truncate_certificates_import — очищает staging перед новой загрузкой
-- =============================================================================
CREATE OR REPLACE FUNCTION public.truncate_certificates_import()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE public.palata_certificates_import;
END;
$$;

-- 3. get_cert_import_stats — статистика текущего реестра для блока на странице
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_cert_import_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total',          COUNT(*),
    'active',         COUNT(*) FILTER (WHERE certificate_status = 'Активный'),
    'expired',        COUNT(*) FILTER (WHERE certificate_status = 'Истёкший'),
    'linked',         COUNT(*) FILTER (WHERE load_status = 'Загружен'),
    'unlinked',       COUNT(*) FILTER (WHERE load_status = 'Ожидает регистрации эксперта'),
    'last_loaded_at', MAX(valid_to)
  )
  FROM public.palata_certificates_import;
$$;

-- 4. etl_process_certificate_import — основная ETL-функция
--    Читает palata_certificates_import, разносит данные по рабочим таблицам.
--    Использует CTID вместо id (в import нет поля id).
--    Upsert делает через SELECT → INSERT/UPDATE (не требует unique constraint).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.etl_process_certificate_import(
  p_file_name  text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total                 integer := 0;
  v_active                integer := 0;
  v_expired               integer := 0;
  v_parse_errors          integer := 0;
  v_linked                integer := 0;
  v_unlinked              integer := 0;
  v_certs_upserted        integer := 0;
  v_expert_certs_upserted integer := 0;
  v_expert_dirs_upserted  integer := 0;
  v_no_direction          integer := 0;

  r                record;     -- строка из palata_certificates_import
  v_cert_id        uuid;
  v_user_id        uuid;
  v_sc_id          uuid;       -- specialty_code id
  v_direction_id   uuid;
  v_direction_ids  uuid[];
  v_is_active      boolean;
  v_new_status     text;
  v_load_status    text;
  v_norm_fio       text;
  v_cert_number    text;
  v_codes_arr      text[];     -- распарсенные коды из поля codes
  v_code           text;
BEGIN

  FOR r IN SELECT ctid, * FROM public.palata_certificates_import LOOP
    v_total := v_total + 1;

    v_is_active := (r.certificate_status = 'Активный');

    IF v_is_active THEN
      v_active  := v_active + 1;
    ELSE
      v_expired := v_expired + 1;
    END IF;

    IF r.valid_to IS NULL THEN
      v_parse_errors := v_parse_errors + 1;
    END IF;

    -- Нормализовать номер сертификата (trim)
    v_cert_number := trim(COALESCE(r.certificate_number, ''));

    -- Разобрать коды из поля codes (хранится как "16.1,16.2,7.3")
    IF r.codes IS NOT NULL AND r.codes != '' THEN
      v_codes_arr := string_to_array(
        regexp_replace(trim(r.codes), '\s*,\s*', ',', 'g'),
        ','
      );
    ELSE
      -- Попробовать извлечь коды прямо из specialty_text
      v_codes_arr := ARRAY(
        SELECT DISTINCT m[1]
        FROM regexp_matches(COALESCE(r.specialty_text, ''), '(\d+\.\d+)', 'g') AS m
        ORDER BY m[1]
      );
    END IF;

    -- Собрать direction_ids по кодам из справочника palata_specialty_codes
    v_direction_ids := '{}';
    IF array_length(v_codes_arr, 1) > 0 THEN
      SELECT COALESCE(array_agg(DISTINCT sc.expertise_direction_id), '{}')
      INTO v_direction_ids
      FROM public.palata_specialty_codes sc
      WHERE sc.code = ANY(v_codes_arr)
        AND sc.is_active = true
        AND sc.expertise_direction_id IS NOT NULL;
    END IF;

    IF array_length(v_direction_ids, 1) IS NULL THEN
      v_direction_ids := '{}';
      v_no_direction  := v_no_direction + 1;
    END IF;

    -- ── Upsert palata_certificates ──────────────────────────────────────────
    -- Ключ: certificate_number + expert_full_name (оба NOT NULL в таблице)
    v_cert_id := NULL;
    BEGIN
      SELECT id INTO v_cert_id
      FROM public.palata_certificates
      WHERE certificate_number = v_cert_number
        AND expert_full_name   = trim(COALESCE(r.expert_full_name, ''))
      LIMIT 1;

      IF v_cert_id IS NULL THEN
        INSERT INTO public.palata_certificates (
          certificate_number,
          expert_full_name,
          specialty_text,
          certificate_period,
          specialty_code,
          valid_from,
          valid_to,
          is_active,
          source_file_name,
          source_loaded_at
        ) VALUES (
          v_cert_number,
          trim(COALESCE(r.expert_full_name, '')),
          r.specialty_text,
          r.certificate_period,
          CASE WHEN array_length(v_codes_arr, 1) > 0
               THEN array_to_string(v_codes_arr, ',')
               ELSE NULL END,
          r.valid_from,
          r.valid_to,
          v_is_active,
          p_file_name,
          now()
        )
        RETURNING id INTO v_cert_id;
      ELSE
        UPDATE public.palata_certificates SET
          specialty_text    = r.specialty_text,
          certificate_period = r.certificate_period,
          specialty_code    = CASE WHEN array_length(v_codes_arr, 1) > 0
                                   THEN array_to_string(v_codes_arr, ',')
                                   ELSE specialty_code END,
          valid_from        = r.valid_from,
          valid_to          = r.valid_to,
          is_active         = v_is_active,
          source_file_name  = p_file_name,
          source_loaded_at  = now(),
          updated_at        = now()
        WHERE id = v_cert_id;
      END IF;

      v_certs_upserted := v_certs_upserted + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.palata_certificates_import
        SET load_status = 'Ошибка сертификата: ' || left(SQLERRM, 100)
        WHERE ctid = r.ctid;
      CONTINUE;
    END;

    -- ── Связать palata_certificates ↔ palata_certificate_specialty_codes ────
    IF v_cert_id IS NOT NULL AND array_length(v_codes_arr, 1) > 0 THEN
      FOREACH v_code IN ARRAY v_codes_arr LOOP
        BEGIN
          SELECT id INTO v_sc_id
          FROM public.palata_specialty_codes
          WHERE code = v_code AND is_active = true
          LIMIT 1;

          IF v_sc_id IS NOT NULL THEN
            -- Вставить только если связки ещё нет
            INSERT INTO public.palata_certificate_specialty_codes (certificate_id, specialty_code_id)
            SELECT v_cert_id, v_sc_id
            WHERE NOT EXISTS (
              SELECT 1 FROM public.palata_certificate_specialty_codes
              WHERE certificate_id = v_cert_id AND specialty_code_id = v_sc_id
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END LOOP;
    END IF;

    -- ── Поиск эксперта по ФИО ───────────────────────────────────────────────
    v_norm_fio := lower(trim(regexp_replace(COALESCE(r.expert_full_name, ''), '\s+', ' ', 'g')));
    v_user_id  := NULL;

    IF v_norm_fio != '' THEN
      SELECT id INTO v_user_id
      FROM public.palata_users
      WHERE role = 'expert'
        AND lower(trim(regexp_replace(COALESCE(full_name, ''), '\s+', ' ', 'g'))) = v_norm_fio
      LIMIT 1;
    END IF;

    -- ── Upsert palata_expert_certificates ────────────────────────────────────
    IF v_user_id IS NOT NULL THEN
      v_linked     := v_linked + 1;
      v_new_status := CASE WHEN v_is_active THEN 'verified' ELSE 'expired' END;

      BEGIN
        DECLARE v_ec_id uuid;
        BEGIN
          SELECT id INTO v_ec_id
          FROM public.palata_expert_certificates
          WHERE expert_id          = v_user_id
            AND certificate_number = v_cert_number
          LIMIT 1;

          IF v_ec_id IS NULL THEN
            INSERT INTO public.palata_expert_certificates (
              expert_id, certificate_number, status,
              cert_valid_to, cert_expert_name, cert_direction_ids
            ) VALUES (
              v_user_id, v_cert_number, v_new_status,
              r.valid_to, r.expert_full_name, v_direction_ids
            );
          ELSE
            UPDATE public.palata_expert_certificates SET
              status             = v_new_status,
              cert_valid_to      = r.valid_to,
              cert_expert_name   = r.expert_full_name,
              cert_direction_ids = v_direction_ids,
              updated_at         = now()
            WHERE id = v_ec_id;
          END IF;

          v_expert_certs_upserted := v_expert_certs_upserted + 1;
        END;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      -- ── Upsert palata_expert_directions (только для активных) ──────────────
      IF v_is_active AND array_length(v_direction_ids, 1) > 0 THEN
        FOREACH v_direction_id IN ARRAY v_direction_ids LOOP
          BEGIN
            INSERT INTO public.palata_expert_directions (expert_id, expertise_direction_id)
            VALUES (v_user_id, v_direction_id)
            ON CONFLICT (expert_id, expertise_direction_id) DO NOTHING;
            v_expert_dirs_upserted := v_expert_dirs_upserted + 1;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END LOOP;
      END IF;

      v_load_status := 'Загружен';

    ELSE
      v_unlinked    := v_unlinked + 1;
      v_load_status := CASE
        WHEN trim(COALESCE(r.expert_full_name, '')) = '' THEN 'Нет ФИО эксперта'
        WHEN v_cert_number = ''                          THEN 'Нет номера сертификата'
        ELSE 'Ожидает регистрации эксперта'
      END;
    END IF;

    -- Обновить load_status в import по CTID (id в таблице нет)
    UPDATE public.palata_certificates_import
      SET load_status = v_load_status
      WHERE ctid = r.ctid;

  END LOOP;

  -- ── Журнал загрузки ────────────────────────────────────────────────────────
  INSERT INTO public.palata_certificate_import_logs (
    created_by, file_name,
    total_rows, active_count, expired_count,
    parse_error_count, linked_experts_count, unlinked_experts_count,
    status
  ) VALUES (
    p_created_by, p_file_name,
    v_total, v_active, v_expired,
    v_parse_errors, v_linked, v_unlinked,
    'ok'
  );

  RETURN jsonb_build_object(
    'total',                 v_total,
    'active',                v_active,
    'expired',               v_expired,
    'parse_errors',          v_parse_errors,
    'certs_upserted',        v_certs_upserted,
    'expert_certs_upserted', v_expert_certs_upserted,
    'expert_dirs_upserted',  v_expert_dirs_upserted,
    'linked_experts',        v_linked,
    'unlinked_experts',      v_unlinked,
    'no_direction',          v_no_direction
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.palata_certificate_import_logs (
    created_by, file_name, total_rows, status, error_message
  ) VALUES (
    p_created_by, p_file_name, v_total, 'error', SQLERRM
  );
  RAISE;
END;
$$;
