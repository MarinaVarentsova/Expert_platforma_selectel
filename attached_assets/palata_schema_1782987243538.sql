--
-- PostgreSQL database dump
--

\restrict q4c5jNrABlXTB6xJSj1jgTXX5TAUtOhhIAZU5WsndlIFBtVOWnxBaNq3WjTNmPv

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: palata_action_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_action_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    expert_id uuid,
    customer_id uuid,
    assigned_to_user_id uuid NOT NULL,
    assigned_role text NOT NULL,
    action_type text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    resolved_at timestamp with time zone,
    payload jsonb,
    CONSTRAINT palata_action_items_assigned_role_check CHECK ((assigned_role = ANY (ARRAY['customer'::text, 'expert'::text, 'admin'::text]))),
    CONSTRAINT palata_action_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'read'::text, 'resolved'::text, 'cancelled'::text])))
);


--
-- Name: palata_certificate_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_certificate_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    file_name text,
    total_rows integer DEFAULT 0 NOT NULL,
    active_count integer DEFAULT 0 NOT NULL,
    expired_count integer DEFAULT 0 NOT NULL,
    parse_error_count integer DEFAULT 0 NOT NULL,
    linked_experts_count integer DEFAULT 0 NOT NULL,
    unlinked_experts_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    error_message text
);


--
-- Name: palata_certificate_specialty_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_certificate_specialty_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    certificate_id uuid NOT NULL,
    specialty_code_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    certificate_number text NOT NULL,
    expert_full_name text NOT NULL,
    specialty_text text NOT NULL,
    certificate_period text NOT NULL,
    specialty_code text,
    specialty_code_id uuid,
    valid_from date,
    valid_to date,
    is_active boolean DEFAULT true NOT NULL,
    source_file_name text,
    source_loaded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_certificates_import; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_certificates_import (
    certificate_number text,
    expert_full_name text,
    specialty_text text,
    certificate_period text,
    codes text,
    directions text,
    valid_from date,
    valid_to date,
    certificate_status text,
    load_status text
);


--
-- Name: palata_customer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_customer_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_name text,
    inn text,
    contact_name text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    region_id uuid
);


--
-- Name: palata_customer_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_customer_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    expert_id uuid NOT NULL,
    score smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT palata_customer_ratings_score_check CHECK (((score >= 1) AND (score <= 5)))
);


--
-- Name: palata_email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid,
    email_address text NOT NULL,
    template_name text NOT NULL,
    subject text,
    context jsonb,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    error text
);


--
-- Name: palata_expert_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expert_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id uuid NOT NULL,
    certificate_number text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    cert_valid_to date,
    cert_expert_name text,
    cert_direction_ids uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: palata_expert_directions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expert_directions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id uuid NOT NULL,
    expertise_direction_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE palata_expert_directions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.palata_expert_directions IS 'Связь эксперт ↔ направление экспертизы. Заменяет palata_expert_profiles.specializations как источник для подбора.';


--
-- Name: palata_expert_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expert_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id uuid NOT NULL,
    doc_type text NOT NULL,
    bucket_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text,
    size_bytes bigint,
    verified boolean DEFAULT false NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_expert_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expert_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.palata_expert_profile_status DEFAULT 'draft'::public.palata_expert_profile_status NOT NULL,
    experience_years integer,
    education text,
    certifications text[],
    accepts_requests boolean DEFAULT true NOT NULL,
    business_trip_ready boolean DEFAULT false NOT NULL,
    palata_registry_verified boolean DEFAULT false NOT NULL,
    centrsudexpert_verified boolean DEFAULT false NOT NULL,
    avg_customer_rating numeric(3,2),
    completed_orders_count integer DEFAULT 0 NOT NULL,
    decline_rate numeric(5,4),
    bio text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    palata_registry_number text,
    centrsudexpert_registry_number text
);


--
-- Name: palata_expert_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expert_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    expert_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    score smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT palata_expert_ratings_score_check CHECK (((score >= 1) AND (score <= 5)))
);


--
-- Name: palata_expert_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expert_regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id uuid NOT NULL,
    region_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_expertise_directions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_expertise_directions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sort_order integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE palata_expertise_directions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.palata_expertise_directions IS 'Единый справочник направлений судебных экспертиз. Источник истины для всего приложения.';


