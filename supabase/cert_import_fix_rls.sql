-- =============================================================================
-- ФИКС RLS для palata_certificates_import
-- Запустить в Supabase SQL Editor.
-- Не меняет RLS существующих рабочих таблиц.
-- Создаёт SECURITY DEFINER функцию, которая обходит RLS при вставке в staging.
-- =============================================================================

-- bulk_insert_certificates_import — вставляет строки в palata_certificates_import
-- Принимает массив строк в виде jsonb[].
-- SECURITY DEFINER — работает с правами владельца функции, обходит RLS.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bulk_insert_certificates_import(
  p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row    jsonb;
  v_count  integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.palata_certificates_import (
      certificate_number,
      expert_full_name,
      specialty_text,
      certificate_period,
      codes,
      valid_from,
      valid_to,
      certificate_status,
      load_status
    ) VALUES (
      NULLIF(trim(v_row->>'certificate_number'), ''),
      NULLIF(trim(v_row->>'expert_full_name'),   ''),
      NULLIF(trim(v_row->>'specialty_text'),      ''),
      NULLIF(trim(v_row->>'certificate_period'),  ''),
      NULLIF(trim(v_row->>'codes'),               ''),
      CASE WHEN v_row->>'valid_from' IS NOT NULL AND v_row->>'valid_from' != ''
           THEN (v_row->>'valid_from')::date ELSE NULL END,
      CASE WHEN v_row->>'valid_to' IS NOT NULL AND v_row->>'valid_to' != ''
           THEN (v_row->>'valid_to')::date ELSE NULL END,
      COALESCE(NULLIF(trim(v_row->>'certificate_status'), ''), 'Истёкший'),
      COALESCE(NULLIF(trim(v_row->>'load_status'), ''), 'Загружен')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
