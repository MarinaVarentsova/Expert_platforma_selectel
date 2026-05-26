-- =============================================================================
-- Migration 006: Test users — Варенцова (customer) + Подшивайлова (expert)
-- =============================================================================
-- Safe to run on existing data — all INSERTs use ON CONFLICT DO NOTHING.
-- Uses session_replication_role = replica to bypass FK auth.users constraint
-- (auth not yet connected; rows can be promoted later, see NOTE below).
--
-- NOTE: When Supabase Auth is activated:
--   1. Create auth.users records for these emails via Supabase Dashboard
--      (Authentication → Users → Invite user) or via service-role API.
--   2. Update palata_users.id to match the generated auth.users.id:
--
--      UPDATE palata_users
--         SET id = '<new-auth-uuid>'
--       WHERE email = 'varentsovsmv@gmail.com';
--
--      UPDATE palata_users
--         SET id = '<new-auth-uuid>'
--       WHERE email = 'podshivailovaann@gmail.com';
--
--   3. Cascade will automatically update palata_customer_profiles and
--      palata_expert_profiles via FK references.
-- =============================================================================

SET session_replication_role = replica;

-- ── palata_users ──────────────────────────────────────────────────────────────

INSERT INTO palata_users (id, role, email, full_name, phone, is_active) VALUES
    -- Customer: Варенцова Марина
    ('00000002-0000-0000-0000-000000000006',
     'customer',
     'varentsovsmv@gmail.com',
     'Варенцова Марина',
     '+79201234567',
     TRUE),

    -- Expert: Подшивайлова Анна
    ('00000001-0000-0000-0000-000000000011',
     'expert',
     'podshivailovaann@gmail.com',
     'Подшивайлова Анна',
     '+79153456789',
     TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── palata_customer_profiles ──────────────────────────────────────────────────

INSERT INTO palata_customer_profiles (user_id, company_name, inn, contact_name, region, notes) VALUES
    ('00000002-0000-0000-0000-000000000006',
     NULL,
     NULL,
     'Варенцова Марина',
     'Иваново',
     'Тестовый заказчик — для проверки email-логики и workflow')
ON CONFLICT (user_id) DO NOTHING;

-- ── palata_expert_profiles ────────────────────────────────────────────────────
-- Регион хранится в формате русских названий, совпадающем с формой заявки,
-- чтобы алгоритм подбора (lib/matching.ts) находил этого эксперта
-- при заказах из Иваново.

INSERT INTO palata_expert_profiles (
    user_id,
    status,
    specializations,
    regions,
    experience_years,
    education,
    accepts_requests,
    business_trip_ready,
    palata_registry_verified,
    palata_registry_number,
    centrsudexpert_verified,
    centrsudexpert_registry_number,
    avg_customer_rating,
    completed_orders_count,
    decline_rate,
    bio
) VALUES (
    '00000001-0000-0000-0000-000000000011',
    'active',
    ARRAY['stroitelno-tehnicheskaya', 'zemleustroitelnaya', 'ocenochnaya'],
    ARRAY['Иваново', 'Ивановская область'],
    11,
    'ИГАСУ, кафедра строительных конструкций, 2013',
    TRUE,   -- принимает заказы
    TRUE,   -- готова к командировкам
    TRUE,   -- верифицирована в Палата СЭ
    'ПСЭ-2021-0847',
    TRUE,   -- верифицирована в Центр судэкспертиз
    'ЦСЭ-2020-1203',
    4.85,
    27,
    0.04,   -- 4% отказов
    'Строительно-технические, землеустроительные и оценочные экспертизы. ' ||
    'Основной регион — Иваново и область. ' ||
    'Опыт в судебных делах по земельным спорам, ущербу имуществу и оценке недвижимости.'
)
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================

SET session_replication_role = DEFAULT;