--
-- Name: palata_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sort_order integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_request_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_request_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    expert_id uuid NOT NULL,
    revealed_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_phone text,
    customer_email text,
    expert_phone text,
    expert_email text
);


--
-- Name: palata_request_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_request_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    uploader_id uuid,
    bucket_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_request_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_request_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    expert_id uuid NOT NULL,
    matching_round integer DEFAULT 1 NOT NULL,
    status public.palata_match_status DEFAULT 'proposed'::public.palata_match_status NOT NULL,
    decline_reason public.palata_decline_reason,
    decline_note text,
    proposed_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    can_start_from_date date
);


--
-- Name: palata_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    status public.palata_order_status DEFAULT 'draft'::public.palata_order_status NOT NULL,
    title text NOT NULL,
    description text,
    expertise_type text,
    region text,
    matching_round integer DEFAULT 1 NOT NULL,
    deadline timestamp with time zone,
    preferred_start timestamp with time zone,
    budget_min numeric(12,2),
    budget_max numeric(12,2),
    assigned_expert_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    requires_travel boolean DEFAULT false NOT NULL,
    urgency text DEFAULT 'normal'::text NOT NULL,
    materials_available text,
    customer_name text,
    customer_phone text,
    customer_email text,
    expertise_direction_id uuid,
    region_id uuid
);


--
-- Name: COLUMN palata_requests.expertise_direction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.palata_requests.expertise_direction_id IS 'FK на palata_expertise_directions. Новый источник истины для направления заказа. expertise_type сохранён для обратной совместимости.';


