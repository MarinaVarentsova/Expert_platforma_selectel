-- =============================================================================
-- Migration 015: Профиль эксперта Анны + полный тестовый сид
--
-- Запустить в Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Безопасно повторять: все INSERT используют ON CONFLICT DO NOTHING / DO UPDATE.
--
-- ANN_ID    = 13fdcded-0ba9-4baf-bac8-497054fa9082  (эксперт, podshivailovaann@gmail.com)
-- MARINA_ID = 55469b80-387d-4ef6-b03c-f56ca48bfab8  (заказчик, varentsovsmv@gmail.com)
-- =============================================================================

-- ============================================================================
-- 1. palata_users — убеждаемся что оба пользователя есть с нужными ID
-- ============================================================================

INSERT INTO palata_users (id, role, email, full_name, is_active)
VALUES
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8', 'customer', 'varentsovsmv@gmail.com',    'Варенцова Марина Варенцовна',     TRUE),
    ('13fdcded-0ba9-4baf-bac8-497054fa9082', 'expert',   'podshivailovaann@gmail.com', 'Подшивайлова Анна Подшивайлова', TRUE)
ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role      = EXCLUDED.role,
        is_active = TRUE;

-- ============================================================================
-- 2. palata_expert_profiles — профиль Анны
-- ============================================================================

INSERT INTO palata_expert_profiles (
    id,
    user_id,
    status,
    specializations,
    regions,
    experience_years,
    education,
    certifications,
    accepts_requests,
    business_trip_ready,
    palata_registry_verified,
    centrsudexpert_verified,
    palata_registry_number,
    centrsudexpert_registry_number,
    avg_customer_rating,
    completed_orders_count,
    bio
)
VALUES (
    'e0000001-0000-0000-0000-000000000001',
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    'active',
    ARRAY[
        'avtotechnicheskaya',
        'zemleustroitelnaya',
        'pocherkovedcheskaya',
        'finansovo-ekonomicheskaya',
        'kompyuterno-tehnicheskaya'
    ],
    ARRAY[
        'Moskva',
        'Sankt-Peterburg',
        'Krasnodar',
        'Nizhny Novgorod',
        'Ekaterinburg',
        'Kazan',
        'Rostov-na-Donu'
    ],
    12,
    'МГТУ им. Баумана, специальность «Судебная экспертиза»; повышение квалификации — НИИ судебных экспертиз ФСФР, 2019',
    ARRAY[
        'Сертификат судебного эксперта по автотехнической экспертизе — РФЦСЭ, 2014',
        'Сертификат по землеустроительным и кадастровым экспертизам — Росреестр, 2017',
        'Допуск к работе с электронными доказательствами — Минцифры, 2022'
    ],
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    'ПСЭ-2015-0847',
    'ЦСЭ-2018-1243',
    4.50,
    2,
    'Более 12 лет практики в судебной экспертизе. Специализируюсь на автотехнических, землеустроительных и почерковедческих исследованиях. Работаю с арбитражными судами, судами общей юрисдикции и следственными органами. Провела свыше 300 экспертиз, ни одно заключение не было отклонено судом по формальным основаниям. Придерживаюсь принципа полной процессуальной независимости.'
)
ON CONFLICT (user_id) DO UPDATE
    SET status                        = EXCLUDED.status,
        specializations               = EXCLUDED.specializations,
        regions                       = EXCLUDED.regions,
        experience_years              = EXCLUDED.experience_years,
        education                     = EXCLUDED.education,
        certifications                = EXCLUDED.certifications,
        accepts_requests              = EXCLUDED.accepts_requests,
        business_trip_ready           = EXCLUDED.business_trip_ready,
        palata_registry_verified      = EXCLUDED.palata_registry_verified,
        centrsudexpert_verified       = EXCLUDED.centrsudexpert_verified,
        palata_registry_number        = EXCLUDED.palata_registry_number,
        centrsudexpert_registry_number = EXCLUDED.centrsudexpert_registry_number,
        bio                           = EXCLUDED.bio;

-- ============================================================================
-- 3. palata_requests — 10 заявок от Марины
-- ============================================================================

