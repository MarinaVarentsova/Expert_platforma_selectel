-- =============================================================================
-- ПАЛАТА СУДЕБНЫХ ЭКСПЕРТОВ — Initial Migration
-- Version: 001
-- Description: Base schema for the Palata platform
-- All objects are prefixed with `palata_` to avoid conflicts with other projects
-- =============================================================================

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Roles
CREATE TYPE palata_user_role AS ENUM (
    'customer',   -- заказчик экспертизы
    'expert',     -- судебный эксперт
    'admin'       -- администратор платформы
);

-- Order (request) statuses
CREATE TYPE palata_order_status AS ENUM (
    'draft',        -- черновик, не опубликован
    'pending',      -- ожидает модерации / первичной обработки
    'matching',     -- идёт подбор эксперта
    'in_progress',  -- принят экспертом, идёт работа
    'completed',    -- работа завершена
    'cancelled',    -- отменён заказчиком
    'failed'        -- не удалось подобрать эксперта
);

-- Expert status within a specific order (request_match)
CREATE TYPE palata_match_status AS ENUM (
    'proposed',   -- эксперту предложен заказ
    'accepted',   -- эксперт принял
    'declined',   -- эксперт отказался
    'completed',  -- эксперт завершил работу
    'withdrawn'   -- снят с заказа администратором
);

-- Expert profile moderation status
CREATE TYPE palata_expert_profile_status AS ENUM (
    'draft',      -- заполняется экспертом
    'pending',    -- отправлен на проверку
    'active',     -- прошёл проверку, активен
    'suspended',  -- приостановлен (временно)
    'rejected'    -- отклонён
);

-- Reasons for expert declining an order
CREATE TYPE palata_decline_reason AS ENUM (
    'busy',              -- занят, нет времени
    'not_competent',     -- не моя компетенция
    'location',          -- неподходящий регион/место
    'conflict',          -- конфликт интересов
    'conditions',        -- не устраивают условия
    'other'              -- другое
);

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users (mirror of auth.users + platform-specific fields)
CREATE TABLE palata_users (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          palata_user_role NOT NULL DEFAULT 'customer',
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT,
    phone         TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer profiles
CREATE TABLE palata_customer_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES palata_users(id) ON DELETE CASCADE,
    company_name    TEXT,                   -- для юр. лиц
    inn             TEXT,                   -- ИНН
    contact_name    TEXT,                   -- контактное лицо
    region          TEXT,                   -- регион
    notes           TEXT,                   -- внутренние заметки
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expert profiles
CREATE TABLE palata_expert_profiles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES palata_users(id) ON DELETE CASCADE,
    status                      palata_expert_profile_status NOT NULL DEFAULT 'draft',

    -- Personal & professional
    specializations             TEXT[] NOT NULL DEFAULT '{}',  -- направления экспертиз
    regions                     TEXT[] NOT NULL DEFAULT '{}',  -- регионы работы
    experience_years            INT,
    education                   TEXT,
    certifications              TEXT[],

    -- Contact & availability
    accepts_requests            BOOLEAN NOT NULL DEFAULT TRUE,
    business_trip_ready         BOOLEAN NOT NULL DEFAULT FALSE,  -- готов к командировкам

    -- Verification flags
    palata_registry_verified    BOOLEAN NOT NULL DEFAULT FALSE,  -- в реестре Палаты
    centrsudexpert_verified     BOOLEAN NOT NULL DEFAULT FALSE,  -- в реестре ЦСЭ

    -- Computed stats (updated via triggers or background jobs)
    avg_customer_rating         NUMERIC(3,2),         -- средний рейтинг от заказчиков (0.00–5.00)
    completed_orders_count      INT NOT NULL DEFAULT 0,
    decline_rate                NUMERIC(5,4),         -- доля отказов (0.0000–1.0000)

    -- Bio
    bio                         TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- REQUESTS (ORDERS)
-- =============================================================================

CREATE TABLE palata_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES palata_users(id),
    status              palata_order_status NOT NULL DEFAULT 'draft',

    -- Subject of expertise
    title               TEXT NOT NULL,
    description         TEXT,
    expertise_type      TEXT NOT NULL,      -- вид экспертизы
    region              TEXT NOT NULL,      -- место проведения

    -- Matching state
    matching_round      INT NOT NULL DEFAULT 1,   -- номер текущего раунда подбора

    -- Scheduling
    deadline            TIMESTAMPTZ,
    preferred_start     TIMESTAMPTZ,

    -- Budget
    budget_min          NUMERIC(12,2),
    budget_max          NUMERIC(12,2),

    -- After assignment
    assigned_expert_id  UUID REFERENCES palata_users(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Files attached to a request
CREATE TABLE palata_request_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    uploader_id     UUID NOT NULL REFERENCES palata_users(id),
    bucket_path     TEXT NOT NULL,          -- путь в storage bucket
    file_name       TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- MATCHING
-- =============================================================================

-- One row per (request, expert, round) — tracks the full history
CREATE TABLE palata_request_matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    expert_id       UUID NOT NULL REFERENCES palata_users(id),
    matching_round  INT NOT NULL DEFAULT 1,
    status          palata_match_status NOT NULL DEFAULT 'proposed',
    decline_reason  palata_decline_reason,
    decline_note    TEXT,                   -- свободный комментарий при отказе
    proposed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- An expert can only appear once per request per round
    UNIQUE (request_id, expert_id, matching_round)
);

-- Contact details revealed after expert accepts
CREATE TABLE palata_request_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    expert_id       UUID NOT NULL REFERENCES palata_users(id),
    revealed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Snapshot of contact info at time of reveal
    customer_phone  TEXT,
    customer_email  TEXT,
    expert_phone    TEXT,
    expert_email    TEXT
);

