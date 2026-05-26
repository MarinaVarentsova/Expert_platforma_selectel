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
    'customer',
    'expert',
    'admin'
);

-- Order (request) statuses
CREATE TYPE palata_order_status AS ENUM (
    'draft',
    'pending',
    'matching',
    'in_progress',
    'completed',
    'cancelled',
    'failed'
);

-- Expert status within a specific order (request_match)
CREATE TYPE palata_match_status AS ENUM (
    'proposed',
    'accepted',
    'declined',
    'completed',
    'withdrawn'
);

-- Expert profile moderation status
CREATE TYPE palata_expert_profile_status AS ENUM (
    'draft',
    'pending',
    'active',
    'suspended',
    'rejected'
);

-- Reasons for expert declining an order
CREATE TYPE palata_decline_reason AS ENUM (
    'busy',
    'not_competent',
    'location',
    'conflict',
    'conditions',
    'other'
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
    company_name    TEXT,
    inn             TEXT,
    contact_name    TEXT,
    region          TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expert profiles
CREATE TABLE palata_expert_profiles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES palata_users(id) ON DELETE CASCADE,
    status                      palata_expert_profile_status NOT NULL DEFAULT 'draft',

    specializations             TEXT[] NOT NULL DEFAULT '{}',
    regions                     TEXT[] NOT NULL DEFAULT '{}',
    experience_years            INT,
    education                   TEXT,
    certifications              TEXT[],

    accepts_requests            BOOLEAN NOT NULL DEFAULT TRUE,
    business_trip_ready         BOOLEAN NOT NULL DEFAULT FALSE,

    palata_registry_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    centrsudexpert_verified     BOOLEAN NOT NULL DEFAULT FALSE,

    avg_customer_rating         NUMERIC(3,2),
    completed_orders_count      INT NOT NULL DEFAULT 0,
    decline_rate                NUMERIC(5,4),

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

    title               TEXT NOT NULL,
    description         TEXT,
    expertise_type      TEXT NOT NULL,
    region              TEXT NOT NULL,

    matching_round      INT NOT NULL DEFAULT 1,

    deadline            TIMESTAMPTZ,
    preferred_start     TIMESTAMPTZ,

    budget_min          NUMERIC(12,2),
    budget_max          NUMERIC(12,2),

    assigned_expert_id  UUID REFERENCES palata_users(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Files attached to a request
CREATE TABLE palata_request_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    uploader_id     UUID NOT NULL REFERENCES palata_users(id),
    bucket_path     TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- MATCHING
-- =============================================================================

-- One row per (request, expert, round) — full history
CREATE TABLE palata_request_matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    expert_id       UUID NOT NULL REFERENCES palata_users(id),
    matching_round  INT NOT NULL DEFAULT 1,
    status          palata_match_status NOT NULL DEFAULT 'proposed',
    decline_reason  palata_decline_reason,
    decline_note    TEXT,
    proposed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (request_id, expert_id, matching_round)
);

-- Contact details revealed after expert accepts
CREATE TABLE palata_request_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES palata_requests(id) ON DELETE CASCADE,
    expert_id       UUID NOT NULL REFERENCES palata_users(id),
    revealed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

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
    doc_type        TEXT NOT NULL,
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

CREATE TABLE palata_status_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    actor_id        UUID REFERENCES palata_users(id),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE palata_email_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id    UUID REFERENCES palata_users(id),
    email_address   TEXT NOT NULL,
    template_name   TEXT NOT NULL,
    subject         TEXT,
    context         JSONB,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    error           TEXT
);

-- =============================================================================
-- RATINGS
-- =============================================================================

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

CREATE INDEX idx_palata_requests_status           ON palata_requests(status);
CREATE INDEX idx_palata_requests_region            ON palata_requests(region);
CREATE INDEX idx_palata_requests_expertise_type    ON palata_requests(expertise_type);
CREATE INDEX idx_palata_requests_customer          ON palata_requests(customer_id);
CREATE INDEX idx_palata_requests_assigned_expert   ON palata_requests(assigned_expert_id);
CREATE INDEX idx_palata_requests_matching_round    ON palata_requests(matching_round);

CREATE INDEX idx_palata_experts_status             ON palata_expert_profiles(status);
CREATE INDEX idx_palata_experts_accepts_requests   ON palata_expert_profiles(accepts_requests);
CREATE INDEX idx_palata_experts_avg_rating         ON palata_expert_profiles(avg_customer_rating DESC NULLS LAST);
CREATE INDEX idx_palata_experts_specializations    ON palata_expert_profiles USING GIN(specializations);
CREATE INDEX idx_palata_experts_regions            ON palata_expert_profiles USING GIN(regions);
CREATE INDEX idx_palata_experts_business_trip      ON palata_expert_profiles(business_trip_ready);

