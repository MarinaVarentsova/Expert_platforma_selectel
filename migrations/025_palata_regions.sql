-- =============================================================================
-- Migration 025: палата_regions + junction tables for regions
-- Replaces string-based region fields with proper reference + junction tables.
-- =============================================================================

-- ── 1. Reference table ────────────────────────────────────────────────────────

CREATE TABLE palata_regions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INT  NOT NULL DEFAULT 0
);

-- ── 2. Junction tables ────────────────────────────────────────────────────────

CREATE TABLE palata_expert_regions (
  expert_id  UUID NOT NULL REFERENCES palata_users(id) ON DELETE CASCADE,
  region_id  UUID NOT NULL REFERENCES palata_regions(id) ON DELETE CASCADE,
  PRIMARY KEY (expert_id, region_id)
);

CREATE TABLE palata_customer_regions (
  customer_id UUID NOT NULL REFERENCES palata_users(id) ON DELETE CASCADE,
  region_id   UUID NOT NULL REFERENCES palata_regions(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, region_id)
);

CREATE TABLE palata_request_regions (
  request_id UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
  region_id  UUID NOT NULL REFERENCES palata_regions(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, region_id)
);

-- ── 3. Make palata_requests.region nullable (was NOT NULL) ────────────────────

ALTER TABLE palata_requests ALTER COLUMN region DROP NOT NULL;
ALTER TABLE palata_requests ALTER COLUMN region SET DEFAULT '';

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE palata_regions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE palata_expert_regions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE palata_customer_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE palata_request_regions  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_regions' AND policyname='Anyone can read palata_regions') THEN
    EXECUTE 'CREATE POLICY "Anyone can read palata_regions" ON palata_regions FOR SELECT USING (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_expert_regions' AND policyname='Authenticated read expert_regions') THEN
    EXECUTE 'CREATE POLICY "Authenticated read expert_regions" ON palata_expert_regions FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_expert_regions' AND policyname='Anon read expert_regions') THEN
    EXECUTE 'CREATE POLICY "Anon read expert_regions" ON palata_expert_regions FOR SELECT TO anon USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_expert_regions' AND policyname='Expert manage own regions') THEN
    EXECUTE 'CREATE POLICY "Expert manage own regions" ON palata_expert_regions FOR ALL TO authenticated USING (expert_id = auth.uid()) WITH CHECK (expert_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_customer_regions' AND policyname='Authenticated read customer_regions') THEN
    EXECUTE 'CREATE POLICY "Authenticated read customer_regions" ON palata_customer_regions FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_customer_regions' AND policyname='Anon read customer_regions') THEN
    EXECUTE 'CREATE POLICY "Anon read customer_regions" ON palata_customer_regions FOR SELECT TO anon USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_customer_regions' AND policyname='Customer manage own regions') THEN
    EXECUTE 'CREATE POLICY "Customer manage own regions" ON palata_customer_regions FOR ALL TO authenticated USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_request_regions' AND policyname='Authenticated read request_regions') THEN
    EXECUTE 'CREATE POLICY "Authenticated read request_regions" ON palata_request_regions FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_request_regions' AND policyname='Anon read request_regions') THEN
    EXECUTE 'CREATE POLICY "Anon read request_regions" ON palata_request_regions FOR SELECT TO anon USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_request_regions' AND policyname='Anon insert request_regions') THEN
    EXECUTE 'CREATE POLICY "Anon insert request_regions" ON palata_request_regions FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_request_regions' AND policyname='Authenticated insert request_regions') THEN
    EXECUTE 'CREATE POLICY "Authenticated insert request_regions" ON palata_request_regions FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='palata_request_regions' AND policyname='Authenticated delete own request_regions') THEN
    EXECUTE 'CREATE POLICY "Authenticated delete own request_regions" ON palata_request_regions FOR DELETE TO authenticated USING (request_id IN (SELECT id FROM palata_requests WHERE customer_id = auth.uid()))';
  END IF;
END $$;

-- ── 5. Seed: все 85 субъектов РФ ─────────────────────────────────────────────

INSERT INTO palata_regions (name, sort_order) VALUES
  ('Москва',                                        1),
  ('Санкт-Петербург',                               2),
  ('Севастополь',                                   3),
  ('Республика Адыгея',                             10),
  ('Республика Алтай',                              11),
  ('Республика Башкортостан',                       12),
  ('Республика Бурятия',                            13),
  ('Республика Дагестан',                           14),
  ('Республика Ингушетия',                          15),
  ('Кабардино-Балкарская Республика',               16),
  ('Республика Калмыкия',                           17),
  ('Карачаево-Черкесская Республика',               18),
  ('Республика Карелия',                            19),
  ('Республика Коми',                               20),
  ('Республика Крым',                               21),
  ('Республика Марий Эл',                           22),
  ('Республика Мордовия',                           23),
  ('Республика Саха (Якутия)',                      24),
  ('Республика Северная Осетия — Алания',           25),
  ('Республика Татарстан',                          26),
  ('Республика Тыва',                               27),
  ('Удмуртская Республика',                         28),
  ('Республика Хакасия',                            29),
  ('Чеченская Республика',                          30),
  ('Чувашская Республика',                          31),
  ('Алтайский край',                                40),
  ('Забайкальский край',                            41),
  ('Камчатский край',                               42),
  ('Краснодарский край',                            43),
  ('Красноярский край',                             44),
  ('Пермский край',                                 45),
  ('Приморский край',                               46),
  ('Ставропольский край',                           47),
  ('Хабаровский край',                              48),
  ('Амурская область',                              60),
  ('Архангельская область',                         61),
  ('Астраханская область',                          62),
  ('Белгородская область',                          63),
  ('Брянская область',                              64),
  ('Владимирская область',                          65),
  ('Волгоградская область',                         66),
  ('Вологодская область',                           67),
  ('Воронежская область',                           68),
  ('Ивановская область',                            69),
  ('Иркутская область',                             70),
  ('Калининградская область',                       71),
  ('Калужская область',                             72),
  ('Кемеровская область',                           73),
  ('Кировская область',                             74),
  ('Костромская область',                           75),
  ('Курганская область',                            76),
  ('Курская область',                               77),
  ('Ленинградская область',                         78),
  ('Липецкая область',                              79),
  ('Магаданская область',                           80),
  ('Московская область',                            81),
  ('Мурманская область',                            82),
  ('Нижегородская область',                         83),
  ('Новгородская область',                          84),
  ('Новосибирская область',                         85),
  ('Омская область',                                86),
  ('Оренбургская область',                          87),
  ('Орловская область',                             88),
  ('Пензенская область',                            89),
  ('Псковская область',                             90),
  ('Ростовская область',                            91),
  ('Рязанская область',                             92),
  ('Самарская область',                             93),
  ('Саратовская область',                           94),
  ('Сахалинская область',                           95),
  ('Свердловская область',                          96),
  ('Смоленская область',                            97),
  ('Тамбовская область',                            98),
  ('Тверская область',                              99),
  ('Томская область',                               100),
  ('Тульская область',                              101),
  ('Тюменская область',                             102),
  ('Ульяновская область',                           103),
  ('Челябинская область',                           104),
  ('Ярославская область',                           105),
  ('Еврейская автономная область',                  110),
  ('Ненецкий автономный округ',                     120),
  ('Ханты-Мансийский автономный округ — Югра',      121),
  ('Чукотский автономный округ',                    122),
  ('Ямало-Ненецкий автономный округ',               123);
