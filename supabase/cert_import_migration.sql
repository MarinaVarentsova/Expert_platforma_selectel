-- =============================================================================
-- Cert import migration
-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- 1. palata_certificates — главный реестр сертификатов
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.palata_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number  text NOT NULL DEFAULT '',
  expert_full_name    text,
  expertise_area_raw  text,
  specialty_code      text,
  valid_from          date,
  valid_to            date,
  is_active           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Уникальный ключ: номер + ФИО + дата окончания (NULL → '')
CREATE UNIQUE INDEX IF NOT EXISTS palata_certificates_uq
  ON public.palata_certificates (
    certificate_number,
    COALESCE(expert_full_name, ''),
    COALESCE(valid_to::text, '')
  );

-- 2. palata_specialty_codes — справочник кодов специальностей
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.palata_specialty_codes (
  code                    text PRIMARY KEY,
  name                    text,
  expertise_direction_id  uuid REFERENCES public.palata_expertise_directions(id) ON DELETE SET NULL
);

-- 3. palata_expert_certificates — сертификаты, привязанные к зарегистрированным экспертам
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.palata_expert_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id           uuid NOT NULL REFERENCES public.palata_users(id) ON DELETE CASCADE,
  certificate_id      uuid REFERENCES public.palata_certificates(id) ON DELETE SET NULL,
  certificate_number  text NOT NULL DEFAULT '',
  cert_valid_to       date,
  cert_direction_ids  uuid[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'expired',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS palata_expert_certificates_uq
  ON public.palata_expert_certificates (expert_id, certificate_number);

-- 4. palata_expert_directions — направления экспертизы, связанные с экспертом
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.palata_expert_directions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id               uuid NOT NULL REFERENCES public.palata_users(id) ON DELETE CASCADE,
  expertise_direction_id  uuid NOT NULL REFERENCES public.palata_expertise_directions(id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expert_id, expertise_direction_id)
);

-- 5. palata_certificate_import_logs — журнал загрузок
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.palata_certificate_import_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  file_name             text,
  total_rows            integer NOT NULL DEFAULT 0,
  active_count          integer NOT NULL DEFAULT 0,
  expired_count         integer NOT NULL DEFAULT 0,
  parse_error_count     integer NOT NULL DEFAULT 0,
  linked_experts_count  integer NOT NULL DEFAULT 0,
  unlinked_experts_count integer NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'ok',
  error_message         text
);

-- 6. Добавить поле load_status в palata_certificates_import (если отсутствует)
-- =============================================================================
ALTER TABLE public.palata_certificates_import
  ADD COLUMN IF NOT EXISTS load_status text NOT NULL DEFAULT 'Загружен';

-- 7. truncate_certificates_import — очищает import-таблицу
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