--
-- Name: palata_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: palata_specialty_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_specialty_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text,
    expertise_direction_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_status_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    old_status text,
    new_status text NOT NULL,
    actor_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.palata_users (
    id uuid NOT NULL,
    role public.palata_user_role DEFAULT 'customer'::public.palata_user_role NOT NULL,
    email text NOT NULL,
    full_name text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: palata_action_items palata_action_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_action_items
    ADD CONSTRAINT palata_action_items_pkey PRIMARY KEY (id);


--
-- Name: palata_certificate_import_logs palata_certificate_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificate_import_logs
    ADD CONSTRAINT palata_certificate_import_logs_pkey PRIMARY KEY (id);


--
-- Name: palata_certificate_specialty_codes palata_certificate_specialty__certificate_id_specialty_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificate_specialty_codes
    ADD CONSTRAINT palata_certificate_specialty__certificate_id_specialty_code_key UNIQUE (certificate_id, specialty_code_id);


--
-- Name: palata_certificate_specialty_codes palata_certificate_specialty_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificate_specialty_codes
    ADD CONSTRAINT palata_certificate_specialty_codes_pkey PRIMARY KEY (id);


--
-- Name: palata_certificates palata_certificates_certificate_number_specialty_text_certi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificates
    ADD CONSTRAINT palata_certificates_certificate_number_specialty_text_certi_key UNIQUE (certificate_number, specialty_text, certificate_period);


--
-- Name: palata_certificates palata_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificates
    ADD CONSTRAINT palata_certificates_pkey PRIMARY KEY (id);


--
-- Name: palata_customer_profiles palata_customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_profiles
    ADD CONSTRAINT palata_customer_profiles_pkey PRIMARY KEY (id);


--
-- Name: palata_customer_profiles palata_customer_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_profiles
    ADD CONSTRAINT palata_customer_profiles_user_id_key UNIQUE (user_id);


--
-- Name: palata_customer_ratings palata_customer_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_ratings
    ADD CONSTRAINT palata_customer_ratings_pkey PRIMARY KEY (id);


--
-- Name: palata_customer_ratings palata_customer_ratings_request_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_ratings
    ADD CONSTRAINT palata_customer_ratings_request_id_customer_id_key UNIQUE (request_id, customer_id);


--
-- Name: palata_email_events palata_email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_email_events
    ADD CONSTRAINT palata_email_events_pkey PRIMARY KEY (id);


--
-- Name: palata_expert_certificates palata_expert_certificates_expert_id_certificate_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_certificates
    ADD CONSTRAINT palata_expert_certificates_expert_id_certificate_number_key UNIQUE (expert_id, certificate_number);


--
-- Name: palata_expert_certificates palata_expert_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_certificates
    ADD CONSTRAINT palata_expert_certificates_pkey PRIMARY KEY (id);


--
-- Name: palata_expert_directions palata_expert_directions_expert_id_expertise_direction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_directions
    ADD CONSTRAINT palata_expert_directions_expert_id_expertise_direction_id_key UNIQUE (expert_id, expertise_direction_id);


--
-- Name: palata_expert_directions palata_expert_directions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_directions
    ADD CONSTRAINT palata_expert_directions_pkey PRIMARY KEY (id);


--
-- Name: palata_expert_documents palata_expert_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_documents
    ADD CONSTRAINT palata_expert_documents_pkey PRIMARY KEY (id);


--
-- Name: palata_expert_profiles palata_expert_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_profiles
    ADD CONSTRAINT palata_expert_profiles_pkey PRIMARY KEY (id);


--
-- Name: palata_expert_profiles palata_expert_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_profiles
    ADD CONSTRAINT palata_expert_profiles_user_id_key UNIQUE (user_id);


--
-- Name: palata_expert_ratings palata_expert_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_ratings
    ADD CONSTRAINT palata_expert_ratings_pkey PRIMARY KEY (id);


--
-- Name: palata_expert_ratings palata_expert_ratings_request_id_expert_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_ratings
    ADD CONSTRAINT palata_expert_ratings_request_id_expert_id_key UNIQUE (request_id, expert_id);


--
-- Name: palata_expert_regions palata_expert_regions_expert_id_region_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_regions
    ADD CONSTRAINT palata_expert_regions_expert_id_region_id_key UNIQUE (expert_id, region_id);


--
-- Name: palata_expert_regions palata_expert_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_regions
    ADD CONSTRAINT palata_expert_regions_pkey PRIMARY KEY (id);


--
-- Name: palata_expertise_directions palata_expertise_directions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expertise_directions
    ADD CONSTRAINT palata_expertise_directions_name_key UNIQUE (name);


--
-- Name: palata_expertise_directions palata_expertise_directions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expertise_directions
    ADD CONSTRAINT palata_expertise_directions_pkey PRIMARY KEY (id);


--
-- Name: palata_expertise_directions palata_expertise_directions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expertise_directions
    ADD CONSTRAINT palata_expertise_directions_slug_key UNIQUE (slug);


--
-- Name: palata_regions palata_regions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_regions
    ADD CONSTRAINT palata_regions_name_key UNIQUE (name);


--
-- Name: palata_regions palata_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_regions
    ADD CONSTRAINT palata_regions_pkey PRIMARY KEY (id);


--
-- Name: palata_regions palata_regions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_regions
    ADD CONSTRAINT palata_regions_slug_key UNIQUE (slug);


--
-- Name: palata_request_contacts palata_request_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_contacts
    ADD CONSTRAINT palata_request_contacts_pkey PRIMARY KEY (id);


--
-- Name: palata_request_files palata_request_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_files
    ADD CONSTRAINT palata_request_files_pkey PRIMARY KEY (id);


--
-- Name: palata_request_matches palata_request_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_matches
    ADD CONSTRAINT palata_request_matches_pkey PRIMARY KEY (id);


--
-- Name: palata_request_matches palata_request_matches_request_id_expert_id_matching_round_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_matches
    ADD CONSTRAINT palata_request_matches_request_id_expert_id_matching_round_key UNIQUE (request_id, expert_id, matching_round);


--
-- Name: palata_requests palata_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_requests
    ADD CONSTRAINT palata_requests_pkey PRIMARY KEY (id);


--
-- Name: palata_settings palata_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_settings
    ADD CONSTRAINT palata_settings_pkey PRIMARY KEY (key);


--
-- Name: palata_specialty_codes palata_specialty_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_specialty_codes
    ADD CONSTRAINT palata_specialty_codes_code_key UNIQUE (code);


--
-- Name: palata_specialty_codes palata_specialty_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_specialty_codes
    ADD CONSTRAINT palata_specialty_codes_pkey PRIMARY KEY (id);


--
-- Name: palata_status_events palata_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_status_events
    ADD CONSTRAINT palata_status_events_pkey PRIMARY KEY (id);


--
-- Name: palata_users palata_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_users
    ADD CONSTRAINT palata_users_email_key UNIQUE (email);


--
-- Name: palata_users palata_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_users
    ADD CONSTRAINT palata_users_email_unique UNIQUE (email);


--
-- Name: palata_users palata_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_users
    ADD CONSTRAINT palata_users_pkey PRIMARY KEY (id);


--
-- Name: idx_pai_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pai_read ON public.palata_action_items USING btree (is_read);


--
-- Name: idx_pai_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pai_request ON public.palata_action_items USING btree (request_id);


--
-- Name: idx_pai_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pai_resolved ON public.palata_action_items USING btree (is_resolved);


--
-- Name: idx_pai_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pai_type ON public.palata_action_items USING btree (action_type);


--
-- Name: idx_pai_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pai_user ON public.palata_action_items USING btree (assigned_to_user_id);


--
-- Name: idx_palata_certificate_codes_certificate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificate_codes_certificate ON public.palata_certificate_specialty_codes USING btree (certificate_id);


--
-- Name: idx_palata_certificate_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificate_codes_code ON public.palata_certificate_specialty_codes USING btree (specialty_code_id);


--
-- Name: idx_palata_certificates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificates_active ON public.palata_certificates USING btree (is_active);


--
-- Name: idx_palata_certificates_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificates_number ON public.palata_certificates USING btree (certificate_number);


--
-- Name: idx_palata_certificates_specialty_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificates_specialty_code ON public.palata_certificates USING btree (specialty_code);


--
-- Name: idx_palata_certificates_specialty_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificates_specialty_code_id ON public.palata_certificates USING btree (specialty_code_id);


--
-- Name: idx_palata_certificates_valid_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_certificates_valid_to ON public.palata_certificates USING btree (valid_to);


--
-- Name: idx_palata_customer_profiles_region_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_customer_profiles_region_id ON public.palata_customer_profiles USING btree (region_id);


--
-- Name: idx_palata_email_events_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_email_events_recipient ON public.palata_email_events USING btree (recipient_id);


--
-- Name: idx_palata_email_events_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_email_events_sent ON public.palata_email_events USING btree (sent_at DESC);


--
-- Name: idx_palata_expert_directions_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_expert_directions_direction ON public.palata_expert_directions USING btree (expertise_direction_id);


--
-- Name: idx_palata_expert_directions_expert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_expert_directions_expert ON public.palata_expert_directions USING btree (expert_id);


--
-- Name: idx_palata_expert_regions_expert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_expert_regions_expert ON public.palata_expert_regions USING btree (expert_id);


--
-- Name: idx_palata_expert_regions_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_expert_regions_region ON public.palata_expert_regions USING btree (region_id);


--
-- Name: idx_palata_experts_accepts_requests; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_experts_accepts_requests ON public.palata_expert_profiles USING btree (accepts_requests);


--
-- Name: idx_palata_experts_avg_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_experts_avg_rating ON public.palata_expert_profiles USING btree (avg_customer_rating DESC NULLS LAST);


--
-- Name: idx_palata_experts_business_trip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_experts_business_trip ON public.palata_expert_profiles USING btree (business_trip_ready);


--
-- Name: idx_palata_experts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_experts_status ON public.palata_expert_profiles USING btree (status);


--
-- Name: idx_palata_matches_expert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_matches_expert ON public.palata_request_matches USING btree (expert_id);


--
-- Name: idx_palata_matches_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_matches_request ON public.palata_request_matches USING btree (request_id);


--
-- Name: idx_palata_matches_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_matches_round ON public.palata_request_matches USING btree (request_id, matching_round);


--
-- Name: idx_palata_matches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_matches_status ON public.palata_request_matches USING btree (status);


--
-- Name: idx_palata_regions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_regions_active ON public.palata_regions USING btree (is_active);


--
-- Name: idx_palata_requests_assigned_expert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_assigned_expert ON public.palata_requests USING btree (assigned_expert_id);


--
-- Name: idx_palata_requests_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_customer ON public.palata_requests USING btree (customer_id);


--
-- Name: idx_palata_requests_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_direction ON public.palata_requests USING btree (expertise_direction_id);


--
-- Name: idx_palata_requests_expertise_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_expertise_type ON public.palata_requests USING btree (expertise_type);


--
-- Name: idx_palata_requests_matching_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_matching_round ON public.palata_requests USING btree (matching_round);


--
-- Name: idx_palata_requests_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_region ON public.palata_requests USING btree (region);


--
-- Name: idx_palata_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_requests_status ON public.palata_requests USING btree (status);


--
-- Name: idx_palata_specialty_codes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_specialty_codes_active ON public.palata_specialty_codes USING btree (is_active);


--
-- Name: idx_palata_specialty_codes_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_specialty_codes_direction ON public.palata_specialty_codes USING btree (expertise_direction_id);


--
-- Name: idx_palata_status_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_status_events_created ON public.palata_status_events USING btree (created_at DESC);


--
-- Name: idx_palata_status_events_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_palata_status_events_entity ON public.palata_status_events USING btree (entity_type, entity_id);


--
-- Name: palata_customer_profiles trg_palata_customer_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_customer_profiles_updated_at BEFORE UPDATE ON public.palata_customer_profiles FOR EACH ROW EXECUTE FUNCTION public.palata_set_updated_at();


--
-- Name: palata_expert_documents trg_palata_expert_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_expert_documents_updated_at BEFORE UPDATE ON public.palata_expert_documents FOR EACH ROW EXECUTE FUNCTION public.palata_set_updated_at();


--
-- Name: palata_expert_profiles trg_palata_expert_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_expert_profiles_updated_at BEFORE UPDATE ON public.palata_expert_profiles FOR EACH ROW EXECUTE FUNCTION public.palata_set_updated_at();


--
-- Name: palata_request_matches trg_palata_refresh_expert_stats_on_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_refresh_expert_stats_on_match AFTER INSERT OR UPDATE OF status ON public.palata_request_matches FOR EACH ROW EXECUTE FUNCTION public.palata_refresh_expert_stats_on_match();


--
-- Name: palata_expert_ratings trg_palata_refresh_expert_stats_on_rating; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_refresh_expert_stats_on_rating AFTER INSERT OR UPDATE ON public.palata_expert_ratings FOR EACH ROW EXECUTE FUNCTION public.palata_refresh_expert_stats();


--
-- Name: palata_request_matches trg_palata_request_matches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_request_matches_updated_at BEFORE UPDATE ON public.palata_request_matches FOR EACH ROW EXECUTE FUNCTION public.palata_set_updated_at();


--
-- Name: palata_requests trg_palata_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_requests_updated_at BEFORE UPDATE ON public.palata_requests FOR EACH ROW EXECUTE FUNCTION public.palata_set_updated_at();


--
-- Name: palata_users trg_palata_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_palata_users_updated_at BEFORE UPDATE ON public.palata_users FOR EACH ROW EXECUTE FUNCTION public.palata_set_updated_at();


--
-- Name: palata_action_items palata_action_items_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_action_items
    ADD CONSTRAINT palata_action_items_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_action_items palata_action_items_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_action_items
    ADD CONSTRAINT palata_action_items_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.palata_users(id) ON DELETE SET NULL;


--
-- Name: palata_action_items palata_action_items_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_action_items
    ADD CONSTRAINT palata_action_items_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id) ON DELETE SET NULL;