CREATE INDEX idx_palata_matches_request            ON palata_request_matches(request_id);
CREATE INDEX idx_palata_matches_expert             ON palata_request_matches(expert_id);
CREATE INDEX idx_palata_matches_status             ON palata_request_matches(status);
CREATE INDEX idx_palata_matches_round              ON palata_request_matches(request_id, matching_round);

CREATE INDEX idx_palata_status_events_entity       ON palata_status_events(entity_type, entity_id);
CREATE INDEX idx_palata_status_events_created      ON palata_status_events(created_at DESC);

CREATE INDEX idx_palata_email_events_recipient     ON palata_email_events(recipient_id);
CREATE INDEX idx_palata_email_events_sent          ON palata_email_events(sent_at DESC);

-- =============================================================================
-- TRIGGERS: updated_at
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
                         COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC
                         / COUNT(*)::NUMERIC,
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
                         COUNT(*) FILTER (WHERE status = 'declined')::NUMERIC
                         / COUNT(*)::NUMERIC,
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
-- Run separately in Supabase Dashboard > Storage > New bucket, or via CLI.
-- =============================================================================
--
-- Bucket: palata-request-files   (private, 50 MB limit)
-- Bucket: palata-expert-documents (private, 10 MB limit)
--
-- SQL alternative (requires storage extension enabled):
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES
--   ('palata-request-files', 'palata-request-files', FALSE, 52428800,
--    ARRAY['image/jpeg','image/png','image/webp','application/pdf',
--          'application/msword',
--          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
--   ('palata-expert-documents', 'palata-expert-documents', FALSE, 10485760,
--    ARRAY['image/jpeg','image/png','image/webp','application/pdf']);

-- =============================================================================
-- MATCHING FUNCTION
-- =============================================================================

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
      AND ep.user_id NOT IN (
          SELECT expert_id
          FROM palata_request_matches
          WHERE request_id = p_request_id
      )
    ORDER BY ep.avg_customer_rating DESC NULLS LAST,
             ep.completed_orders_count DESC;
$$;

-- =============================================================================
-- SEED DATA
-- =============================================================================
-- palata_users references auth.users via FK.
-- For standalone seeding we temporarily bypass FK checks.
-- In production: create real users via Supabase Auth first,
-- then replace these UUIDs with actual auth.users IDs.
-- =============================================================================

SET session_replication_role = replica;

-- ─── Users: 10 experts ───────────────────────────────────────────────────────

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

-- ─── Users: 5 customers ──────────────────────────────────────────────────────

INSERT INTO palata_users (id, role, email, full_name, phone) VALUES
    ('00000002-0000-0000-0000-000000000001', 'customer', 'customer01@palata.dev', 'OOO Alfa Stroy',           '+74951110001'),
    ('00000002-0000-0000-0000-000000000002', 'customer', 'customer02@palata.dev', 'IP Sidorov V.A.',          '+74951110002'),
    ('00000002-0000-0000-0000-000000000003', 'customer', 'customer03@palata.dev', 'AO TehnoExpert',           '+74951110003'),
    ('00000002-0000-0000-0000-000000000004', 'customer', 'customer04@palata.dev', 'Petrova Svetlana Ivanovna','+74951110004'),
    ('00000002-0000-0000-0000-000000000005', 'customer', 'customer05@palata.dev', 'OOO YurPomosh',            '+74951110005');

-- ─── Customer profiles ────────────────────────────────────────────────────────

INSERT INTO palata_customer_profiles (user_id, company_name, inn, contact_name, region) VALUES
    ('00000002-0000-0000-0000-000000000001', 'OOO Alfa Stroy',  '7701234561', 'Sidorova Anna',     'Moskva'),
    ('00000002-0000-0000-0000-000000000002', 'IP Sidorov V.A.', '504312345',  'Sidorov Viktor',    'Moskovskaya oblast'),
    ('00000002-0000-0000-0000-000000000003', 'AO TehnoExpert',  '7709876543', 'Nikolaev Roman',    'Sankt-Peterburg'),
    ('00000002-0000-0000-0000-000000000004', NULL,               NULL,         'Petrova Svetlana',  'Krasnodar'),
    ('00000002-0000-0000-0000-000000000005', 'OOO YurPomosh',   '7712345678', 'Gromova Irina',     'Moskva');

-- ─── Expert profiles ──────────────────────────────────────────────────────────

INSERT INTO palata_expert_profiles
    (user_id, status, specializations, regions, experience_years,
     accepts_requests, business_trip_ready, palata_registry_verified, centrsudexpert_verified, bio)
VALUES
    ('00000001-0000-0000-0000-000000000001', 'active',
     ARRAY['stroitelno-tehnicheskaya', 'ocenochnaya'],
     ARRAY['Moskva', 'Moskovskaya oblast'],
     12, TRUE, TRUE, TRUE, FALSE,
     'Specializiruus na stroitelno-tehnicheskih ekspertizah promyshlennyh i zhilyh obektov.'),

    ('00000001-0000-0000-0000-000000000002', 'active',
     ARRAY['pocherkovedcheskaya', 'avtorovedcheskaya'],
     ARRAY['Moskva', 'Sankt-Peterburg'],
     8, TRUE, FALSE, TRUE, TRUE,
     'Ekspert po pocherkovedeniyu i kriminalisticheskim ekspertizam dokumentov.'),

    ('00000001-0000-0000-0000-000000000003', 'active',
     ARRAY['avtotechnicheskaya', 'trasologicheskaya'],
     ARRAY['Moskva', 'Moskovskaya oblast', 'Tverskaya oblast'],
     15, TRUE, TRUE, FALSE, TRUE,
     'Provozhu avtotekhnicheskie ekspertizy po DTP i strahovym sporam.'),

    ('00000001-0000-0000-0000-000000000004', 'active',
     ARRAY['buhgalterskaya', 'finansovo-ekonomicheskaya'],
     ARRAY['Moskva'],
     6, TRUE, FALSE, TRUE, FALSE,
     'Ekspert-buhgalter, opyt v nalogovyh i korporativnyh sporah.'),

    ('00000001-0000-0000-0000-000000000005', 'active',
     ARRAY['pozharno-tehnicheskaya', 'elektrotehnicheskaya'],
     ARRAY['Moskva', 'Moskovskaya oblast', 'Kaluzhskaya oblast'],
     10, TRUE, TRUE, TRUE, TRUE,
     'Specializaciya - ustanovlenie prichin pozharov i elektricheskih povrezhdenij.'),

    ('00000001-0000-0000-0000-000000000006', 'active',
     ARRAY['psihologicheskaya', 'psihiatricheskaya'],
     ARRAY['Sankt-Peterburg', 'Leningradskaya oblast'],
     9, TRUE, FALSE, TRUE, FALSE,
     'Sudebnyj psiholog, rabotayu s semejnymi i ugolovnymi delami.'),

    ('00000001-0000-0000-0000-000000000007', 'active',
     ARRAY['zemleustroitelnaya', 'ekologicheskaya'],
     ARRAY['Krasnodar', 'Krasnodarskij kraj'],
     7, TRUE, TRUE, FALSE, FALSE,
     'Geodeziya, kadastr, ekologicheskie ekspertizy zemelnyh uchastkov.'),

    ('00000001-0000-0000-0000-000000000008', 'active',
     ARRAY['tovarovedcheskaya', 'ocenochnaya'],
     ARRAY['Moskva', 'Sankt-Peterburg'],
     11, TRUE, FALSE, TRUE, TRUE,
     'Ekspertiza kachestva tovarov, ushherb ot porchi imushhestva.'),

    ('00000001-0000-0000-0000-000000000009', 'active',
     ARRAY['kompyuterno-tehnicheskaya', 'lingvisticheskaya'],
     ARRAY['Moskva'],
     5, FALSE, FALSE, FALSE, TRUE,
     'Ekspertiza cifrovyh materialov, perepiski, sajtov, programmnogo obespecheniya.'),

    ('00000001-0000-0000-0000-000000000010', 'pending',
     ARRAY['medicinskaya', 'farmacevticheskaya'],
     ARRAY['Moskva', 'Moskovskaya oblast'],
     3, FALSE, FALSE, FALSE, FALSE,
     'Vrach-ekspert, stazh 3 goda. Profil na proverke.');

-- ─── Requests: 5 test orders ─────────────────────────────────────────────────

INSERT INTO palata_requests
    (id, customer_id, status, title, description, expertise_type, region, matching_round)
VALUES
    ('00000003-0000-0000-0000-000000000001',
     '00000002-0000-0000-0000-000000000001',
     'matching',
     'Stroitelno-tehnicheskaya ekspertiza nezhilogo zdaniya',
     'Trebуetsya opredelit rynochnuyu stoimost i fizicheskij iznos zdaniya sklada 2005 g.p.',
     'stroitelno-tehnicheskaya',
     'Moskva',
     1),

    ('00000003-0000-0000-0000-000000000002',
     '00000002-0000-0000-0000-000000000002',
     'in_progress',
     'Avtotechnicheskaya ekspertiza po DTP',
     'DTP proizoshlo 15.04.2026. Neobhodimo ustanovit mehanizm stolknoveniya i skorost TS.',
     'avtotechnicheskaya',
     'Moskovskaya oblast',
     1),

    ('00000003-0000-0000-0000-000000000003',
     '00000002-0000-0000-0000-000000000003',
     'pending',
     'Pocherkovedcheskaya ekspertiza dogovora',
     'Osparivaetsya podpis direktora v dogovore kupli-prodazhi ot 2024 goda.',
     'pocherkovedcheskaya',
     'Sankt-Peterburg',
     1),

    ('00000003-0000-0000-0000-000000000004',
     '00000002-0000-0000-0000-000000000004',
     'completed',
     'Psihologicheskaya ekspertiza v ramkah brakorazvodnogo processa',
     'Neobhodimo opredelit psihologicheskoe sostoyanie storon i ocenit vliyanie na detej.',
     'psihologicheskaya',
     'Krasnodar',
     1),

    ('00000003-0000-0000-0000-000000000005',
     '00000002-0000-0000-0000-000000000005',
     'matching',
     'Buhgalterskaya ekspertiza po nalogovomu sporu',
     'Osparivayetsya donachislenie NDS za period 2022-2023 gg. Obem dokumentov ~500 listov.',
     'buhgalterskaya',
     'Moskva',
     2);

-- ─── Request matches ──────────────────────────────────────────────────────────

-- Request 1: matching — 2 proposed, no responses yet
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status) VALUES
    ('00000003-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 1, 'proposed'),
    ('00000003-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000003', 1, 'proposed');

-- Request 2: in_progress — expert accepted
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status, responded_at) VALUES
    ('00000003-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000003', 1, 'accepted', NOW() - INTERVAL '3 days');

UPDATE palata_requests
    SET assigned_expert_id = '00000001-0000-0000-0000-000000000003'
    WHERE id = '00000003-0000-0000-0000-000000000002';

-- Request 3: pending — matching not started yet (no match rows)

-- Request 4: completed — expert finished
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status, responded_at) VALUES
    ('00000003-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000006', 1, 'completed', NOW() - INTERVAL '10 days');