-- =============================================================================
-- EXPERT DOCUMENTS
-- =============================================================================

CREATE TABLE palata_expert_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id       UUID NOT NULL REFERENCES palata_users(id) ON DELETE CASCADE,
    doc_type        TEXT NOT NULL,          -- 'diploma', 'certificate', 'license', etc.
    bucket_path     TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      BIGINT,
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by     UUID REFERENCES palata_users(id),
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- AUDIT / EVENT LOGS
-- =============================================================================

-- Status transitions for requests and matches
CREATE TABLE palata_status_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,          -- 'request' | 'match' | 'expert_profile'
    entity_id       UUID NOT NULL,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    actor_id        UUID REFERENCES palata_users(id),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outbound email tracking
CREATE TABLE palata_email_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id    UUID REFERENCES palata_users(id),
    email_address   TEXT NOT NULL,
    template_name   TEXT NOT NULL,
    subject         TEXT,
    context         JSONB,                  -- шаблонные переменные
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    error           TEXT
);

-- =============================================================================
-- RATINGS
-- =============================================================================

-- Customer rates expert after order completion
CREATE TABLE palata_expert_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id),
    expert_id       UUID NOT NULL REFERENCES palata_users(id),
    customer_id     UUID NOT NULL REFERENCES palata_users(id),
    score           SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, expert_id)
);

-- Expert rates customer after order completion
CREATE TABLE palata_customer_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id),
    customer_id     UUID NOT NULL REFERENCES palata_users(id),
    expert_id       UUID NOT NULL REFERENCES palata_users(id),
    score           SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, customer_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- palata_requests
CREATE INDEX idx_palata_requests_status           ON palata_requests(status);
CREATE INDEX idx_palata_requests_region            ON palata_requests(region);
CREATE INDEX idx_palata_requests_expertise_type    ON palata_requests(expertise_type);
CREATE INDEX idx_palata_requests_customer          ON palata_requests(customer_id);
CREATE INDEX idx_palata_requests_assigned_expert   ON palata_requests(assigned_expert_id);
CREATE INDEX idx_palata_requests_matching_round    ON palata_requests(matching_round);