--
-- Name: palata_action_items palata_action_items_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_action_items
    ADD CONSTRAINT palata_action_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.palata_requests(id) ON DELETE CASCADE;


--
-- Name: palata_certificate_specialty_codes palata_certificate_specialty_codes_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificate_specialty_codes
    ADD CONSTRAINT palata_certificate_specialty_codes_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.palata_certificates(id) ON DELETE CASCADE;


--
-- Name: palata_certificate_specialty_codes palata_certificate_specialty_codes_specialty_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificate_specialty_codes
    ADD CONSTRAINT palata_certificate_specialty_codes_specialty_code_id_fkey FOREIGN KEY (specialty_code_id) REFERENCES public.palata_specialty_codes(id) ON DELETE CASCADE;


--
-- Name: palata_certificates palata_certificates_specialty_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_certificates
    ADD CONSTRAINT palata_certificates_specialty_code_id_fkey FOREIGN KEY (specialty_code_id) REFERENCES public.palata_specialty_codes(id);


--
-- Name: palata_customer_profiles palata_customer_profiles_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_profiles
    ADD CONSTRAINT palata_customer_profiles_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.palata_regions(id);


--
-- Name: palata_customer_profiles palata_customer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_profiles
    ADD CONSTRAINT palata_customer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_customer_ratings palata_customer_ratings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_ratings
    ADD CONSTRAINT palata_customer_ratings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.palata_users(id);


