-- ════════════════════════════════════════════════════════════════════════════
-- 021 Expertise Directions — единый справочник направлений экспертиз
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Таблица-справочник направлений ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS palata_expertise_directions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  sort_order  integer,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE palata_expertise_directions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read directions"
  ON palata_expertise_directions FOR SELECT TO authenticated USING (true);

-- ── 2. Эталонный перечень (31 направление, алфавитный порядок) ───────────────

INSERT INTO palata_expertise_directions (name, slug, sort_order) VALUES
  ('Автотехническая экспертиза',                                                                                   'avtotechnicheskaya',          1),
  ('Баллистическая экспертиза',                                                                                    'ballisticheskaya',            2),
  ('Биологическая экспертиза',                                                                                     'biologicheskaya',             3),
  ('Взрывотехническая экспертиза',                                                                                 'vzryvotechnicheskaya',        4),
  ('Другие экспертизы',                                                                                            'drugie',                      5),
  ('Землеустроительная экспертиза',                                                                                'zemleustroitelnaya',          6),
  ('Исследование объектов судебной экспертизы с применением инструментально-лабораторных методов',                'issledovanie-instrumentalnoe', 7),
  ('Компьютерно-техническая экспертиза',                                                                          'kompyuterno-tehnicheskaya',   8),
  ('Криминалистическая экспертиза видео- и звукозаписей',                                                        'kriminalisticheskaya-video',  9),
  ('Лингвистическая экспертиза',                                                                                   'lingvisticheskaya',           10),
  ('Молекулярно-генетическая экспертиза объектов',                                                               'molekulyarno-geneticheskaya', 11),
  ('Оценочная экспертиза',                                                                                        'ocenochnaya',                 12),
  ('Патентная экспертиза',                                                                                        'patentnaya',                  13),
  ('Пожарно-техническая экспертиза',                                                                              'pozharno-tehnicheskaya',      14),
  ('Политологическая экспертиза',                                                                                 'politologicheskaya',          15),
  ('Портретная экспертиза',                                                                                       'portretnaya',                 16),
  ('Почвоведческая экспертиза',                                                                                   'pochvovedcheskaya',           17),
  ('Почерковедческая экспертиза',                                                                                 'pocherkovedcheskaya',         18),
  ('Психологическая экспертиза',                                                                                  'psihologicheskaya',           19),
  ('Строительно-техническая экспертиза',                                                                         'stroitelno-tehnicheskaya',    20),
  ('Судебно-медицинская экспертиза',                                                                              'sudebno-medicinskaya',        21),
  ('Товароведческая экспертиза',                                                                                  'tovarovedcheskaya',           22),
  ('Трасологическая экспертиза',                                                                                  'trasologicheskaya',           23),
  ('Финансово-экономическая экспертиза',                                                                         'finansovo-ekonomicheskaya',   24),
  ('Экологическая экспертиза',                                                                                    'ekologicheskaya',             25),
  ('Экспертиза веществ, материалов, изделий',                                                                    'veshchestv-materialov',       26),
  ('Экспертиза маркировочных обозначений',                                                                       'markirovochnyh',              27),
  ('Экспертиза объектов дикой флоры и фауны',                                                                   'flora-fauna',                 28),
  ('Экспертиза охраны труда и техники безопасности',                                                            'ohrana-truda',                29),
  ('Экспертиза холодного оружия',                                                                                 'holodnogo-oruzhiya',          30),
  ('Электротехническая экспертиза',                                                                               'elektrotehnicheskaya',        31)
ON CONFLICT (name) DO NOTHING;

-- ── 3. Добавить expertise_direction_id в palata_requests ─────────────────────

ALTER TABLE palata_requests
  ADD COLUMN IF NOT EXISTS expertise_direction_id uuid REFERENCES palata_expertise_directions(id);

CREATE INDEX IF NOT EXISTS idx_palata_requests_direction
  ON palata_requests(expertise_direction_id);

-- ── 4. Связующая таблица эксперт ↔ направление ──────────────────────────────

CREATE TABLE IF NOT EXISTS palata_expert_directions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id             uuid NOT NULL,
  expertise_direction_id uuid NOT NULL REFERENCES palata_expertise_directions(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expert_id, expertise_direction_id)
);