-- palata_expert_profiles
CREATE INDEX idx_palata_experts_status             ON palata_expert_profiles(status);
CREATE INDEX idx_palata_experts_accepts_requests   ON palata_expert_profiles(accepts_requests);
CREATE INDEX idx_palata_experts_avg_rating         ON palata_expert_profiles(avg_customer_rating DESC NULLS LAST);
CREATE INDEX idx_palata_experts_specializations    ON palata_expert_profiles USING GIN(specializations);
CREATE INDEX idx_palata_experts_regions            ON palata_expert_profiles USING GIN(regions);
CREATE INDEX idx_palata_experts_business_trip      ON palata_expert_profiles(business_trip_ready);

-- palata_request_matches
CREATE INDEX idx_palata_matches_request            ON palata_request_matches(request_id);
CREATE INDEX idx_palata_matches_expert             ON palata_request_matches(expert_id);
CREATE INDEX idx_palata_matches_status             ON palata_request_matches(status);
CREATE INDEX idx_palata_matches_round              ON palata_request_matches(request_id, matching_round);

-- palata_status_events
CREATE INDEX idx_palata_status_events_entity       ON palata_status_events(entity_type, entity_id);
CREATE INDEX idx_palata_status_events_created      ON palata_status_events(created_at DESC);

-- palata_email_events
CREATE INDEX idx_palata_email_events_recipient     ON palata_email_events(recipient_id);
CREATE INDEX idx_palata_email_events_sent          ON palata_email_events(sent_at DESC);

-- =============================================================================
-- TRIGGERS: updated_at auto-maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION palata_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_palata_users_updated_at
    BEFORE UPDATE ON palata_users
    FOR EACH ROW EXECUTE FUNCTION palata_set_updated_at();

CREATE TRIGGER trg_palata_customer_profiles_updated_at
    BEFORE UPDATE ON palata_customer_profiles
    FOR EACH ROW EXECUTE FUNCTION palata_set_updated_at();

CREATE TRIGGER trg_palata_expert_profiles_updated_at
    BEFORE UPDATE ON palata_expert_profiles
    FOR EACH ROW EXECUTE FUNCTION palata_set_updated_at();

CREATE TRIGGER trg_palata_requests_updated_at
    BEFORE UPDATE ON palata_requests
    FOR EACH ROW EXECUTE FUNCTION palata_set_updated_at();

CREATE TRIGGER trg_palata_request_matches_updated_at
    BEFORE UPDATE ON palata_request_matches
    FOR EACH ROW EXECUTE FUNCTION palata_set_updated_at();

CREATE TRIGGER trg_palata_expert_documents_updated_at
    BEFORE UPDATE ON palata_expert_documents
    FOR EACH ROW EXECUTE FUNCTION palata_set_updated_at();

-- =============================================================================
-- TRIGGER: auto-update expert stats after rating insert
-- =============================================================================

CREATE OR REPLACE FUNCTION palata_refresh_expert_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE palata_expert_profiles ep
    SET
        avg_customer_rating = (
            SELECT ROUND(AVG(score)::NUMERIC, 2)
            FROM palata_expert_ratings
            WHERE expert_id = NEW.expert_id
        ),
        completed_orders_count = (
            SELECT COUNT(*)
            FROM palata_request_matches
            WHERE expert_id = NEW.expert_id
              AND status = 'completed'
        ),
        decline_rate = (
            SELECT
                CASE WHEN COUNT(*) = 0 THEN 0
                     ELSE ROUND(
                         COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC / COUNT(*)::NUMERIC,
                         4
                     )
                END
            FROM palata_request_matches
            WHERE expert_id = NEW.expert_id
        ),
        updated_at = NOW()
    WHERE ep.user_id = NEW.expert_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_palata_refresh_expert_stats_on_rating
    AFTER INSERT OR UPDATE ON palata_expert_ratings
    FOR EACH ROW EXECUTE FUNCTION palata_refresh_expert_stats();