--
-- Name: palata_customer_ratings palata_customer_ratings_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_ratings
    ADD CONSTRAINT palata_customer_ratings_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id);


--
-- Name: palata_customer_ratings palata_customer_ratings_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_customer_ratings
    ADD CONSTRAINT palata_customer_ratings_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.palata_requests(id);


--
-- Name: palata_email_events palata_email_events_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_email_events
    ADD CONSTRAINT palata_email_events_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.palata_users(id);


--
-- Name: palata_expert_certificates palata_expert_certificates_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_certificates
    ADD CONSTRAINT palata_expert_certificates_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_expert_directions palata_expert_directions_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_directions
    ADD CONSTRAINT palata_expert_directions_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_expert_directions palata_expert_directions_expertise_direction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_directions
    ADD CONSTRAINT palata_expert_directions_expertise_direction_id_fkey FOREIGN KEY (expertise_direction_id) REFERENCES public.palata_expertise_directions(id);


--
-- Name: palata_expert_documents palata_expert_documents_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_documents
    ADD CONSTRAINT palata_expert_documents_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_expert_documents palata_expert_documents_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_documents
    ADD CONSTRAINT palata_expert_documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.palata_users(id);


--
-- Name: palata_expert_profiles palata_expert_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_profiles
    ADD CONSTRAINT palata_expert_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_expert_ratings palata_expert_ratings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_ratings
    ADD CONSTRAINT palata_expert_ratings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.palata_users(id);