-- 8. etl_process_certificate_import — основная ETL-функция
-- =============================================================================
CREATE OR REPLACE FUNCTION public.etl_process_certificate_import(
  p_file_name  text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total                integer := 0;
  v_active               integer := 0;
  v_expired              integer := 0;
  v_parse_errors         integer := 0;
  v_linked               integer := 0;
  v_unlinked             integer := 0;
  v_certs_upserted       integer := 0;
  v_expert_certs_upserted integer := 0;
  v_expert_dirs_upserted  integer := 0;
  v_no_direction          integer := 0;

  r                record;
  v_user_id        uuid;
  v_cert_id        uuid;
  v_direction_id   uuid;
  v_direction_ids  uuid[];
  v_codes          text[];
  v_specialty_str  text;
  v_norm_fio       text;
  v_new_status     text;
  v_load_status    text;
BEGIN
  -- Обработка каждой строки import-таблицы
  FOR r IN SELECT * FROM public.palata_certificates_import LOOP
    v_total := v_total + 1;

    -- Подсчёт статусов
    IF r.certificate_status = 'Активный' THEN
      v_active := v_active + 1;
    ELSE
      v_expired := v_expired + 1;
    END IF;

    -- Проверка ошибки парсинга даты
    IF r.valid_to IS NULL THEN
      v_parse_errors := v_parse_errors + 1;
    END IF;

    -- Извлечь коды специальностей (формат: "16.1", "7.3", "24.4" и т.п.)
    v_codes := ARRAY(
      SELECT DISTINCT m[1]
      FROM regexp_matches(COALESCE(r.expertise_area, ''), '(\d+\.\d+)', 'g') AS m
      ORDER BY m[1]
    );

    v_specialty_str := array_to_string(v_codes, ',');

    -- Определить direction_ids через справочник palata_specialty_codes
    v_direction_ids := '{}';
    IF array_length(v_codes, 1) > 0 THEN
      SELECT COALESCE(array_agg(DISTINCT sc.expertise_direction_id), '{}')
      INTO v_direction_ids
      FROM public.palata_specialty_codes sc
      WHERE sc.code = ANY(v_codes)
        AND sc.expertise_direction_id IS NOT NULL;
    END IF;

    IF array_length(v_direction_ids, 1) IS NULL THEN
      v_direction_ids := '{}';
      v_no_direction := v_no_direction + 1;
    END IF;

    -- Upsert в palata_certificates
    v_cert_id := NULL;
    BEGIN
      INSERT INTO public.palata_certificates (
        certificate_number, expert_full_name, expertise_area_raw,
        specialty_code, valid_to, is_active
      ) VALUES (
        COALESCE(r.certificate_number, ''),
        r.expert_full_name,
        r.expertise_area,
        v_specialty_str,
        r.valid_to,
        r.certificate_status = 'Активный'
      )
      ON CONFLICT ON CONSTRAINT palata_certificates_uq
      DO UPDATE SET
        expertise_area_raw = EXCLUDED.expertise_area_raw,
        specialty_code     = EXCLUDED.specialty_code,
        is_active          = EXCLUDED.is_active,
        updated_at         = now()
      RETURNING id INTO v_cert_id;

      -- Если ON CONFLICT DO UPDATE не вернул id (Postgres не гарантирует RETURNING при DO UPDATE)
      IF v_cert_id IS NULL THEN
        SELECT id INTO v_cert_id
        FROM public.palata_certificates
        WHERE certificate_number = COALESCE(r.certificate_number, '')
          AND COALESCE(expert_full_name, '') = COALESCE(r.expert_full_name, '')
          AND COALESCE(valid_to::text, '')   = COALESCE(r.valid_to::text, '')
        LIMIT 1;
      END IF;

      v_certs_upserted := v_certs_upserted + 1;
    EXCEPTION WHEN OTHERS THEN
      -- skip this cert, update load_status
      UPDATE public.palata_certificates_import
        SET load_status = 'Ошибка записи: ' || SQLERRM
        WHERE id = r.id;
      CONTINUE;
    END;

    -- Нормализованное ФИО для сопоставления
    v_norm_fio := lower(trim(regexp_replace(COALESCE(r.expert_full_name, ''), '\s+', ' ', 'g')));

    -- Найти эксперта по ФИО
    v_user_id := NULL;
    IF v_norm_fio != '' THEN
      SELECT id INTO v_user_id
      FROM public.palata_users
      WHERE role = 'expert'
        AND lower(trim(regexp_replace(COALESCE(full_name, ''), '\s+', ' ', 'g'))) = v_norm_fio
      LIMIT 1;
    END IF;

    IF v_user_id IS NOT NULL THEN
      v_linked    := v_linked + 1;
      v_new_status := CASE WHEN r.certificate_status = 'Активный' THEN 'verified' ELSE 'expired' END;

      -- Upsert palata_expert_certificates
      BEGIN
        INSERT INTO public.palata_expert_certificates (
          expert_id, certificate_id, certificate_number,
          cert_valid_to, cert_direction_ids, status
        ) VALUES (
          v_user_id, v_cert_id, COALESCE(r.certificate_number, ''),
          r.valid_to, v_direction_ids, v_new_status
        )
        ON CONFLICT ON CONSTRAINT palata_expert_certificates_uq
        DO UPDATE SET
          certificate_id    = EXCLUDED.certificate_id,
          cert_valid_to     = EXCLUDED.cert_valid_to,
          cert_direction_ids = EXCLUDED.cert_direction_ids,
          status            = EXCLUDED.status,
          updated_at        = now();

        v_expert_certs_upserted := v_expert_certs_upserted + 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      -- Upsert palata_expert_directions (только для активных сертификатов)
      IF r.certificate_status = 'Активный' AND array_length(v_direction_ids, 1) > 0 THEN
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
      v_unlinked := v_unlinked + 1;
      v_load_status := CASE
        WHEN r.expert_full_name IS NULL OR r.expert_full_name = '' THEN 'Нет ФИО эксперта'
        WHEN r.certificate_number IS NULL OR r.certificate_number = '' THEN 'Нет номера сертификата'
        ELSE 'Ожидает регистрации эксперта'
      END;
    END IF;

    UPDATE public.palata_certificates_import SET load_status = v_load_status WHERE id = r.id;

  END LOOP;

  -- Записать в журнал
  INSERT INTO public.palata_certificate_import_logs (
    created_by, file_name, total_rows, active_count, expired_count,
    parse_error_count, linked_experts_count, unlinked_experts_count, status
  ) VALUES (
    p_created_by, p_file_name, v_total, v_active, v_expired,
    v_parse_errors, v_linked, v_unlinked, 'ok'
  );

  RETURN jsonb_build_object(
    'total',                  v_total,
    'active',                 v_active,
    'expired',                v_expired,
    'parse_errors',           v_parse_errors,
    'certs_upserted',         v_certs_upserted,
    'expert_certs_upserted',  v_expert_certs_upserted,
    'expert_dirs_upserted',   v_expert_dirs_upserted,
    'linked_experts',         v_linked,
    'unlinked_experts',       v_unlinked,
    'no_direction',           v_no_direction
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.palata_certificate_import_logs (
    created_by, file_name, total_rows, status, error_message
  ) VALUES (p_created_by, p_file_name, v_total, 'error', SQLERRM);
  RAISE;
END;
$$;

-- 9. get_cert_import_stats — статистика текущего реестра
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_cert_import_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total',            COUNT(*),
    'active',           COUNT(*) FILTER (WHERE certificate_status = 'Активный'),
    'expired',          COUNT(*) FILTER (WHERE certificate_status = 'Истёкший'),
    'linked',           COUNT(*) FILTER (WHERE load_status = 'Загружен'),
    'unlinked',         COUNT(*) FILTER (WHERE load_status = 'Ожидает регистрации эксперта'),
    'last_loaded_at',   MAX(created_at)
  )
  FROM public.palata_certificates_import;
$$;

-- 10. RLS (Row Level Security) — базовая защита таблиц
-- =============================================================================
ALTER TABLE public.palata_certificates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palata_expert_certificates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palata_expert_directions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palata_certificate_import_logs  ENABLE ROW LEVEL SECURITY;

-- palata_certificates: читают все аутентифицированные
CREATE POLICY IF NOT EXISTS "Authenticated can read certs"
  ON public.palata_certificates FOR SELECT
  TO authenticated USING (true);

-- palata_expert_certificates: читают все аутентифицированные
CREATE POLICY IF NOT EXISTS "Authenticated can read expert certs"
  ON public.palata_expert_certificates FOR SELECT
  TO authenticated USING (true);

-- palata_expert_directions: читают все аутентифицированные
CREATE POLICY IF NOT EXISTS "Authenticated can read expert dirs"
  ON public.palata_expert_directions FOR SELECT
  TO authenticated USING (true);

-- palata_certificate_import_logs: читают только владельцы записи или admin
-- (SECURITY DEFINER функции пишут напрямую, RLS применяется к SELECT)
CREATE POLICY IF NOT EXISTS "Authenticated can read import logs"
  ON public.palata_certificate_import_logs FOR SELECT
  TO authenticated USING (true);