-- Also refresh stats when a match changes status (e.g. completed / declined)
CREATE OR REPLACE FUNCTION palata_refresh_expert_stats_on_match()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE palata_expert_profiles ep
    SET
        completed_orders_count = (
            SELECT COUNT(*)
            FROM palata_request_matches
            WHERE expert_id = NEW.expert_id
              AND status = 'completed'
        ),
        decline_rate = (
            SELECT
                CASE WHEN COUNT(*) = 0 THEN 0
                     ELSE ROUND(
                         COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC / COUNT(*)::NUMERIC,
                         4
                     )
                END
            FROM palata_request_matches
            WHERE expert_id = NEW.expert_id
        ),
        updated_at = NOW()
    WHERE ep.user_id = NEW.expert_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_palata_refresh_expert_stats_on_match
    AFTER INSERT OR UPDATE OF status ON palata_request_matches
    FOR EACH ROW EXECUTE FUNCTION palata_refresh_expert_stats_on_match();

-- =============================================================================
-- STORAGE BUCKETS
-- (Run these via Supabase dashboard or supabase CLI if storage API is not
--  available in plain SQL context. Included here for documentation completeness.)
-- =============================================================================

-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES
--     ('palata-request-files',    'palata-request-files',    FALSE, 52428800,  -- 50 MB
--      ARRAY['image/jpeg','image/png','image/webp','application/pdf','application/msword',
--            'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
--     ('palata-expert-documents', 'palata-expert-documents', FALSE, 10485760,  -- 10 MB
--      ARRAY['image/jpeg','image/png','image/webp','application/pdf']);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- ─── Seed users ──────────────────────────────────────────────────────────────
-- NOTE: In production these UUIDs come from auth.users.
-- Here we insert directly into palata_users to allow standalone testing.
-- When wiring up Supabase Auth, replace these UUIDs with actual auth.users IDs.

-- 10 experts
INSERT INTO palata_users (id, role, email, full_name, phone) VALUES
    ('00000001-0000-0000-0000-000000000001', 'expert', 'expert01@palata.dev', 'Иванов Алексей Петрович',     '+79001110001'),
    ('00000001-0000-0000-0000-000000000002', 'expert', 'expert02@palata.dev', 'Смирнова Елена Владимировна', '+79001110002'),
    ('00000001-0000-0000-0000-000000000003', 'expert', 'expert03@palata.dev', 'Козлов Дмитрий Сергеевич',    '+79001110003'),
    ('00000001-0000-0000-0000-000000000004', 'expert', 'expert04@palata.dev', 'Новикова Марина Андреевна',   '+79001110004'),
    ('00000001-0000-0000-0000-000000000005', 'expert', 'expert05@palata.dev', 'Соколов Игорь Николаевич',    '+79001110005'),
    ('00000001-0000-0000-0000-000000000006', 'expert', 'expert06@palata.dev', 'Морозова Ольга Сергеевна',    '+79001110006'),
    ('00000001-0000-0000-0000-000000000007', 'expert', 'expert07@palata.dev', 'Волков Павел Юрьевич',        '+79001110007'),
    ('00000001-0000-0000-0000-000000000008', 'expert', 'expert08@palata.dev', 'Лебедева Наталья Борисовна',  '+79001110008'),
    ('00000001-0000-0000-0000-000000000009', 'expert', 'expert09@palata.dev', 'Захаров Антон Михайлович',    '+79001110009'),
    ('00000001-0000-0000-0000-000000000010', 'expert', 'expert10@palata.dev', 'Кузнецова Вера Игоревна',     '+79001110010');

-- 5 customers
INSERT INTO palata_users (id, role, email, full_name, phone) VALUES
    ('00000002-0000-0000-0000-000000000001', 'customer', 'customer01@palata.dev', 'ООО «Альфа Строй»',      '+74951110001'),
    ('00000002-0000-0000-0000-000000000002', 'customer', 'customer02@palata.dev', 'ИП Сидоров В.А.',        '+74951110002'),
    ('00000002-0000-0000-0000-000000000003', 'customer', 'customer03@palata.dev', 'АО «ТехноЭксперт»',      '+74951110003'),
    ('00000002-0000-0000-0000-000000000004', 'customer', 'customer04@palata.dev', 'Петрова Светлана Ивановна', '+74951110004'),
    ('00000002-0000-0000-0000-000000000005', 'customer', 'customer05@palata.dev', 'ООО «ЮрПомощь»',         '+74951110005');

-- ─── Customer profiles ────────────────────────────────────────────────────────
INSERT INTO palata_customer_profiles (user_id, company_name, inn, contact_name, region) VALUES
    ('00000002-0000-0000-0000-000000000001', 'ООО «Альфа Строй»',       '7701234561', 'Сидорова Анна',     'Москва'),
    ('00000002-0000-0000-0000-000000000002', 'ИП Сидоров В.А.',         '504312345', 'Сидоров Виктор',     'Московская область'),
    ('00000002-0000-0000-0000-000000000003', 'АО «ТехноЭксперт»',       '7709876543', 'Николаев Роман',    'Санкт-Петербург'),
    ('00000002-0000-0000-0000-000000000004', NULL,                       NULL,         'Петрова Светлана',  'Краснодар'),
    ('00000002-0000-0000-0000-000000000005', 'ООО «ЮрПомощь»',          '7712345678', 'Громова Ирина',     'Москва');

-- ─── Expert profiles ──────────────────────────────────────────────────────────
INSERT INTO palata_expert_profiles
    (user_id, status, specializations, regions, experience_years,
     accepts_requests, business_trip_ready, palata_registry_verified, centrsudexpert_verified, bio)
VALUES
    ('00000001-0000-0000-0000-000000000001', 'active',
     ARRAY['строительно-техническая', 'оценочная'],
     ARRAY['Москва', 'Московская область'],
     12, TRUE, TRUE, TRUE, FALSE,
     'Специализируюсь на строительно-технических экспертизах промышленных и жилых объектов.'),

    ('00000001-0000-0000-0000-000000000002', 'active',
     ARRAY['почерковедческая', 'автороведческая'],
     ARRAY['Москва', 'Санкт-Петербург'],
     8, TRUE, FALSE, TRUE, TRUE,
     'Эксперт по почерковедению и криминалистическим экспертизам документов.'),

    ('00000001-0000-0000-0000-000000000003', 'active',
     ARRAY['автотехническая', 'трасологическая'],
     ARRAY['Москва', 'Московская область', 'Тверская область'],
     15, TRUE, TRUE, FALSE, TRUE,
     'Провожу автотехнические экспертизы по ДТП и страховым спорам.'),

    ('00000001-0000-0000-0000-000000000004', 'active',
     ARRAY['бухгалтерская', 'финансово-экономическая'],
     ARRAY['Москва'],
     6, TRUE, FALSE, TRUE, FALSE,
     'Эксперт-бухгалтер, опыт в налоговых и корпоративных спорах.'),

    ('00000001-0000-0000-0000-000000000005', 'active',
     ARRAY['пожарно-техническая', 'электротехническая'],
     ARRAY['Москва', 'Московская область', 'Калужская область'],
     10, TRUE, TRUE, TRUE, TRUE,
     'Специализация — установление причин пожаров и электрических повреждений.'),

    ('00000001-0000-0000-0000-000000000006', 'active',
     ARRAY['психологическая', 'психиатрическая'],
     ARRAY['Санкт-Петербург', 'Ленинградская область'],
     9, TRUE, FALSE, TRUE, FALSE,
     'Судебный психолог, работаю с семейными и уголовными делами.'),

    ('00000001-0000-0000-0000-000000000007', 'active',
     ARRAY['землеустроительная', 'экологическая'],
     ARRAY['Краснодар', 'Краснодарский край'],
     7, TRUE, TRUE, FALSE, FALSE,
     'Геодезия, кадастр, экологические экспертизы земельных участков.'),

    ('00000001-0000-0000-0000-000000000008', 'active',
     ARRAY['товароведческая', 'оценочная'],
     ARRAY['Москва', 'Санкт-Петербург'],
     11, TRUE, FALSE, TRUE, TRUE,
     'Экспертиза качества товаров, ущерб от порчи имущества.'),

    ('00000001-0000-0000-0000-000000000009', 'active',
     ARRAY['компьютерно-техническая', 'лингвистическая'],
     ARRAY['Москва'],
     5, FALSE, FALSE, FALSE, TRUE,
     'Экспертиза цифровых материалов, переписки, сайтов, программного обеспечения.'),

    ('00000001-0000-0000-0000-000000000010', 'pending',
     ARRAY['медицинская', 'фармацевтическая'],
     ARRAY['Москва', 'Московская область'],
     3, FALSE, FALSE, FALSE, FALSE,
     'Врач-эксперт, стаж 3 года. Профиль на проверке.');

-- ─── Requests (5 test orders) ─────────────────────────────────────────────────
INSERT INTO palata_requests
    (id, customer_id, status, title, description, expertise_type, region, matching_round)
VALUES
    ('00000003-0000-0000-0000-000000000001',
     '00000002-0000-0000-0000-000000000001',
     'matching',
     'Строительно-техническая экспертиза нежилого здания',
     'Требуется определить рыночную стоимость и физический износ здания склада 2005 г.п., площадь 1200 кв.м.',
     'строительно-техническая', 'Москва', 1),

    ('00000003-0000-0000-0000-000000000002',
     '00000002-0000-0000-0000-000000000002',
     'in_progress',
     'Автотехническая экспертиза по ДТП',
     'ДТП произошло 15.04.2026 на ул. Ленина. Необходимо установить механизм столкновения и скорость ТС.',
     'автотехническая', 'Московская область', 1),

    ('00000003-0000-0000-0000-000000000003',
     '00000002-0000-0000-0000-000000000003',
     'pending',
     'Почерковедческая экспертиза договора',
     'Оспаривается подпись директора в договоре купли-продажи от 2024 года.',
     'почерковедческая', 'Санкт-Петербург', 1),

    ('00000003-0000-0000-0000-000000000004',
     '00000002-0000-0000-0000-000000000004',
     'completed',
     'Психологическая экспертиза в рамках бракоразводного процесса',
     'Необходимо определить психологическое состояние сторон и оценить влияние на детей.',
     'психологическая', 'Краснодар', 1),

    ('00000003-0000-0000-0000-000000000005',
     '00000002-0000-0000-0000-000000000005',
     'matching',
     'Бухгалтерская экспертиза по налоговому спору',
     'Оспаривается доначисление НДС за период 2022–2023 гг. Объём документов ~500 листов.',
     'бухгалтерская', 'Москва', 2);  -- уже второй раунд (первый не дал результата)

-- ─── Request matches ──────────────────────────────────────────────────────────

-- Request 1: matching — предложены 2 эксперта, оба ещё не ответили
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status) VALUES
    ('00000003-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 1, 'proposed'),
    ('00000003-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000003', 1, 'proposed');

-- Request 2: in_progress — эксперт принял
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status, responded_at) VALUES
    ('00000003-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000003', 1, 'accepted', NOW() - INTERVAL '3 days');

UPDATE palata_requests
SET assigned_expert_id = '00000001-0000-0000-0000-000000000003'
WHERE id = '00000003-0000-0000-0000-000000000002';

-- Request 3: pending — ещё не запущен matching

-- Request 4: completed — эксперт завершил
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status, responded_at) VALUES
    ('00000003-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000006', 1, 'completed', NOW() - INTERVAL '10 days');