INSERT INTO palata_requests (
    id, customer_id, status, title, description,
    expertise_type, region, matching_round, urgency, requires_travel,
    deadline, preferred_start, budget_min, budget_max,
    created_at, updated_at
)
VALUES
    -- R01: NEW
    ('b0000001-0000-0000-0000-000000000001',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'new',
     'Строительно-техническая экспертиза жилого дома',
     'Необходимо оценить качество строительно-монтажных работ и выявить дефекты в жилом доме 2021 г.п. Спор с застройщиком по 214-ФЗ.',
     'stroitelno-tehnicheskaya', 'Moskva', 1, 'urgent', TRUE,
     NOW() + INTERVAL '30 days', NOW() + INTERVAL '7 days',
     50000, 120000,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

    -- R02: MATCHING
    ('b0000001-0000-0000-0000-000000000002',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'matching',
     'Землеустроительная экспертиза границ участка',
     'Спор с соседями о границах. Требуется установить фактические границы и сравнить с кадастровыми данными. Участок 15 соток.',
     'zemleustroitelnaya', 'Sankt-Peterburg', 1, 'normal', FALSE,
     NOW() + INTERVAL '45 days', NULL,
     30000, 80000,
     NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days'),

    -- R03: EXPERT_SELECTION
    ('b0000001-0000-0000-0000-000000000003',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'expert_selection',
     'Автотехническая экспертиза после ДТП на трассе М4',
     'ДТП 12.04.2026. Необходимо установить скорость ТС, техническую исправность и механизм столкновения. Два автомобиля.',
     'avtotechnicheskaya', 'Krasnodar', 1, 'urgent', FALSE,
     NOW() + INTERVAL '20 days', NULL,
     40000, 90000,
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

    -- R04: CONTACTS_OPENED
    ('b0000001-0000-0000-0000-000000000004',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'expert_selection',
     'Почерковедческая экспертиза завещания',
     'Оспаривается подлинность подписи наследодателя в завещании от 2023 года. Дело в суде общей юрисдикции Нижегородской области.',
     'pocherkovedcheskaya', 'Nizhny Novgorod', 1, 'normal', FALSE,
     NOW() + INTERVAL '35 days', NOW() + INTERVAL '14 days',
     25000, 60000,
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '12 days'),

    -- R05: CAN_START_FROM
    ('b0000001-0000-0000-0000-000000000005',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'expert_selection',
     'Финансово-экономическая экспертиза расчётов застройщика',
     'Требуется проверить корректность расчётов неустойки по 214-ФЗ и оценить убытки дольщика. Сумма иска 1,8 млн руб.',
     'finansovo-ekonomicheskaya', 'Ekaterinburg', 1, 'normal', FALSE,
     NOW() + INTERVAL '50 days', NOW() + INTERVAL '20 days',
     35000, 75000,
     NOW() - INTERVAL '25 days', NOW() - INTERVAL '10 days'),

    -- R06: IN_WORK
    ('b0000001-0000-0000-0000-000000000006',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'in_work',
     'Пожарно-техническая экспертиза склада',
     'Установить причину пожара, оценить соответствие объекта требованиям пожарной безопасности, определить виновных.',
     'pozharno-tehnicheskaya', 'Kazan', 1, 'very_urgent', TRUE,
     NOW() + INTERVAL '10 days', NOW() + INTERVAL '3 days',
     60000, 150000,
     NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days'),

    -- R07: COMPLETED ★★★★★
    ('b0000001-0000-0000-0000-000000000007',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'completed',
     'Строительно-техническая экспертиза нежилого помещения',
     'Требуется определить объём и стоимость необходимых ремонтных работ для приведения помещения в надлежащее состояние.',
     'stroitelno-tehnicheskaya', 'Rostov-na-Donu', 1, 'normal', FALSE,
     NOW() - INTERVAL '5 days', NOW() - INTERVAL '30 days',
     45000, 100000,
     NOW() - INTERVAL '60 days', NOW() - INTERVAL '10 days'),

    -- R08: COMPLETED ★★★★
    ('b0000001-0000-0000-0000-000000000008',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'completed',
     'Автотехническая экспертиза транспортного средства',
     'Оценить техническое состояние автомобиля после ДТП, определить стоимость восстановительного ремонта.',
     'avtotechnicheskaya', 'Moskva', 1, 'urgent', FALSE,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '35 days',
     30000, 70000,
     NOW() - INTERVAL '40 days', NOW() - INTERVAL '20 days'),

    -- R09: DECLINED
    ('b0000001-0000-0000-0000-000000000009',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'declined',
     'Землеустроительная экспертиза спорного участка в Самаре',
     'Определить соответствие фактического использования участка его целевому назначению по кадастру.',
     'zemleustroitelnaya', 'Samara', 1, 'normal', TRUE,
     NOW() + INTERVAL '15 days', NULL,
     20000, 50000,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '8 days'),

    -- R10: REPEAT_MATCHING
    ('b0000001-0000-0000-0000-000000000010',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'matching',
     'Компьютерно-техническая экспертиза переписки в мессенджерах',
     'Установить подлинность переписки, определить дату отправки сообщений и принадлежность аккаунтов сторонам дела.',
     'kompyuterno-tehnicheskaya', 'Novosibirsk', 2, 'normal', FALSE,
     NOW() + INTERVAL '40 days', NULL,
     25000, 55000,
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '3 days')

ON CONFLICT (id) DO NOTHING;

-- Назначить Анну ответственным экспертом на in_work и completed заявки
UPDATE palata_requests
SET assigned_expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE id IN (
    'b0000001-0000-0000-0000-000000000006',
    'b0000001-0000-0000-0000-000000000007',
    'b0000001-0000-0000-0000-000000000008'
) AND assigned_expert_id IS NULL;

-- ============================================================================
-- 4. palata_request_matches
-- ============================================================================

INSERT INTO palata_request_matches (
    request_id, expert_id, matching_round, status, decline_reason, decline_note,
    can_start_from_date, proposed_at, responded_at, created_at, updated_at
)
VALUES
    -- R02: MATCHING — Анна предложена
    ('b0000001-0000-0000-0000-000000000002', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'proposed', NULL, NULL, NULL,
     NOW() - INTERVAL '5 days', NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),

    -- R03: EXPERT_SELECTION — Анна предложена, ждёт решения
    ('b0000001-0000-0000-0000-000000000003', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'proposed', NULL, NULL, NULL,
     NOW() - INTERVAL '8 days', NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),

    -- R04: CONTACTS_OPENED
    ('b0000001-0000-0000-0000-000000000004', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'contacts_opened', NULL, NULL, NULL,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days',
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days'),

    -- R05: CAN_START_FROM
    ('b0000001-0000-0000-0000-000000000005', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'can_start_from', NULL, NULL, '2026-06-10',
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days'),

    -- R06: IN_WORK
    ('b0000001-0000-0000-0000-000000000006', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'accepted_work', NULL, NULL, NULL,
     NOW() - INTERVAL '30 days', NOW() - INTERVAL '20 days',
     NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),

    -- R07: COMPLETED ★★★★★
    ('b0000001-0000-0000-0000-000000000007', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'completed', NULL, NULL, NULL,
     NOW() - INTERVAL '55 days', NOW() - INTERVAL '45 days',
     NOW() - INTERVAL '55 days', NOW() - INTERVAL '10 days'),

    -- R08: COMPLETED ★★★★
    ('b0000001-0000-0000-0000-000000000008', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'completed', NULL, NULL, NULL,
     NOW() - INTERVAL '40 days', NOW() - INTERVAL '35 days',
     NOW() - INTERVAL '40 days', NOW() - INTERVAL '20 days'),

    -- R09: DECLINED — занята
    ('b0000001-0000-0000-0000-000000000009', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'declined', 'busy', 'Плотный график в июне, не смогу взять дополнительные заявки', NULL,
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days',
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

    -- R10: раунд 1 — не в регионе
    ('b0000001-0000-0000-0000-000000000010', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'declined', 'location', 'В Новосибирск не выезжаю, командировки не планирую', NULL,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '10 days'),

    -- R10: раунд 2 — снова предложена
    ('b0000001-0000-0000-0000-000000000010', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     2, 'proposed', NULL, NULL, NULL,
     NOW() - INTERVAL '3 days', NULL,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')

ON CONFLICT (request_id, expert_id, matching_round) DO NOTHING;

-- ============================================================================
-- 5. palata_request_contacts
-- ============================================================================

INSERT INTO palata_request_contacts (
    id, request_id, expert_id, revealed_at,
    customer_phone, customer_email, expert_phone, expert_email
)
VALUES
    ('c0000001-0000-0000-0000-000000000004',
     'b0000001-0000-0000-0000-000000000004', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '12 days',
     '+79161234567', 'varentsovsmv@gmail.com', '+79031234567', 'podshivailovaann@gmail.com'),

    ('c0000001-0000-0000-0000-000000000005',
     'b0000001-0000-0000-0000-000000000005', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '18 days',
     '+79161234567', 'varentsovsmv@gmail.com', '+79031234567', 'podshivailovaann@gmail.com'),

    ('c0000001-0000-0000-0000-000000000006',
     'b0000001-0000-0000-0000-000000000006', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '25 days',
     '+79161234567', 'varentsovsmv@gmail.com', '+79031234567', 'podshivailovaann@gmail.com'),

    ('c0000001-0000-0000-0000-000000000007',
     'b0000001-0000-0000-0000-000000000007', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '50 days',
     '+79161234567', 'varentsovsmv@gmail.com', '+79031234567', 'podshivailovaann@gmail.com'),

    ('c0000001-0000-0000-0000-000000000008',
     'b0000001-0000-0000-0000-000000000008', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '38 days',
     '+79161234567', 'varentsovsmv@gmail.com', '+79031234567', 'podshivailovaann@gmail.com')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. palata_expert_ratings
-- ============================================================================

INSERT INTO palata_expert_ratings (request_id, expert_id, customer_id, score, comment, created_at)
VALUES
    ('b0000001-0000-0000-0000-000000000007',
     '13fdcded-0ba9-4baf-bac8-497054fa9082', '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     5, 'Анна провела экспертизу очень профессионально, в срок, с подробным заключением. Суд принял его без вопросов. Горячо рекомендую!',
     NOW() - INTERVAL '10 days'),
    ('b0000001-0000-0000-0000-000000000008',
     '13fdcded-0ba9-4baf-bac8-497054fa9082', '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     4, 'Хорошая работа, заключение обоснованное. Пришлось один раз доработать формулировку по запросу суда, но в целом всё отлично.',
     NOW() - INTERVAL '20 days')
ON CONFLICT (request_id, expert_id) DO NOTHING;

INSERT INTO palata_customer_ratings (request_id, customer_id, expert_id, score, comment, created_at)
VALUES
    ('b0000001-0000-0000-0000-000000000007',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     5, 'Клиент оперативно предоставил все документы, чётко сформулировал задачу. Очень приятно работать с профессиональным заказчиком.',
     NOW() - INTERVAL '9 days'),
    ('b0000001-0000-0000-0000-000000000008',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8', '13fdcded-0ba9-4baf-bac8-497054fa9082',
     5, 'Отличный специалист в своём вопросе, знает все нюансы ДТП. Разобрался в деталях лучше страхового оценщика.',
     NOW() - INTERVAL '19 days')
ON CONFLICT (request_id, customer_id) DO NOTHING;

-- ============================================================================
-- 7. Verification
-- ============================================================================

SELECT
    ep.id                AS expert_profile_id,
    pu.email,
    pu.role,
    ep.status            AS profile_status,
    ep.palata_registry_verified,
    ep.centrsudexpert_verified,
    ep.avg_customer_rating,
    ep.completed_orders_count,
    (SELECT COUNT(*) FROM palata_requests WHERE customer_id = '55469b80-387d-4ef6-b03c-f56ca48bfab8') AS marina_requests,
    (SELECT COUNT(*) FROM palata_request_matches WHERE expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082') AS anna_matches
FROM palata_expert_profiles ep
JOIN palata_users pu ON pu.id = ep.user_id
WHERE ep.user_id = '13fdcded-0ba9-4baf-bac8-497054fa9082';
