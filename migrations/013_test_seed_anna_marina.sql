-- =============================================================================
-- Migration 013: Реалистичные тестовые данные — Анна & Марина workflow
-- =============================================================================
--
-- ANN_ID    = 13fdcded-0ba9-4baf-bac8-497054fa9082  (эксперт, podshivailovaann@gmail.com)
-- MARINA_ID = 55469b80-387d-4ef6-b03c-f56ca48bfab8  (заказчик, varentsovsmv@gmail.com)
--
-- Сценарии:
--   R01  NEW              Строительно-техническая,   Москва
--   R02  MATCHING         Землеустроительная,        Санкт-Петербург
--   R03  EXPERT_SELECTION Автотехническая,           Краснодар
--   R04  CONTACTS_OPENED  Почерковедческая,          Нижний Новгород
--   R05  CAN_START_FROM   Финансово-экономическая,   Екатеринбург
--   R06  IN_WORK          Пожарно-техническая,       Казань
--   R07  COMPLETED ★★★★★  Строительно-техническая,  Ростов-на-Дону
--   R08  COMPLETED ★★★★   Автотехническая,           Москва
--   R09  DECLINED         Землеустроительная,        Самара
--   R10  REPEAT_MATCHING  Компьютерно-техническая,   Новосибирск
--
-- Безопасно повторять: все INSERT используют ON CONFLICT DO NOTHING.
-- =============================================================================

-- ============================================================================
-- REQUESTS
-- ============================================================================