UPDATE palata_requests
SET assigned_expert_id = '00000001-0000-0000-0000-000000000006'
WHERE id = '00000003-0000-0000-0000-000000000004';

-- Request 5: matching round 2 — в раунде 1 оба эксперта отказались, теперь предлагаются другие
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status, decline_reason, responded_at) VALUES
    ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000004', 1, 'declined', 'busy',          NOW() - INTERVAL '2 days'),
    ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000008', 1, 'declined', 'not_competent', NOW() - INTERVAL '1 day'),
    -- Раунд 2: новый эксперт (ранее отказавшиеся НЕ предлагаются повторно)
    ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000002', 2, 'proposed', NULL, NULL);

-- ─── Ratings for completed request 4 ─────────────────────────────────────────
INSERT INTO palata_expert_ratings (request_id, expert_id, customer_id, score, comment) VALUES
    ('00000003-0000-0000-0000-000000000004',
     '00000001-0000-0000-0000-000000000006',
     '00000002-0000-0000-0000-000000000004',
     5, 'Отличная работа, всё чётко и в срок.');

INSERT INTO palata_customer_ratings (request_id, customer_id, expert_id, score, comment) VALUES
    ('00000003-0000-0000-0000-000000000004',
     '00000002-0000-0000-0000-000000000004',
     '00000001-0000-0000-0000-000000000006',
     4, 'Заказчик предоставил все материалы вовремя.');

