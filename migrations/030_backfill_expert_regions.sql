-- =============================================================================
-- Migration 030: backfill palata_expert_regions for existing experts
-- =============================================================================
-- Run in Supabase Studio → SQL Editor → New query → Run
--
-- PROBLEM: Experts who registered via email-confirmation flow (or were seeded
-- before migration 025 introduced palata_expert_regions) have no rows in
-- palata_expert_regions. Their region data is either:
--   a) In the legacy palata_expert_profiles.regions TEXT[] (seeded experts)
--   b) Completely absent (email-confirmation registrants)
--
-- This migration:
--   1. Backfills palata_expert_regions from legacy TEXT[] using a name mapping
--   2. Provides a direct INSERT for known experts (e.g. Сударикова)
-- =============================================================================

-- ── Part 1: backfill from legacy TEXT[] using known transliteration mapping ──

WITH mapping (legacy_key, russian_name) AS (
  VALUES
    ('Moskva',               'Москва'),
    ('Sankt-Peterburg',      'Санкт-Петербург'),
    ('Sevastopol',           'Севастополь'),
    ('Krasnodar',            'Краснодарский край'),
    ('Nizhny Novgorod',      'Нижегородская область'),
    ('Ekaterinburg',         'Свердловская область'),
    ('Kazan',                'Республика Татарстан'),
    ('Rostov-na-Donu',       'Ростовская область'),
    ('Novosibirsk',          'Новосибирская область'),
    ('Chelyabinsk',          'Челябинская область'),
    ('Samara',               'Самарская область'),
    ('Ufa',                  'Республика Башкортостан'),
    ('Omsk',                 'Омская область'),
    ('Krasnoyarsk',          'Красноярский край'),
    ('Perm',                 'Пермский край'),
    ('Voronezh',             'Воронежская область'),
    ('Volgograd',            'Волгоградская область'),
    ('Saratov',              'Саратовская область'),
    ('Tyumen',               'Тюменская область'),
    ('Irkutsk',              'Иркутская область'),
    ('Barnaul',              'Алтайский край'),
    ('Vladivostok',          'Приморский край'),
    ('Khabarovsk',           'Хабаровский край'),
    ('Stavropol',            'Ставропольский край'),
    ('Adygea',               'Республика Адыгея'),
    ('Respublika-Adygea',    'Республика Адыгея'),
    ('Respublika Adygea',    'Республика Адыгея'),
    ('Adygeja',              'Республика Адыгея')
)
INSERT INTO palata_expert_regions (expert_id, region_id)
SELECT DISTINCT
  ep.user_id,
  r.id
FROM palata_expert_profiles ep
JOIN LATERAL unnest(ep.regions) AS leg(val) ON true
JOIN mapping m ON lower(m.legacy_key) = lower(leg.val)
JOIN palata_regions r ON r.name = m.russian_name
WHERE ep.regions IS NOT NULL
  AND array_length(ep.regions, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM palata_expert_regions er
    WHERE er.expert_id = ep.user_id
  )
ON CONFLICT DO NOTHING;

-- ── Part 2: direct insert for known experts by full_name + region name ────────
-- Add more rows below if other experts are missing regions.

-- Сударикова — Республика Адыгея
INSERT INTO palata_expert_regions (expert_id, region_id)
SELECT u.id, r.id
FROM palata_users u
CROSS JOIN palata_regions r
WHERE u.full_name ILIKE '%Судар%'
  AND r.name = 'Республика Адыгея'
  AND NOT EXISTS (
    SELECT 1 FROM palata_expert_regions er
    WHERE er.expert_id = u.id AND er.region_id = r.id
  )
ON CONFLICT DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  u.full_name,
  string_agg(r.name, ', ' ORDER BY r.name) AS regions
FROM palata_expert_regions er
JOIN palata_users u ON u.id = er.expert_id
JOIN palata_regions r ON r.id = er.region_id
GROUP BY u.full_name
ORDER BY u.full_name;