INSERT INTO palata_requests (
    id, customer_id, status, title, description,
    expertise_type, region, matching_round, urgency, requires_travel,
    deadline, preferred_start, budget_min, budget_max,
    created_at, updated_at
)
VALUES
    -- R01: NEW — только что подана, ещё не в подборе
    ('b0000001-0000-0000-0000-000000000001',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'new',
     'Строительно-техническая экспертиза жилого дома',
     'Необходимо оценить качество строительно-монтажных работ и выявить дефекты в жилом доме 2021 г.п. Спор с застройщиком по 214-ФЗ.',
     'stroitelno-tehnicheskaya', 'Moskva', 1, 'urgent', TRUE,
     NOW() + INTERVAL '30 days', NOW() + INTERVAL '7 days',
     50000, 120000,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

    -- R02: MATCHING — запущен подбор, Анна предложена, ответа нет
    ('b0000001-0000-0000-0000-000000000002',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'matching',
     'Землеустроительная экспертиза границ участка',
     'Спор с соседями о границах. Требуется установить фактические границы и сравнить с кадастровыми данными. Участок 15 соток.',
     'zemleustroitelnaya', 'Sankt-Peterburg', 1, 'normal', FALSE,
     NOW() + INTERVAL '45 days', NULL,
     30000, 80000,
     NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days'),

    -- R03: EXPERT_SELECTION — Анна выбрана, предложение направлено, ждём ответа
    ('b0000001-0000-0000-0000-000000000003',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'expert_selection',
     'Автотехническая экспертиза после ДТП на трассе М4',
     'ДТП 12.04.2026. Необходимо установить скорость ТС, техническую исправность и механизм столкновения. Два автомобиля.',
     'avtotechnicheskaya', 'Krasnodar', 1, 'urgent', FALSE,
     NOW() + INTERVAL '20 days', NULL,
     40000, 90000,
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

    -- R04: CONTACTS_OPENED — Анна открыла контакты с заказчиком
    ('b0000001-0000-0000-0000-000000000004',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'expert_selection',
     'Почерковедческая экспертиза завещания',
     'Оспаривается подлинность подписи наследодателя в завещании от 2023 года. Дело в суде общей юрисдикции Нижегородской области.',
     'pocherkovedcheskaya', 'Nizhny Novgorod', 1, 'normal', FALSE,
     NOW() + INTERVAL '35 days', NOW() + INTERVAL '14 days',
     25000, 60000,
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '12 days'),

    -- R05: CAN_START_FROM — Анна указала дату начала
    ('b0000001-0000-0000-0000-000000000005',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'expert_selection',
     'Финансово-экономическая экспертиза ООО «СтройГрупп»',
     'Анализ финансово-хозяйственной деятельности за 2021–2024 гг. Налоговый спор на 15 млн руб. Объём документов ~800 листов.',
     'finansovo-ekonomicheskaya', 'Ekaterinburg', 1, 'very_urgent', FALSE,
     NOW() + INTERVAL '14 days', NOW() + INTERVAL '5 days',
     80000, 200000,
     NOW() - INTERVAL '25 days', NOW() - INTERVAL '10 days'),

    -- R06: IN_WORK — заявка у Анны в работе
    ('b0000001-0000-0000-0000-000000000006',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'in_work',
     'Пожарно-техническая экспертиза склада',
     'Установление причин пожара на складе промышленных товаров. Ущерб ~8 млн руб. Уголовное дело, ч.1 ст.168 УК РФ.',
     'pozharno-tehnicheskaya', 'Kazan', 1, 'urgent', TRUE,
     NOW() + INTERVAL '10 days', NULL,
     70000, 150000,
     NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days'),

    -- R07: COMPLETED ★★★★★
    ('b0000001-0000-0000-0000-000000000007',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'completed',
     'Строительно-техническая экспертиза после залива',
     'Оценка ущерба от залива соседями. Квартира на 4 этаже, ущерб ~600 тыс. руб. Гражданский иск.',
     'stroitelno-tehnicheskaya', 'Rostov-na-Donu', 1, 'normal', FALSE,
     NULL, NULL,
     35000, 70000,
     NOW() - INTERVAL '60 days', NOW() - INTERVAL '10 days'),

    -- R08: COMPLETED ★★★★
    ('b0000001-0000-0000-0000-000000000008',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'completed',
     'Автотехническая экспертиза по ОСАГО',
     'Спор со страховой компанией по выплате. Требуется определить стоимость восстановительного ремонта автомобиля Toyota Camry 2020.',
     'avtotechnicheskaya', 'Moskva', 1, 'urgent', FALSE,
     NULL, NULL,
     20000, 45000,
     NOW() - INTERVAL '45 days', NOW() - INTERVAL '20 days'),

    -- R09: DECLINED — Анна отказала, заявка вернулась в подбор
    ('b0000001-0000-0000-0000-000000000009',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'matching',
     'Землеустроительная экспертиза промышленной зоны',
     'Определение границ и площади промышленного участка в Самарской области. Спор с муниципалитетом о сервитуте.',
     'zemleustroitelnaya', 'Samara', 1, 'normal', TRUE,
     NOW() + INTERVAL '40 days', NULL,
     45000, 100000,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '8 days'),

    -- R10: REPEAT_MATCHING — раунд 1 не дал результата, идёт раунд 2
    ('b0000001-0000-0000-0000-000000000010',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'matching',
     'Компьютерно-техническая экспертиза деловой переписки',
     'Установление автора и времени создания электронной переписки для корпоративного спора. Архив ~2 ГБ.',
     'kompyuterno-tehnicheskaya', 'Novosibirsk', 2, 'normal', FALSE,
     NOW() + INTERVAL '25 days', NULL,
     30000, 65000,
     NOW() - INTERVAL '18 days', NOW() - INTERVAL '3 days')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- MATCHES
-- ============================================================================

INSERT INTO palata_request_matches (
    request_id, expert_id, matching_round, status, decline_reason, decline_note,
    can_start_from_date, proposed_at, responded_at, created_at, updated_at
)
VALUES
    -- R02: MATCHING — Анна предложена, ответа нет
    ('b0000001-0000-0000-0000-000000000002',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'proposed', NULL, NULL, NULL,
     NOW() - INTERVAL '5 days', NULL,
     NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),

    -- R03: EXPERT_SELECTION — Анна в статусе proposed (ждёт решения)
    ('b0000001-0000-0000-0000-000000000003',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'proposed', NULL, NULL, NULL,
     NOW() - INTERVAL '8 days', NULL,
     NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),

    -- R04: CONTACTS_OPENED — Анна открыла контакты
    ('b0000001-0000-0000-0000-000000000004',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'contacts_opened', NULL, NULL, NULL,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days',
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days'),

    -- R05: CAN_START_FROM — Анна может начать с 10 июня
    ('b0000001-0000-0000-0000-000000000005',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'can_start_from', NULL, NULL, '2026-06-10',
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days'),

    -- R06: IN_WORK — Анна взяла в работу
    ('b0000001-0000-0000-0000-000000000006',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'accepted_work', NULL, NULL, NULL,
     NOW() - INTERVAL '30 days', NOW() - INTERVAL '20 days',
     NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),

    -- R07: COMPLETED ★★★★★
    ('b0000001-0000-0000-0000-000000000007',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'completed', NULL, NULL, NULL,
     NOW() - INTERVAL '55 days', NOW() - INTERVAL '45 days',
     NOW() - INTERVAL '55 days', NOW() - INTERVAL '10 days'),

    -- R08: COMPLETED ★★★★
    ('b0000001-0000-0000-0000-000000000008',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'completed', NULL, NULL, NULL,
     NOW() - INTERVAL '40 days', NOW() - INTERVAL '35 days',
     NOW() - INTERVAL '40 days', NOW() - INTERVAL '20 days'),

    -- R09: DECLINED — Анна отказала (занята)
    ('b0000001-0000-0000-0000-000000000009',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'declined', 'busy', 'Плотный график в июне, не смогу взять дополнительные заявки',
     NULL,
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days',
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

    -- R10: раунд 1 — Анна отказала (не в регионе)
    ('b0000001-0000-0000-0000-000000000010',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     1, 'declined', 'location', 'В Новосибирск не выезжаю, командировки не планирую',
     NULL,
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '15 days', NOW() - INTERVAL '10 days'),

    -- R10: раунд 2 — Анна снова предложена (новый раунд подбора)
    ('b0000001-0000-0000-0000-000000000010',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     2, 'proposed', NULL, NULL, NULL,
     NOW() - INTERVAL '3 days', NULL,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')

ON CONFLICT (request_id, expert_id, matching_round) DO NOTHING;

-- Назначить Анну ответственным экспертом на in_work и completed заявки
UPDATE palata_requests
SET assigned_expert_id = '13fdcded-0ba9-4baf-bac8-497054fa9082'
WHERE id IN (
    'b0000001-0000-0000-0000-000000000006',
    'b0000001-0000-0000-0000-000000000007',
    'b0000001-0000-0000-0000-000000000008'
) AND assigned_expert_id IS NULL;

-- ============================================================================
-- CONTACTS (раскрытые контакты)
-- ============================================================================

INSERT INTO palata_request_contacts (
    id, request_id, expert_id, revealed_at,
    customer_phone, customer_email, expert_phone, expert_email
)
VALUES
    -- R04: CONTACTS_OPENED
    ('c0000001-0000-0000-0000-000000000004',
     'b0000001-0000-0000-0000-000000000004',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '12 days',
     '+79161234567', 'varentsovsmv@gmail.com',
     '+79031234567', 'podshivailovaann@gmail.com'),

    -- R05: CAN_START_FROM (контакты были открыты раньше)
    ('c0000001-0000-0000-0000-000000000005',
     'b0000001-0000-0000-0000-000000000005',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '18 days',
     '+79161234567', 'varentsovsmv@gmail.com',
     '+79031234567', 'podshivailovaann@gmail.com'),

    -- R06: IN_WORK
    ('c0000001-0000-0000-0000-000000000006',
     'b0000001-0000-0000-0000-000000000006',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '25 days',
     '+79161234567', 'varentsovsmv@gmail.com',
     '+79031234567', 'podshivailovaann@gmail.com'),

    -- R07: COMPLETED
    ('c0000001-0000-0000-0000-000000000007',
     'b0000001-0000-0000-0000-000000000007',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '50 days',
     '+79161234567', 'varentsovsmv@gmail.com',
     '+79031234567', 'podshivailovaann@gmail.com'),

    -- R08: COMPLETED
    ('c0000001-0000-0000-0000-000000000008',
     'b0000001-0000-0000-0000-000000000008',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     NOW() - INTERVAL '38 days',
     '+79161234567', 'varentsovsmv@gmail.com',
     '+79031234567', 'podshivailovaann@gmail.com')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RATINGS (завершённые заявки)
-- Триггер trg_palata_refresh_expert_stats_on_rating автоматически обновит
-- avg_customer_rating и completed_orders_count у Анны.
-- ============================================================================

-- R07: ★★★★★ — заказчик оценивает эксперта
INSERT INTO palata_expert_ratings (request_id, expert_id, customer_id, score, comment, created_at)
VALUES (
    'b0000001-0000-0000-0000-000000000007',
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',
    5,
    'Анна провела экспертизу очень профессионально, в срок, с подробным заключением. Суд принял его без вопросов. Горячо рекомендую!',
    NOW() - INTERVAL '10 days'
) ON CONFLICT (request_id, expert_id) DO NOTHING;

-- R07: ★★★★★ — эксперт оценивает заказчика
INSERT INTO palata_customer_ratings (request_id, customer_id, expert_id, score, comment, created_at)
VALUES (
    'b0000001-0000-0000-0000-000000000007',
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    5,
    'Клиент оперативно предоставил все документы, чётко сформулировал задачу. Очень приятно работать с профессиональным заказчиком.',
    NOW() - INTERVAL '9 days'
) ON CONFLICT (request_id, customer_id) DO NOTHING;

-- R08: ★★★★ — заказчик оценивает эксперта
INSERT INTO palata_expert_ratings (request_id, expert_id, customer_id, score, comment, created_at)
VALUES (
    'b0000001-0000-0000-0000-000000000008',
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',
    4,
    'Хорошая работа, заключение обоснованное. Пришлось один раз доработать формулировку по запросу суда, но в целом всё отлично.',
    NOW() - INTERVAL '20 days'
) ON CONFLICT (request_id, expert_id) DO NOTHING;

-- R08: ★★★★★ — эксперт оценивает заказчика
INSERT INTO palata_customer_ratings (request_id, customer_id, expert_id, score, comment, created_at)
VALUES (
    'b0000001-0000-0000-0000-000000000008',
    '55469b80-387d-4ef6-b03c-f56ca48bfab8',
    '13fdcded-0ba9-4baf-bac8-497054fa9082',
    5,
    'Отличный специалист в своём вопросе, знает все нюансы ДТП. Разобрался в деталях лучше страхового оценщика.',
    NOW() - INTERVAL '19 days'
) ON CONFLICT (request_id, customer_id) DO NOTHING;

-- ============================================================================
-- STATUS EVENTS — реалистичный timeline для каждой заявки
-- ============================================================================

INSERT INTO palata_status_events (entity_type, entity_id, old_status, new_status, actor_id, note, created_at)
VALUES
    -- ── R01: NEW ──────────────────────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000001',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком через форму на сайте',
     NOW() - INTERVAL '3 days'),

    -- ── R02: NEW → MATCHING ───────────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000002',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '7 days'),
    ('request', 'b0000001-0000-0000-0000-000000000002',
     'new', 'matching',
     NULL,
     'Запущен автоматический подбор экспертов',
     NOW() - INTERVAL '5 days'),

    -- ── R03: NEW → MATCHING → EXPERT_SELECTION ────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000003',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '12 days'),
    ('request', 'b0000001-0000-0000-0000-000000000003',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '10 days'),
    ('request', 'b0000001-0000-0000-0000-000000000003',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана для рассмотрения заявки',
     NOW() - INTERVAL '8 days'),

    -- ── R04: → CONTACTS_OPENED ───────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000004',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '20 days'),
    ('request', 'b0000001-0000-0000-0000-000000000004',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '18 days'),
    ('request', 'b0000001-0000-0000-0000-000000000004',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана',
     NOW() - INTERVAL '15 days'),
    ('match', 'b0000001-0000-0000-0000-000000000004',
     'proposed', 'contacts_opened',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт открыла контакты — связь с заказчиком установлена',
     NOW() - INTERVAL '12 days'),

    -- ── R05: → CAN_START_FROM ────────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000005',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '25 days'),
    ('request', 'b0000001-0000-0000-0000-000000000005',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '22 days'),
    ('request', 'b0000001-0000-0000-0000-000000000005',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана',
     NOW() - INTERVAL '20 days'),
    ('match', 'b0000001-0000-0000-0000-000000000005',
     'contacts_opened', 'can_start_from',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт указала дату начала работ: 10 июня 2026',
     NOW() - INTERVAL '10 days'),

    -- ── R06: → IN_WORK ───────────────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000006',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '35 days'),
    ('request', 'b0000001-0000-0000-0000-000000000006',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '33 days'),
    ('request', 'b0000001-0000-0000-0000-000000000006',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана',
     NOW() - INTERVAL '30 days'),
    ('match', 'b0000001-0000-0000-0000-000000000006',
     'can_start_from', 'accepted_work',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт взяла заявку в работу',
     NOW() - INTERVAL '20 days'),
    ('request', 'b0000001-0000-0000-0000-000000000006',
     'expert_selection', 'in_work',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Заявка в работе у эксперта Подшивайловой А.',
     NOW() - INTERVAL '20 days'),

    -- ── R07: → COMPLETED ★★★★★ ───────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000007',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '60 days'),
    ('request', 'b0000001-0000-0000-0000-000000000007',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '58 days'),
    ('request', 'b0000001-0000-0000-0000-000000000007',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана',
     NOW() - INTERVAL '55 days'),
    ('match', 'b0000001-0000-0000-0000-000000000007',
     'proposed', 'accepted_work',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт взяла заявку в работу',
     NOW() - INTERVAL '45 days'),
    ('request', 'b0000001-0000-0000-0000-000000000007',
     'expert_selection', 'in_work',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Заявка в работе',
     NOW() - INTERVAL '45 days'),
    ('request', 'b0000001-0000-0000-0000-000000000007',
     'in_work', 'completed',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Экспертиза завершена, заключение передано в суд',
     NOW() - INTERVAL '10 days'),

    -- ── R08: → COMPLETED ★★★★ ────────────────────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000008',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '45 days'),
    ('request', 'b0000001-0000-0000-0000-000000000008',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '43 days'),
    ('request', 'b0000001-0000-0000-0000-000000000008',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана',
     NOW() - INTERVAL '40 days'),
    ('match', 'b0000001-0000-0000-0000-000000000008',
     'proposed', 'accepted_work',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт взяла заявку в работу',
     NOW() - INTERVAL '35 days'),
    ('request', 'b0000001-0000-0000-0000-000000000008',
     'expert_selection', 'in_work',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Заявка в работе',
     NOW() - INTERVAL '35 days'),
    ('request', 'b0000001-0000-0000-0000-000000000008',
     'in_work', 'completed',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Экспертиза завершена, заключение направлено в страховую',
     NOW() - INTERVAL '20 days'),

    -- ── R09: DECLINED → возврат в matching ───────────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000009',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '15 days'),
    ('request', 'b0000001-0000-0000-0000-000000000009',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов',
     NOW() - INTERVAL '13 days'),
    ('request', 'b0000001-0000-0000-0000-000000000009',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана',
     NOW() - INTERVAL '12 days'),
    ('match', 'b0000001-0000-0000-0000-000000000009',
     'proposed', 'declined',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт отказала: занята в текущем периоде',
     NOW() - INTERVAL '8 days'),
    ('request', 'b0000001-0000-0000-0000-000000000009',
     'expert_selection', 'matching',
     NULL,
     'Эксперт отказалась — поиск продолжается',
     NOW() - INTERVAL '8 days'),

    -- ── R10: раунд 1 провален → REPEAT_MATCHING ──────────────────────────────
    ('request', 'b0000001-0000-0000-0000-000000000010',
     NULL, 'new',
     '55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'Заявка подана заказчиком',
     NOW() - INTERVAL '18 days'),
    ('request', 'b0000001-0000-0000-0000-000000000010',
     'new', 'matching',
     NULL,
     'Запущен подбор экспертов (раунд 1)',
     NOW() - INTERVAL '16 days'),
    ('request', 'b0000001-0000-0000-0000-000000000010',
     'matching', 'expert_selection',
     NULL,
     'Эксперт Подшивайлова А. выбрана (раунд 1)',
     NOW() - INTERVAL '15 days'),
    ('match', 'b0000001-0000-0000-0000-000000000010',
     'proposed', 'declined',
     '13fdcded-0ba9-4baf-bac8-497054fa9082',
     'Эксперт отказала: не работает в данном регионе',
     NOW() - INTERVAL '10 days'),
    ('request', 'b0000001-0000-0000-0000-000000000010',
     'matching', 'matching',
     NULL,
     'Все эксперты раунда 1 отказали — запущен новый подбор (раунд 2)',
     NOW() - INTERVAL '3 days');

-- ============================================================================
-- EMAIL EVENTS — тестовые уведомления
-- ============================================================================

INSERT INTO palata_email_events (
    recipient_id, email_address, template_name, subject, context,
    sent_at, delivered_at
)
VALUES
    -- R01: подтверждение новой заявки
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'request_created',
     'Ваша заявка #R01 принята',
     '{"request_id": "b0000001-0000-0000-0000-000000000001", "title": "Строительно-техническая экспертиза жилого дома"}'::jsonb,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

    -- R02: новое предложение для Анны
    ('13fdcded-0ba9-4baf-bac8-497054fa9082',
     'podshivailovaann@gmail.com',
     'expert_proposed',
     'Новая заявка на рассмотрение — Землеустроительная экспертиза',
     '{"request_id": "b0000001-0000-0000-0000-000000000002", "title": "Землеустроительная экспертиза границ участка", "region": "Санкт-Петербург"}'::jsonb,
     NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),

    -- R03: Анне предложена срочная заявка
    ('13fdcded-0ba9-4baf-bac8-497054fa9082',
     'podshivailovaann@gmail.com',
     'expert_proposed',
     'Срочная заявка на рассмотрение — Автотехническая экспертиза',
     '{"request_id": "b0000001-0000-0000-0000-000000000003", "title": "Автотехническая экспертиза после ДТП на трассе М4", "urgency": "urgent"}'::jsonb,
     NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),

    -- R04: контакты открыты — уведомление Марине
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'contacts_revealed',
     'Эксперт Подшивайлова А. открыла контакты',
     '{"request_id": "b0000001-0000-0000-0000-000000000004", "expert_name": "Анна Подшивайлова", "expert_phone": "+79031234567"}'::jsonb,
     NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),

    -- R05: Анна указала дату начала
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'can_start_from',
     'Эксперт готова начать 10 июня',
     '{"request_id": "b0000001-0000-0000-0000-000000000005", "expert_name": "Анна Подшивайлова", "can_start_from_date": "2026-06-10"}'::jsonb,
     NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),

    -- R06: заявка взята в работу
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'work_started',
     'Эксперт начала работу по заявке #R06',
     '{"request_id": "b0000001-0000-0000-0000-000000000006", "expert_name": "Анна Подшивайлова"}'::jsonb,
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),

    -- R07: экспертиза завершена
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'request_completed',
     'Экспертиза завершена — Строительно-техническая, Ростов',
     '{"request_id": "b0000001-0000-0000-0000-000000000007", "title": "Строительно-техническая экспертиза после залива"}'::jsonb,
     NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),

    -- R07: просьба оставить отзыв
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'rating_request',
     'Оцените работу эксперта',
     '{"request_id": "b0000001-0000-0000-0000-000000000007", "expert_name": "Анна Подшивайлова"}'::jsonb,
     NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),

    -- R08: экспертиза завершена
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'request_completed',
     'Экспертиза завершена — Автотехническая, Москва',
     '{"request_id": "b0000001-0000-0000-0000-000000000008", "title": "Автотехническая экспертиза по ОСАГО"}'::jsonb,
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),

    -- R09: эксперт отказала — продолжаем поиск
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'expert_declined',
     'Эксперт не смогла принять заявку — продолжаем поиск',
     '{"request_id": "b0000001-0000-0000-0000-000000000009", "reason": "busy"}'::jsonb,
     NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),

    -- R10: повторный подбор
    ('55469b80-387d-4ef6-b03c-f56ca48bfab8',
     'varentsovsmv@gmail.com',
     'repeat_matching',
     'Запущен новый раунд подбора экспертов',
     '{"request_id": "b0000001-0000-0000-0000-000000000010", "round": 2}'::jsonb,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

-- ============================================================================
-- ИТОГОВАЯ ПРОВЕРКА
-- ============================================================================

-- Статистика по заявкам
SELECT
    r.status,
    COUNT(*) AS count,
    STRING_AGG(LEFT(r.title, 35), ' | ') AS titles
FROM palata_requests r
WHERE r.id::text LIKE 'b0000001%'
GROUP BY r.status
ORDER BY r.status;

-- Профиль Анны после триггеров
SELECT
    pu.full_name,
    ep.completed_orders_count,
    ep.avg_customer_rating,
    ep.decline_rate
FROM palata_expert_profiles ep
JOIN palata_users pu ON pu.id = ep.user_id
WHERE ep.user_id = '13fdcded-0ba9-4baf-bac8-497054fa9082';