ALTER TABLE palata_expert_directions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read expert directions"
  ON palata_expert_directions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Experts manage own directions"
  ON palata_expert_directions FOR ALL TO authenticated
  USING (expert_id = auth.uid())
  WITH CHECK (expert_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_palata_expert_directions_expert
  ON palata_expert_directions(expert_id);
CREATE INDEX IF NOT EXISTS idx_palata_expert_directions_direction
  ON palata_expert_directions(expertise_direction_id);

-- ── 5a. Перенос данных запросов: expertise_type → expertise_direction_id ─────

UPDATE palata_requests r
SET expertise_direction_id = d.id
FROM palata_expertise_directions d
WHERE d.name = CASE r.expertise_type
  WHEN 'Строительно-техническая'            THEN 'Строительно-техническая экспертиза'
  WHEN 'Строительно-техническая экспертиза' THEN 'Строительно-техническая экспертиза'
  WHEN 'Оценочная'                          THEN 'Оценочная экспертиза'
  WHEN 'Оценочная экспертиза'               THEN 'Оценочная экспертиза'
  WHEN 'Почерковедческая'                   THEN 'Почерковедческая экспертиза'
  WHEN 'Почерковедческая экспертиза'        THEN 'Почерковедческая экспертиза'
  WHEN 'Автотехническая'                    THEN 'Автотехническая экспертиза'
  WHEN 'Автотехническая экспертиза'         THEN 'Автотехническая экспертиза'
  WHEN 'Трасологическая'                    THEN 'Трасологическая экспертиза'
  WHEN 'Трасологическая экспертиза'         THEN 'Трасологическая экспертиза'
  WHEN 'Финансово-экономическая'            THEN 'Финансово-экономическая экспертиза'
  WHEN 'Финансово-экономическая экспертиза' THEN 'Финансово-экономическая экспертиза'
  WHEN 'Пожарно-техническая'                THEN 'Пожарно-техническая экспертиза'
  WHEN 'Пожарно-техническая экспертиза'     THEN 'Пожарно-техническая экспертиза'
  WHEN 'Электротехническая'                 THEN 'Электротехническая экспертиза'
  WHEN 'Электротехническая экспертиза'      THEN 'Электротехническая экспертиза'
  WHEN 'Психологическая'                    THEN 'Психологическая экспертиза'
  WHEN 'Психологическая экспертиза'         THEN 'Психологическая экспертиза'
  WHEN 'Землеустроительная'                 THEN 'Землеустроительная экспертиза'
  WHEN 'Землеустроительная экспертиза'      THEN 'Землеустроительная экспертиза'
  WHEN 'Экологическая'                      THEN 'Экологическая экспертиза'
  WHEN 'Экологическая экспертиза'           THEN 'Экологическая экспертиза'
  WHEN 'Товароведческая'                    THEN 'Товароведческая экспертиза'
  WHEN 'Товароведческая экспертиза'         THEN 'Товароведческая экспертиза'
  WHEN 'Компьютерно-техническая'            THEN 'Компьютерно-техническая экспертиза'
  WHEN 'Компьютерно-техническая экспертиза' THEN 'Компьютерно-техническая экспертиза'
  WHEN 'Медицинская'                        THEN 'Судебно-медицинская экспертиза'
  WHEN 'Судебно-медицинская экспертиза'     THEN 'Судебно-медицинская экспертиза'
  WHEN 'Лингвистическая'                    THEN 'Лингвистическая экспертиза'
  WHEN 'Лингвистическая экспертиза'         THEN 'Лингвистическая экспертиза'
  WHEN 'Другая'                             THEN 'Другие экспертизы'
  WHEN 'Другие экспертизы'                  THEN 'Другие экспертизы'
  ELSE                                            'Другие экспертизы'
END
AND r.expertise_direction_id IS NULL;

-- Любые оставшиеся без маппинга → Другие экспертизы
UPDATE palata_requests r
SET expertise_direction_id = (
  SELECT id FROM palata_expertise_directions WHERE name = 'Другие экспертизы' LIMIT 1
)
WHERE r.expertise_direction_id IS NULL
  AND r.expertise_type IS NOT NULL
  AND r.expertise_type <> '';

-- ── 5b. Перенос специализаций экспертов: specializations[] → palata_expert_directions ──

INSERT INTO palata_expert_directions (expert_id, expertise_direction_id)
SELECT ep.user_id, d.id
FROM palata_expert_profiles ep
CROSS JOIN LATERAL unnest(ep.specializations) AS s(slug)
JOIN palata_expertise_directions d ON d.name = CASE s.slug
  WHEN 'avtotechnicheskaya'        THEN 'Автотехническая экспертиза'
  WHEN 'zemleustroitelnaya'        THEN 'Землеустроительная экспертиза'
  WHEN 'pocherkovedcheskaya'       THEN 'Почерковедческая экспертиза'
  WHEN 'finansovo-ekonomicheskaya' THEN 'Финансово-экономическая экспертиза'
  WHEN 'kompyuterno-tehnicheskaya' THEN 'Компьютерно-техническая экспертиза'
  WHEN 'stroitelno-tehnicheskaya'  THEN 'Строительно-техническая экспертиза'
  WHEN 'pozharno-tehnicheskaya'    THEN 'Пожарно-техническая экспертиза'
  WHEN 'tovaroved'                 THEN 'Товароведческая экспертиза'
  WHEN 'tovarovedcheskaya'         THEN 'Товароведческая экспертиза'
  WHEN 'psihologicheskaya'         THEN 'Психологическая экспертиза'
  WHEN 'lingvisticheskaya'         THEN 'Лингвистическая экспертиза'
  WHEN 'ocenochnaya'               THEN 'Оценочная экспертиза'
  WHEN 'trasologicheskaya'         THEN 'Трасологическая экспертиза'
  WHEN 'elektrotehnicheskaya'      THEN 'Электротехническая экспертиза'
  WHEN 'ekologicheskaya'           THEN 'Экологическая экспертиза'
  WHEN 'medicinskaya'              THEN 'Судебно-медицинская экспертиза'
  WHEN 'buhgalterskaya'            THEN 'Другие экспертизы'
  WHEN 'psihiatricheskaya'         THEN 'Другие экспертизы'
  ELSE                                  'Другие экспертизы'
END
ON CONFLICT (expert_id, expertise_direction_id) DO NOTHING;

-- ── Комментарии ──────────────────────────────────────────────────────────────

COMMENT ON TABLE palata_expertise_directions IS
  'Единый справочник направлений судебных экспертиз. Источник истины для всего приложения.';
COMMENT ON TABLE palata_expert_directions IS
  'Связь эксперт ↔ направление экспертизы. Заменяет palata_expert_profiles.specializations как источник для подбора.';
COMMENT ON COLUMN palata_requests.expertise_direction_id IS
  'FK на palata_expertise_directions. Новый источник истины для направления заказа. expertise_type сохранён для обратной совместимости.';