UPDATE palata_requests
    SET assigned_expert_id = '00000001-0000-0000-0000-000000000006'
    WHERE id = '00000003-0000-0000-0000-000000000004';

-- Request 5: round 2 — both round-1 experts declined; a new expert is proposed in round 2
INSERT INTO palata_request_matches (request_id, expert_id, matching_round, status, decline_reason, responded_at) VALUES
    ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000004', 1, 'declined', 'busy',          NOW() - INTERVAL '2 days'),
    ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000008', 1, 'declined', 'not_competent', NOW() - INTERVAL '1 day'),
    ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000002', 2, 'proposed', NULL,            NULL);

-- ─── Ratings for completed request 4 ─────────────────────────────────────────

INSERT INTO palata_expert_ratings (request_id, expert_id, customer_id, score, comment) VALUES
    ('00000003-0000-0000-0000-000000000004',
     '00000001-0000-0000-0000-000000000006',
     '00000002-0000-0000-0000-000000000004',
     5, 'Otlichnaya rabota, vsyo chetko i v srok.');

INSERT INTO palata_customer_ratings (request_id, customer_id, expert_id, score, comment) VALUES
    ('00000003-0000-0000-0000-000000000004',
     '00000002-0000-0000-0000-000000000004',
     '00000001-0000-0000-0000-000000000006',
     4, 'Zakazchik predostavil vse materialy vovremya.');