--
-- Name: palata_expert_ratings palata_expert_ratings_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_ratings
    ADD CONSTRAINT palata_expert_ratings_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id);


--
-- Name: palata_expert_ratings palata_expert_ratings_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_ratings
    ADD CONSTRAINT palata_expert_ratings_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.palata_requests(id);


--
-- Name: palata_expert_regions palata_expert_regions_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_regions
    ADD CONSTRAINT palata_expert_regions_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id) ON DELETE CASCADE;


--
-- Name: palata_expert_regions palata_expert_regions_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_expert_regions
    ADD CONSTRAINT palata_expert_regions_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.palata_regions(id) ON DELETE CASCADE;


--
-- Name: palata_request_contacts palata_request_contacts_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_contacts
    ADD CONSTRAINT palata_request_contacts_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id);


--
-- Name: palata_request_contacts palata_request_contacts_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_contacts
    ADD CONSTRAINT palata_request_contacts_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.palata_requests(id) ON DELETE CASCADE;


--
-- Name: palata_request_files palata_request_files_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_files
    ADD CONSTRAINT palata_request_files_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.palata_requests(id) ON DELETE CASCADE;


--
-- Name: palata_request_files palata_request_files_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_files
    ADD CONSTRAINT palata_request_files_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.palata_users(id);


--
-- Name: palata_request_matches palata_request_matches_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_matches
    ADD CONSTRAINT palata_request_matches_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.palata_users(id);


--
-- Name: palata_request_matches palata_request_matches_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_request_matches
    ADD CONSTRAINT palata_request_matches_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.palata_requests(id) ON DELETE CASCADE;


--
-- Name: palata_requests palata_requests_assigned_expert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_requests
    ADD CONSTRAINT palata_requests_assigned_expert_id_fkey FOREIGN KEY (assigned_expert_id) REFERENCES public.palata_users(id);