-- ─── Status events log ────────────────────────────────────────────────────────
INSERT INTO palata_status_events (entity_type, entity_id, old_status, new_status) VALUES
    ('request', '00000003-0000-0000-0000-000000000001', 'draft',    'pending'),
    ('request', '00000003-0000-0000-0000-000000000001', 'pending',  'matching'),
    ('request', '00000003-0000-0000-0000-000000000002', 'draft',    'pending'),
    ('request', '00000003-0000-0000-0000-000000000002', 'pending',  'matching'),
    ('request', '00000003-0000-0000-0000-000000000002', 'matching', 'in_progress'),
    ('request', '00000003-0000-0000-0000-000000000004', 'draft',    'pending'),
    ('request', '00000003-0000-0000-0000-000000000004', 'pending',  'matching'),
    ('request', '00000003-0000-0000-0000-000000000004', 'matching', 'in_progress'),
    ('request', '00000003-0000-0000-0000-000000000004', 'in_progress', 'completed'),
    ('request', '00000003-0000-0000-0000-000000000005', 'draft',    'pending'),
    ('request', '00000003-0000-0000-0000-000000000005', 'pending',  'matching');

-- =============================================================================
-- VIEW: helper for matching — эксперты доступные для нового предложения по заказу
-- =============================================================================

-- Returns expert_ids that have NOT yet been proposed for the given request
-- Usage: SELECT * FROM palata_available_experts_for_request('request-uuid', 'expertise-type', 'region');
CREATE OR REPLACE FUNCTION palata_available_experts_for_request(
    p_request_id    UUID,
    p_expertise     TEXT,
    p_region        TEXT
)
RETURNS TABLE (expert_user_id UUID) LANGUAGE sql STABLE AS $$
    SELECT ep.user_id
    FROM palata_expert_profiles ep
    WHERE ep.status = 'active'
      AND ep.accepts_requests = TRUE
      AND p_expertise = ANY(ep.specializations)
      AND p_region = ANY(ep.regions)
      -- exclude anyone already proposed/declined on this request (any round)
      AND ep.user_id NOT IN (
          SELECT expert_id
          FROM palata_request_matches
          WHERE request_id = p_request_id
      )
    ORDER BY ep.avg_customer_rating DESC NULLS LAST,
             ep.completed_orders_count DESC;
$$;

-- =============================================================================
-- END OF MIGRATION 001
-- =============================================================================