-- ─── Status events ────────────────────────────────────────────────────────────

INSERT INTO palata_status_events (entity_type, entity_id, old_status, new_status) VALUES
    ('request', '00000003-0000-0000-0000-000000000001', 'draft',       'pending'),
    ('request', '00000003-0000-0000-0000-000000000001', 'pending',     'matching'),
    ('request', '00000003-0000-0000-0000-000000000002', 'draft',       'pending'),
    ('request', '00000003-0000-0000-0000-000000000002', 'pending',     'matching'),
    ('request', '00000003-0000-0000-0000-000000000002', 'matching',    'in_progress'),
    ('request', '00000003-0000-0000-0000-000000000004', 'draft',       'pending'),
    ('request', '00000003-0000-0000-0000-000000000004', 'pending',     'matching'),
    ('request', '00000003-0000-0000-0000-000000000004', 'matching',    'in_progress'),
    ('request', '00000003-0000-0000-0000-000000000004', 'in_progress', 'completed'),
    ('request', '00000003-0000-0000-0000-000000000005', 'draft',       'pending'),
    ('request', '00000003-0000-0000-0000-000000000005', 'pending',     'matching');

-- Restore normal FK enforcement
SET session_replication_role = DEFAULT;

-- =============================================================================
-- END OF MIGRATION 001
-- =============================================================================