--
-- Name: palata_requests palata_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_requests
    ADD CONSTRAINT palata_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.palata_users(id);


--
-- Name: palata_requests palata_requests_expertise_direction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_requests
    ADD CONSTRAINT palata_requests_expertise_direction_id_fkey FOREIGN KEY (expertise_direction_id) REFERENCES public.palata_expertise_directions(id);


--
-- Name: palata_requests palata_requests_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_requests
    ADD CONSTRAINT palata_requests_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.palata_regions(id);


--
-- Name: palata_specialty_codes palata_specialty_codes_expertise_direction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_specialty_codes
    ADD CONSTRAINT palata_specialty_codes_expertise_direction_id_fkey FOREIGN KEY (expertise_direction_id) REFERENCES public.palata_expertise_directions(id);


--
-- Name: palata_status_events palata_status_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_status_events
    ADD CONSTRAINT palata_status_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.palata_users(id);


--
-- Name: palata_users palata_users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.palata_users
    ADD CONSTRAINT palata_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: palata_expert_regions Anon read expert_regions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon read expert_regions" ON public.palata_expert_regions FOR SELECT TO anon USING (true);


--
-- Name: palata_expertise_directions Anon users can read directions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon users can read directions" ON public.palata_expertise_directions FOR SELECT TO anon USING (true);


--
-- Name: palata_regions Anyone can read palata_regions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read palata_regions" ON public.palata_regions FOR SELECT USING (true);


--
-- Name: palata_expert_certificates Authenticated can read verified certs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read verified certs" ON public.palata_expert_certificates FOR SELECT TO authenticated USING ((status = 'verified'::text));


--
-- Name: palata_expert_regions Authenticated read expert_regions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read expert_regions" ON public.palata_expert_regions FOR SELECT TO authenticated USING (true);


--
-- Name: palata_expertise_directions Authenticated users can read directions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read directions" ON public.palata_expertise_directions FOR SELECT TO authenticated USING (true);


--
-- Name: palata_expert_directions Authenticated users can read expert directions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read expert directions" ON public.palata_expert_directions FOR SELECT TO authenticated USING (true);


--
-- Name: palata_expert_certificates Expert manages own certificates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Expert manages own certificates" ON public.palata_expert_certificates TO authenticated USING ((expert_id = auth.uid())) WITH CHECK ((expert_id = auth.uid()));


--
-- Name: palata_expert_directions Experts manage own directions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Experts manage own directions" ON public.palata_expert_directions TO authenticated USING ((expert_id = auth.uid())) WITH CHECK ((expert_id = auth.uid()));


--
-- Name: palata_certificates Public read palata_certificates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read palata_certificates" ON public.palata_certificates FOR SELECT USING (true);


--
-- Name: palata_specialty_codes Public read palata_specialty_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read palata_specialty_codes" ON public.palata_specialty_codes FOR SELECT USING (true);


--
-- Name: palata_action_items Service inserts action items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service inserts action items" ON public.palata_action_items FOR INSERT WITH CHECK (true);


--
-- Name: palata_action_items Users see own action items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own action items" ON public.palata_action_items FOR SELECT USING ((assigned_to_user_id = auth.uid()));


--
-- Name: palata_action_items Users update own action items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own action items" ON public.palata_action_items FOR UPDATE USING ((assigned_to_user_id = auth.uid()));


--
-- Name: palata_expert_documents auth_delete_own_expert_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_delete_own_expert_documents ON public.palata_expert_documents FOR DELETE TO authenticated USING ((expert_id = auth.uid()));


--
-- Name: palata_customer_profiles auth_insert_own_customer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_insert_own_customer_profile ON public.palata_customer_profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: palata_expert_documents auth_insert_own_expert_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_insert_own_expert_documents ON public.palata_expert_documents FOR INSERT TO authenticated WITH CHECK ((expert_id = auth.uid()));


--
-- Name: palata_expert_profiles auth_insert_own_expert_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_insert_own_expert_profile ON public.palata_expert_profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: palata_customer_profiles auth_update_own_customer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_update_own_customer_profile ON public.palata_customer_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: palata_expert_profiles auth_update_own_expert_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_update_own_expert_profile ON public.palata_expert_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: palata_users authenticated_read_all_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_all_users ON public.palata_users FOR SELECT TO authenticated USING (true);


--
-- Name: palata_users authenticated_update_own_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_own_user ON public.palata_users FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: palata_customer_profiles cp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cp_insert ON public.palata_customer_profiles FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_customer_profiles cp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cp_select ON public.palata_customer_profiles FOR SELECT TO authenticated USING (true);


--
-- Name: palata_customer_profiles cp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cp_update ON public.palata_customer_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: palata_customer_ratings cr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cr_insert ON public.palata_customer_ratings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_customer_ratings cr_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cr_select ON public.palata_customer_ratings FOR SELECT TO authenticated USING (true);


--
-- Name: palata_customer_profiles customer_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_update_own_profile ON public.palata_customer_profiles FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: palata_expert_profiles ep_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_insert ON public.palata_expert_profiles FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_expert_profiles ep_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_select ON public.palata_expert_profiles FOR SELECT TO authenticated USING (true);


--
-- Name: palata_expert_profiles ep_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_update ON public.palata_expert_profiles FOR UPDATE TO authenticated USING (true);


--
-- Name: palata_expert_ratings er_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY er_insert ON public.palata_expert_ratings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_expert_ratings er_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY er_select ON public.palata_expert_ratings FOR SELECT TO authenticated USING (true);


--
-- Name: palata_expert_regions expert_regions_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expert_regions_delete_own ON public.palata_expert_regions FOR DELETE TO authenticated USING ((auth.uid() = expert_id));


--
-- Name: palata_expert_regions expert_regions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expert_regions_insert_own ON public.palata_expert_regions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = expert_id));


--
-- Name: palata_expert_regions expert_regions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expert_regions_select_own ON public.palata_expert_regions FOR SELECT TO authenticated USING ((auth.uid() = expert_id));


--
-- Name: palata_action_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_action_items ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_certificate_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_certificate_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_certificate_specialty_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_certificate_specialty_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_certificates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_certificates ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_certificates_import; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_certificates_import ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_customer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_customer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_customer_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_customer_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expert_certificates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expert_certificates ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expert_directions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expert_directions ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expert_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expert_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expert_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expert_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expert_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expert_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expert_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expert_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_expertise_directions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_expertise_directions ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_request_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_request_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_request_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_request_files ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_request_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_request_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_settings palata_settings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY palata_settings_admin_all ON public.palata_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.palata_users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::public.palata_user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.palata_users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::public.palata_user_role)))));


--
-- Name: palata_specialty_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_specialty_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_status_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_status_events ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.palata_users ENABLE ROW LEVEL SECURITY;

--
-- Name: palata_requests pr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_insert ON public.palata_requests FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_requests pr_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_select ON public.palata_requests FOR SELECT TO authenticated USING (true);


--
-- Name: palata_requests pr_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_update ON public.palata_requests FOR UPDATE TO authenticated USING (true);


--
-- Name: palata_users pu_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pu_select ON public.palata_users FOR SELECT TO authenticated USING (true);


--
-- Name: palata_users pu_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pu_update ON public.palata_users FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: palata_request_contacts rc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc_insert ON public.palata_request_contacts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_request_contacts rc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc_select ON public.palata_request_contacts FOR SELECT TO authenticated USING (true);


--
-- Name: palata_request_files rf_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rf_insert ON public.palata_request_files FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_request_files rf_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rf_select ON public.palata_request_files FOR SELECT TO authenticated USING (true);


--
-- Name: palata_request_matches rm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rm_insert ON public.palata_request_matches FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_request_matches rm_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rm_select ON public.palata_request_matches FOR SELECT TO authenticated USING (true);


--
-- Name: palata_request_matches rm_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rm_update ON public.palata_request_matches FOR UPDATE TO authenticated USING (true);


--
-- Name: palata_status_events se_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY se_insert ON public.palata_status_events FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: palata_status_events se_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY se_select ON public.palata_status_events FOR SELECT TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict q4c5jNrABlXTB6xJSj1jgTXX5TAUtOhhIAZU5WsndlIFBtVOWnxBaNq3WjTNmPv

