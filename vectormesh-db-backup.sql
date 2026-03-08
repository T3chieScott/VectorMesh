--
-- PostgreSQL database dump
--

\restrict j8xyhvHLOeiDwoz9BhXQPwgyTrfIyhfOendrReyQ79dE8RvnWFk5LKPpuxMLDg7

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.user_sites DROP CONSTRAINT IF EXISTS user_sites_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_fallback_layout_id_layout_templates_id_fk;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_display_profile_id_display_profiles_id_fk;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_current_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_client_id_clients_id_fk;
ALTER TABLE IF EXISTS ONLY public.screen_groups DROP CONSTRAINT IF EXISTS screen_groups_client_id_clients_id_fk;
ALTER TABLE IF EXISTS ONLY public.screen_group_memberships DROP CONSTRAINT IF EXISTS screen_group_memberships_screen_id_screens_id_fk;
ALTER TABLE IF EXISTS ONLY public.screen_group_memberships DROP CONSTRAINT IF EXISTS screen_group_memberships_group_id_screen_groups_id_fk;
ALTER TABLE IF EXISTS ONLY public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_programme_version_id_programme_versions_id_fk;
ALTER TABLE IF EXISTS ONLY public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_layout_template_id_layout_templates_id_fk;
ALTER TABLE IF EXISTS ONLY public.programmes DROP CONSTRAINT IF EXISTS programmes_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.programme_versions DROP CONSTRAINT IF EXISTS programme_versions_programme_id_programmes_id_fk;
ALTER TABLE IF EXISTS ONLY public.playlists DROP CONSTRAINT IF EXISTS playlists_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.playlist_items DROP CONSTRAINT IF EXISTS playlist_items_playlist_id_playlists_id_fk;
ALTER TABLE IF EXISTS ONLY public.playlist_items DROP CONSTRAINT IF EXISTS playlist_items_media_asset_id_media_assets_id_fk;
ALTER TABLE IF EXISTS ONLY public.player_heartbeats DROP CONSTRAINT IF EXISTS player_heartbeats_screen_id_screens_id_fk;
ALTER TABLE IF EXISTS ONLY public.password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.media_shares DROP CONSTRAINT IF EXISTS media_shares_media_asset_id_media_assets_id_fk;
ALTER TABLE IF EXISTS ONLY public.media_shares DROP CONSTRAINT IF EXISTS media_shares_client_id_clients_id_fk;
ALTER TABLE IF EXISTS ONLY public.media_assets DROP CONSTRAINT IF EXISTS media_assets_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.media_assets DROP CONSTRAINT IF EXISTS media_assets_client_id_clients_id_fk;
ALTER TABLE IF EXISTS ONLY public.live_overrides DROP CONSTRAINT IF EXISTS live_overrides_layout_template_id_layout_templates_id_fk;
ALTER TABLE IF EXISTS ONLY public.live_overrides DROP CONSTRAINT IF EXISTS live_overrides_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.live_overrides DROP CONSTRAINT IF EXISTS live_overrides_created_by_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.layout_templates DROP CONSTRAINT IF EXISTS layout_templates_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.events DROP CONSTRAINT IF EXISTS events_client_id_clients_id_fk;
ALTER TABLE IF EXISTS ONLY public.display_profiles DROP CONSTRAINT IF EXISTS display_profiles_client_id_clients_id_fk;
ALTER TABLE IF EXISTS ONLY public.brand_packs DROP CONSTRAINT IF EXISTS brand_packs_event_id_events_id_fk;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_users_id_fk;
DROP INDEX IF EXISTS public."IDX_session_expire";
ALTER TABLE IF EXISTS ONLY public.weather_cache DROP CONSTRAINT IF EXISTS weather_cache_pkey;
ALTER TABLE IF EXISTS ONLY public.weather_cache DROP CONSTRAINT IF EXISTS weather_cache_location_unique;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.user_sites DROP CONSTRAINT IF EXISTS user_sites_pkey;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.screens DROP CONSTRAINT IF EXISTS screens_pkey;
ALTER TABLE IF EXISTS ONLY public.screen_groups DROP CONSTRAINT IF EXISTS screen_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.screen_group_memberships DROP CONSTRAINT IF EXISTS screen_group_memberships_pkey;
ALTER TABLE IF EXISTS ONLY public.schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_pkey;
ALTER TABLE IF EXISTS ONLY public.programmes DROP CONSTRAINT IF EXISTS programmes_pkey;
ALTER TABLE IF EXISTS ONLY public.programme_versions DROP CONSTRAINT IF EXISTS programme_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.playlists DROP CONSTRAINT IF EXISTS playlists_pkey;
ALTER TABLE IF EXISTS ONLY public.playlist_items DROP CONSTRAINT IF EXISTS playlist_items_pkey;
ALTER TABLE IF EXISTS ONLY public.player_heartbeats DROP CONSTRAINT IF EXISTS player_heartbeats_pkey;
ALTER TABLE IF EXISTS ONLY public.password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_token_unique;
ALTER TABLE IF EXISTS ONLY public.password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.media_shares DROP CONSTRAINT IF EXISTS media_shares_pkey;
ALTER TABLE IF EXISTS ONLY public.media_assets DROP CONSTRAINT IF EXISTS media_assets_pkey;
ALTER TABLE IF EXISTS ONLY public.live_overrides DROP CONSTRAINT IF EXISTS live_overrides_pkey;
ALTER TABLE IF EXISTS ONLY public.layout_templates DROP CONSTRAINT IF EXISTS layout_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.events DROP CONSTRAINT IF EXISTS events_pkey;
ALTER TABLE IF EXISTS ONLY public.display_profiles DROP CONSTRAINT IF EXISTS display_profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_pkey;
ALTER TABLE IF EXISTS ONLY public.brand_packs DROP CONSTRAINT IF EXISTS brand_packs_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.alert_settings DROP CONSTRAINT IF EXISTS alert_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.alert_history DROP CONSTRAINT IF EXISTS alert_history_pkey;
DROP TABLE IF EXISTS public.weather_cache;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.user_sites;
DROP TABLE IF EXISTS public.system_settings;
DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.screens;
DROP TABLE IF EXISTS public.screen_groups;
DROP TABLE IF EXISTS public.screen_group_memberships;
DROP TABLE IF EXISTS public.schedule_blocks;
DROP TABLE IF EXISTS public.programmes;
DROP TABLE IF EXISTS public.programme_versions;
DROP TABLE IF EXISTS public.playlists;
DROP TABLE IF EXISTS public.playlist_items;
DROP TABLE IF EXISTS public.player_heartbeats;
DROP TABLE IF EXISTS public.password_reset_tokens;
DROP TABLE IF EXISTS public.media_shares;
DROP TABLE IF EXISTS public.media_assets;
DROP TABLE IF EXISTS public.live_overrides;
DROP TABLE IF EXISTS public.layout_templates;
DROP TABLE IF EXISTS public.events;
DROP TABLE IF EXISTS public.display_profiles;
DROP TABLE IF EXISTS public.clients;
DROP TABLE IF EXISTS public.brand_packs;
DROP TABLE IF EXISTS public.audit_logs;
DROP TABLE IF EXISTS public.alert_settings;
DROP TABLE IF EXISTS public.alert_history;
DROP TYPE IF EXISTS public.zone_type;
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.screen_type;
DROP TYPE IF EXISTS public.scale_mode;
DROP TYPE IF EXISTS public.programme_status;
DROP TYPE IF EXISTS public.orientation;
DROP TYPE IF EXISTS public.media_type;
--
-- Name: media_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_type AS ENUM (
    'image',
    'video',
    'gif'
);


--
-- Name: orientation; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.orientation AS ENUM (
    'landscape',
    'portrait'
);


--
-- Name: programme_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.programme_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: scale_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.scale_mode AS ENUM (
    'contain',
    'cover'
);


--
-- Name: screen_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.screen_type AS ENUM (
    'standard',
    'led_wall'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'account_manager',
    'site_user'
);


--
-- Name: zone_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.zone_type AS ENUM (
    'media',
    'ticker',
    'clock',
    'logo',
    'html',
    'weather',
    'news',
    'montage',
    'qrcode',
    'countdown',
    'shape',
    'schedule',
    'media_player'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alert_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_history (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    entity_id character varying,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    payload jsonb,
    sent_at timestamp without time zone DEFAULT now()
);


--
-- Name: alert_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    cooldown_minutes integer DEFAULT 15 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    client_id character varying
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying,
    payload jsonb,
    "timestamp" timestamp without time zone DEFAULT now()
);


--
-- Name: brand_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_packs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying NOT NULL,
    name text NOT NULL,
    version integer DEFAULT 1,
    primary_color text DEFAULT '#3B82F6'::text,
    secondary_color text DEFAULT '#10B981'::text,
    accent_color text DEFAULT '#F59E0B'::text,
    background_color text DEFAULT '#1F2937'::text,
    text_color text DEFAULT '#FFFFFF'::text,
    font_primary text DEFAULT 'Inter'::text,
    font_secondary text DEFAULT 'Inter'::text,
    logo_light_url text,
    logo_dark_url text,
    default_background_url text,
    standby_config jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: display_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.display_profiles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    width integer DEFAULT 1920 NOT NULL,
    height integer DEFAULT 1080 NOT NULL,
    orientation public.orientation DEFAULT 'landscape'::public.orientation,
    safe_padding integer DEFAULT 0,
    screen_type public.screen_type DEFAULT 'standard'::public.screen_type,
    refresh_rate integer DEFAULT 60,
    created_at timestamp without time zone DEFAULT now(),
    client_id character varying
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    client_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    color_palette jsonb
);


--
-- Name: layout_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.layout_templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying,
    name text NOT NULL,
    version integer DEFAULT 1,
    zones jsonb NOT NULL,
    profile_overrides jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    aspect_ratio text DEFAULT '16:9'::text NOT NULL,
    custom_width integer,
    custom_height integer
);


--
-- Name: live_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_overrides (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying,
    name text NOT NULL,
    priority integer DEFAULT 100,
    targets jsonb,
    layout_template_id character varying,
    zone_sources jsonb,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_by_id character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying,
    name text NOT NULL,
    original_path text NOT NULL,
    thumbnail_path text,
    media_type public.media_type NOT NULL,
    mime_type text,
    width integer,
    height integer,
    duration integer,
    file_size integer,
    checksum text,
    tags text[],
    created_at timestamp without time zone DEFAULT now(),
    display_mode public.scale_mode DEFAULT 'cover'::public.scale_mode,
    client_id character varying
);


--
-- Name: media_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_shares (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id character varying NOT NULL,
    client_id character varying NOT NULL,
    shared_at timestamp without time zone DEFAULT now()
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    token character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: player_heartbeats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_heartbeats (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    screen_id character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    temperature integer,
    storage_free integer,
    uptime integer,
    current_block_id character varying,
    current_item_id character varying,
    errors jsonb
);


--
-- Name: playlist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    playlist_id character varying NOT NULL,
    media_asset_id character varying NOT NULL,
    "order" integer DEFAULT 0,
    duration integer
);


--
-- Name: playlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlists (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: programme_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programme_versions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    programme_id character varying NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    status public.programme_status DEFAULT 'draft'::public.programme_status,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: programmes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programmes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: schedule_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_blocks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    programme_version_id character varying NOT NULL,
    name text NOT NULL,
    priority integer DEFAULT 0,
    layout_template_id character varying,
    targets jsonb,
    time_rules jsonb,
    zone_sources jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: screen_group_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screen_group_memberships (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    screen_id character varying NOT NULL,
    group_id character varying NOT NULL
);


--
-- Name: screen_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screen_groups (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    client_id character varying
);


--
-- Name: screens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text,
    display_profile_id character varying,
    pairing_code character varying(6),
    is_paired boolean DEFAULT false,
    is_online boolean DEFAULT false,
    last_seen timestamp without time zone,
    ip_address text,
    hardware_class text,
    current_event_id character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    device_token text,
    fallback_layout_id character varying,
    client_id character varying
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sites (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    client_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    role character varying DEFAULT 'site_user'::character varying NOT NULL,
    password_hash character varying,
    must_change_password boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp without time zone,
    two_factor_secret character varying,
    two_factor_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: weather_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_cache (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    location text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Data for Name: alert_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alert_history (id, alert_type, entity_id, recipients, payload, sent_at) FROM stdin;
\.


--
-- Data for Name: alert_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alert_settings (id, alert_type, enabled, recipients, cooldown_minutes, created_at, updated_at, client_id) FROM stdin;
e9251a4c-ceae-41d1-8722-67817e89f1b0	screen_offline	t	{}	15	2026-03-07 16:49:34.751919	2026-03-07 16:49:47.87	8c32deed-2f51-4fa6-806f-f8dcefc2923a
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, user_id, action, entity_type, entity_id, payload, "timestamp") FROM stdin;
2b6b36d8-a6ff-4d77-b480-1928b40e25ba	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 14:11:43.104045
8c22cde6-6030-4f8c-af9d-8b13e910c4d8	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 14:25:14.963953
6a3322de-7095-44e6-99a7-32a60e098462	43484205	update	alert_setting	screen_offline	{"enabled": true, "recipients": 0, "cooldownMinutes": 15}	2026-03-07 14:25:37.006665
e25e6c3b-6919-4be5-af98-8e61c025141b	43484205	update	alert_setting	screen_offline	{"enabled": true, "recipients": 1, "cooldownMinutes": 15}	2026-03-07 14:25:45.550594
581b6c46-7caa-4b73-9c09-68e677354990	43484205	update	alert_setting	screen_offline	{"enabled": true, "recipients": 0, "cooldownMinutes": 15}	2026-03-07 14:25:51.422304
22a246df-4212-499b-85b2-4e1cde71e341	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 16:17:42.46127
a4bdb2f6-c822-4067-9ae2-6738ab30a93c	43484205	update	alert_setting	screen_offline	{"enabled": true, "recipients": 1, "cooldownMinutes": 15}	2026-03-07 16:17:59.268954
052f835b-6cd6-4ca0-a278-c9a2f0a0907c	43484205	update	alert_setting	screen_offline	{"enabled": true, "recipients": 0, "cooldownMinutes": 15}	2026-03-07 16:18:05.096227
cef1d54e-185c-42c3-bf14-78cb6d7b9e54	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 16:49:22.374948
8b62c932-3db1-4cad-a862-104ae743a615	43484205	update	alert_setting	screen_offline	{"enabled": true, "clientId": "8c32deed-2f51-4fa6-806f-f8dcefc2923a", "recipients": 0, "cooldownMinutes": 15}	2026-03-07 16:49:34.756671
02bb0021-ea7a-4db1-980d-da111fc57f22	43484205	update	alert_setting	screen_offline	{"enabled": true, "clientId": "8c32deed-2f51-4fa6-806f-f8dcefc2923a", "recipients": 1, "cooldownMinutes": 15}	2026-03-07 16:49:42.5543
6a2cceae-96a9-416a-a1cd-59c24b4dbcaa	43484205	update	alert_setting	screen_offline	{"enabled": true, "clientId": "8c32deed-2f51-4fa6-806f-f8dcefc2923a", "recipients": 0, "cooldownMinutes": 15}	2026-03-07 16:49:47.875234
e76e471e-9f6c-482c-988c-bef560367034	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 17:09:10.893691
03bd44c9-eea1-466c-9bc7-bbe581cce982	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 17:43:38.921568
fd434030-7182-40d7-bad6-77140b0a2f0b	43484205	update	client	8c32deed-2f51-4fa6-806f-f8dcefc2923a	{"name": "Farnborough"}	2026-03-07 17:51:07.710038
f55cdb6a-4b6e-43cd-a25a-06d533dfff11	43484205	create	client	6218b5e1-0110-42c4-bb5c-513cbe805877	{"name": "Royal Lancaster Hotel"}	2026-03-07 17:51:20.477727
1d6556cf-d054-472f-9ab2-5349cf6d6202	43484205	create	client	77887045-ba54-41b9-b6f9-a56965d5f30f	{"name": "4Wall"}	2026-03-07 17:51:49.3987
855e1916-ad0d-43a5-b58c-e84a2918e049	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:01:15.029464
fc2f60e7-1082-4edb-b931-4562871edb17	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:15:29.269292
0b1f4f6e-4d2e-4483-bdd3-730321ef16e3	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:22:11.606128
e0e1258e-2799-497d-a848-59cbf82204eb	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:22:45.943641
8a2d8676-4168-4eb4-bd99-4ccfa4776c87	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:22:50.935217
b98c0bdb-8d21-432e-9f00-41326662221b	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:23:33.307246
cbe03b84-c170-4c9b-a502-f1e15962cc40	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:24:29.047431
2d76354b-21d0-498d-83ba-76e858cda8df	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:25:08.624797
b1032496-0855-4eac-a67d-8c9e8b0ff18f	43484205	update	layout	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	{"name": "Conference Room Layout"}	2026-03-07 18:28:42.879813
d2e2141e-88ab-41ff-9ab3-d38677c49fa2	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 18:42:04.022154
5b8a6507-5957-45bf-abed-94cef4fbce4c	43484205	create	layout	7752f452-a6ca-4435-a236-df28cd58018b	{"name": "Test Media Player"}	2026-03-07 18:42:34.071574
cf694bd6-b1b0-4a74-9e8a-176a850b81ec	43484205	update	layout	2980f82c-d073-4b43-adac-ac565b4f3295	{"name": "Test Schedule Layout"}	2026-03-07 18:43:46.674983
76295246-028b-4c4f-96db-40ef176c3a17	43484205	create	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Monitor"}	2026-03-07 18:50:16.639972
f1e67392-1a9e-4b45-97ca-5d503dc7c1a7	43484205	update	playlist	ca42ef9c-a88d-4077-b551-85eae704db23	{"name": "Welcome"}	2026-03-07 18:55:12.103637
7f191fd1-0c28-4ccc-81a4-621bb0c3c865	43484205	update	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 18:58:39.209699
ed242b6a-8914-44ef-b51a-a40db25b714c	43484205	create	programme	b94d661a-b589-43e9-888e-bc57133f70f2	{"name": "Holding screen"}	2026-03-07 19:00:39.848018
0207b274-77c7-4b36-b6ca-130ab60c2f08	43484205	create	display_profile	396a0022-4795-4389-8422-6ecc5ad209a3	{"name": "4K Landscape Monitor"}	2026-03-07 19:03:24.478106
208df31a-7f1b-40fb-966f-c40e059ca427	43484205	unpair	screen	34d45319-4e22-441f-867e-542c8122bb7b	{"name": "Conference room 2"}	2026-03-07 19:07:11.035326
37413d63-d2fe-4091-845e-8bb8f50b138c	43484205	unpair	screen	b33a6919-df32-4688-8acf-be5ff1575a72	{"name": "Conference room 1"}	2026-03-07 19:07:14.115913
687052a2-8ce6-459d-a5bc-9f23f9230831	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 19:10:23.6354
f89f93b0-95be-44fb-8da4-7a86a7913592	43484205	create	display_profile	2dbdd6a6-8e89-4c22-8c5e-079e5d09e84a	{"name": "IPad Pro 9.7\\""}	2026-03-07 19:10:58.63186
12946597-4800-4a64-9cda-bc3e5171606b	43484205	create	screen	fdba1c22-f3ae-4574-856a-810bf9525140	{"name": "IPad 1"}	2026-03-07 19:11:45.910517
6c74fe37-e66f-49c4-8440-8813e9f99939	43484205	update	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:13:18.892609
23276a18-196d-4637-a241-c550cac88029	43484205	update	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:16:39.972156
4bfa15aa-ca57-43d3-8a7e-880f55385552	43484205	update	layout	7752f452-a6ca-4435-a236-df28cd58018b	{"name": "Test Media Player"}	2026-03-07 19:17:45.031785
604e95a3-ca37-494a-8c63-56e13ce145f0	43484205	publish	programme	b94d661a-b589-43e9-888e-bc57133f70f2	\N	2026-03-07 19:21:06.863728
f70df350-8917-4342-8566-1e9302d90b02	43484205	update	layout	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	{"name": "Conference Room Layout"}	2026-03-07 19:27:41.007181
5b60f1ce-081f-4784-b9c4-e8cd4fc741b6	43484205	unpair	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:30:03.912172
af383368-6793-488c-95af-36f0a467a9e6	43484205	update	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:31:34.740201
efb66604-8b6f-4698-bb90-9f96f0b1963a	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 19:31:52.907889
a8327275-73f3-4854-8702-f9598780da65	43484205	update	screen	fdba1c22-f3ae-4574-856a-810bf9525140	{"name": "IPad 1"}	2026-03-07 19:32:18.899879
a0435733-3f09-40f9-9455-03f70232b707	43484205	unpair	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:37:48.289348
9d7116b6-b1dc-440c-a528-aba126f67684	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 19:45:56.687698
1ebb9912-1daf-47d6-a892-19dee871d640	43484205	update	layout	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	{"name": "Conference Room Layout"}	2026-03-07 19:50:06.253386
9593759b-cfcb-475c-a442-0fda098b414c	43484205	update	layout	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	{"name": "Conference Room Layout"}	2026-03-07 19:50:41.284465
c959d9f0-d25c-4c60-a9b9-a2ccc2c88faa	43484205	update	layout	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	{"name": "Conference Room Layout"}	2026-03-07 19:51:08.583245
dcb78126-6dfb-4a1f-b82a-0d5823406c96	43484205	update	layout	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	{"name": "Conference Room Layout"}	2026-03-07 19:53:18.291205
0e7fd58b-a7b2-46e2-9407-a7854ade2839	43484205	unpair	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:54:38.527474
60209044-d0c6-45ae-a39b-cc7548b28e2a	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 19:55:03.490751
f1b1cf54-fbd8-4c02-ad2c-e71de056b7b3	43484205	unpair	screen	b33a6919-df32-4688-8acf-be5ff1575a72	{"name": "Conference room 1"}	2026-03-07 19:56:49.031976
a9a539f1-088d-4539-8880-9ed5ee8771d1	43484205	unpair	screen	d4187726-e894-4c46-8f20-5987423a141a	{"name": "4K Landscape Monitor"}	2026-03-07 19:58:41.618287
4ab415a5-9175-4eeb-b4a5-609234d113c5	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 20:08:19.512542
cf850bc7-4423-43b0-92c9-d5f16ae2184a	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 22:21:01.063812
0e498b5a-8163-4dee-9bdc-71e6cbb94e43	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 22:27:40.022264
81a4e4de-85e8-46ba-a0b0-2e5612e46c53	43484205	login	auth	43484205	{"email": "stompkins@4wall.com"}	2026-03-07 22:42:19.455206
a740af1b-61b8-4f39-937a-022a02e8271d	43484205	create	display_profile	5812e59a-3b16-4d07-86ed-595fcb6f02a6	{"name": "Test E2E Profile", "clientId": null}	2026-03-07 22:42:40.201485
d51081ab-9c73-4339-bebb-f75103a78141	43484205	delete	display_profile	5812e59a-3b16-4d07-86ed-595fcb6f02a6	\N	2026-03-07 22:43:42.336048
999ccf27-af55-4c3b-ab1d-fa0881a43fc7	43484205	enable_2fa	auth	43484205	\N	2026-03-08 18:50:11.679799
\.


--
-- Data for Name: brand_packs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brand_packs (id, event_id, name, version, primary_color, secondary_color, accent_color, background_color, text_color, font_primary, font_secondary, logo_light_url, logo_dark_url, default_background_url, standby_config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clients (id, name, description, logo_url, created_at, updated_at) FROM stdin;
8c32deed-2f51-4fa6-806f-f8dcefc2923a	Farnborough		\N	2026-01-27 14:09:24.276773	2026-03-07 17:51:07.677
6218b5e1-0110-42c4-bb5c-513cbe805877	Royal Lancaster Hotel		\N	2026-03-07 17:51:20.474439	2026-03-07 17:51:20.474439
77887045-ba54-41b9-b6f9-a56965d5f30f	4Wall		\N	2026-03-07 17:51:49.394247	2026-03-07 17:51:49.394247
\.


--
-- Data for Name: display_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.display_profiles (id, name, width, height, orientation, safe_padding, screen_type, refresh_rate, created_at, client_id) FROM stdin;
4b2bd609-4a85-4417-8fc1-8e3b6f62005e	1920 x 1080	1920	1080	landscape	0	standard	60	2026-01-27 14:37:19.86152	\N
dbeee0e0-37a6-4c5b-972c-e43fb0716dd7	1080 x 1920	1080	1920	portrait	0	standard	60	2026-01-27 14:37:38.338384	\N
396a0022-4795-4389-8422-6ecc5ad209a3	4K Landscape Monitor	3840	2160	landscape	0	standard	60	2026-03-07 19:03:24.463054	\N
2dbdd6a6-8e89-4c22-8c5e-079e5d09e84a	IPad Pro 9.7"	2048	1536	landscape	0	standard	60	2026-03-07 19:10:58.627476	\N
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, client_id, name, description, start_date, end_date, is_active, created_at, updated_at, color_palette) FROM stdin;
8efa891f-4bab-493a-8af2-17c3069aa5bf	8c32deed-2f51-4fa6-806f-f8dcefc2923a	Press week		2026-01-27 14:11:23.885	2026-01-29 00:00:00	t	2026-01-27 14:11:39.872575	2026-02-06 05:10:41.157	[{"name": "Test Red", "color": "#ff0000"}]
\.


--
-- Data for Name: layout_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.layout_templates (id, event_id, name, version, zones, profile_overrides, created_at, updated_at, aspect_ratio, custom_width, custom_height) FROM stdin;
55c58437-1103-4425-a947-47d8b156a760	\N	Styling Test Layout AhO6ra	1	[{"x": 0, "y": 0, "id": "main", "name": "Main Content", "type": "media", "width": 100, "height": 85, "zIndex": 1}, {"x": 0, "y": 85, "id": "ticker", "name": "Ticker", "type": "ticker", "width": 70, "height": 15, "zIndex": 2}, {"x": 70, "y": 85, "id": "clock", "name": "Clock", "type": "clock", "width": 15, "height": 15, "zIndex": 2, "textAlign": "center", "textColor": "", "newsRssUrl": "", "shaderCode": "", "borderColor": "", "borderWidth": 1, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "shaderPreset": "gradient", "textFontSize": "medium", "newsItemCount": 10, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "newsScrollSpeed": 50, "weatherLocation": "", "gradientEndColor": "", "gradientDirection": "to-b", "textVerticalAlign": "middle"}, {"x": 85, "y": 85, "id": "logo", "name": "Logo", "type": "logo", "width": 15, "height": 15, "zIndex": 2}, {"x": 9, "y": 9, "id": "zone-1769670910914", "name": "Styled Zone", "type": "media", "width": 27, "height": 33, "zIndex": 1, "textColor": "#ffffff", "newsRssUrl": "", "borderColor": "#ff0000", "borderWidth": 3, "weatherUnit": "celsius", "borderRadius": 8, "newsTextSize": "medium", "newsItemCount": 10, "backgroundColor": "#00ff4c", "backgroundImage": "", "backgroundVideo": "", "newsScrollSpeed": 50, "weatherLocation": ""}]	\N	2026-01-29 07:14:03.129019	2026-01-29 14:21:09.17	16:9	\N	\N
26bd66ad-9ae8-4200-aaae-39fe50bca1b4	\N	Portrait Display Test	1	[{"x": 0, "y": 0, "id": "main", "name": "Main Content", "type": "media", "width": 100, "height": 85, "zIndex": 1, "mediaId": "e2b0542f-3133-4c17-a646-fb4b32574763", "qrLabel": "", "qrContent": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#0000ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "#ff0000", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-br", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 0, "y": 85, "id": "ticker", "name": "Ticker", "type": "ticker", "width": 64, "height": 15, "zIndex": 2}, {"x": 66, "y": 85, "id": "clock", "name": "Clock", "type": "clock", "width": 21, "height": 15, "zIndex": 2}, {"x": 85, "y": 85, "id": "logo", "name": "Logo", "type": "logo", "width": 15, "height": 15, "zIndex": 2}]	\N	2026-01-29 13:57:36.901843	2026-02-06 03:59:15.051	9:16	\N	\N
57e3c895-c2e1-45ae-962d-62b8f51f1ef7	8efa891f-4bab-493a-8af2-17c3069aa5bf	Conference Room Layout	1	[{"x": 58, "y": 46, "id": "zone-1771716229520", "name": "Video AI", "type": "media", "width": 20, "height": 20, "zIndex": 18, "mediaId": "be37cb83-578d-4c13-9cf9-6565435d7f0f", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 18, "y": 33, "id": "zone-1769699139007", "name": "Historic Farnborough TEXT", "type": "text", "width": 19, "height": 6, "zIndex": 17, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "Historic Photos", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 26, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 18.5, "y": 32.9, "id": "zone-1770439296147", "name": "50% box", "type": "shape", "width": 18, "height": 6, "zIndex": 16, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 75, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#000000", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 0, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 87, "y": 34, "id": "zone-1770399905171", "name": "Toilets", "type": "shape", "width": 5, "height": 9, "zIndex": 15, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "arrow-left", "shapeType": "rectangle", "textAlign": "center", "textColor": "#000000", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 0, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "Toilets", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "left", "shapeFillColor": "#3b82f6", "shapeIconColor": "#fff700", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": false, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 14, "shapeIconTextSize": 22, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "#ffffff", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 87, "y": 40, "id": "zone-1770439836093", "name": "Cafe", "type": "shape", "width": 5, "height": 10, "zIndex": 14, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "arrow-left", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 0, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "Cafe", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "left", "shapeFillColor": "#3b82f6", "shapeIconColor": "#fff700", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": false, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 14, "shapeIconTextSize": 22, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "#ffffff", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 87, "y": 47, "id": "zone-1770439966781", "name": "Exit", "type": "shape", "width": 5, "height": 8, "zIndex": 13, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "arrow-right", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 0, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "Exit", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "left", "shapeFillColor": "#3b82f6", "shapeIconColor": "#fff700", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": false, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 14, "shapeIconTextSize": 22, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "#ffffff", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 87, "y": 33, "id": "zone-1770440792726", "name": "50% White box", "type": "shape", "width": 10, "height": 23, "zIndex": 12, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#000000", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#ffffff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": false, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 1, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 55, "y": 25, "id": "zone-1769886543865", "name": "Countdown timer", "type": "countdown", "width": 23, "height": 22, "zIndex": 11, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": "medium", "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "Time to Take-Off!", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "countdownUnitGap": 0, "gradientEndColor": "", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "Europe/London", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownLabelSize": 14, "countdownSeparator": "colon", "countdownShowHours": true, "countdownTitleSize": 32, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "2026-07-20T09:00", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 2, "y": 4, "id": "zone-1769753447524", "name": "Logo", "type": "media", "width": 37, "height": 17, "zIndex": 10, "mediaId": "e2b0542f-3133-4c17-a646-fb4b32574763", "qrLabel": "", "qrContent": "", "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "qrContentType": "url", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "textShadowBlur": 2, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "qrWifiEncryption": "WPA", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "textShadowEnabled": false, "textVerticalAlign": "middle", "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 41, "y": 11, "id": "zone-1769748749146", "name": "FreeTEXT", "type": "ticker", "width": 59, "height": 10, "zIndex": 9, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "Welcome to the 78th Anniversary of the Farnborough Airshow", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 36, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 30, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 0, "y": 0, "id": "zone-1770347661495", "name": "Header box", "type": "shape", "width": 100, "height": 25, "zIndex": 8, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeType": "square", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 50, "textFontSize": "medium", "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#000000", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#000000", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 0, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 25, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 7.5, "y": 32, "id": "zone-1769698876709", "name": "Photo Montage", "type": "montage", "width": 40, "height": 49, "zIndex": 7, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "contain", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": ["637b6032-240c-4e06-b163-52c38e5bf81a", "8cc5c312-7cd0-46ac-b6f4-3c29ef4b8387", "e4700bfc-fa78-4595-ab66-cdd423aaba63", "d526d71f-47a9-4ef2-b28c-993855255013", "441297af-7bd5-4667-907c-e5768e4a037d", "f1a6ea6d-5fa3-44a3-92b6-72faf9853edf", "6ede3ceb-39be-4918-a2e9-580621880390", "81f07281-c8a3-4665-a303-c78c23e92995", "bce74f20-1220-42ef-8414-3978da1c750b", "2bc90c4f-ac11-4ad0-92ec-8c35d11f946a", "ab8ea52e-61fb-47ae-ba38-960f0d43ce27"], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 55, "y": 70, "id": "zone-1769726244327", "name": "Clock - San Diego", "type": "clock", "width": 15, "height": 30, "zIndex": 6, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "PST", "clockStyle": "analog", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 1, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": "medium", "clockShowDate": true, "clockTimezone": "America/Los_Angeles", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "roman", "countdownCompact": false, "gradientEndColor": "#000000", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "clockDateFontSize": 14, "clockTimeFontSize": 32, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": true, "textVerticalAlign": "middle", "clockLabelFontSize": 14, "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 70, "y": 85, "id": "clock", "name": "Clock - London", "type": "clock", "width": 15, "height": 15, "zIndex": 5, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "London", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 1, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": true, "clockTimezone": "Europe/London", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "#000000", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "clockDateFontSize": 14, "clockTimeFontSize": 28, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": true, "textVerticalAlign": "middle", "clockLabelFontSize": 14, "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 85, "y": 85, "id": "logo", "name": "Weather", "type": "weather", "width": 15, "height": 15, "zIndex": 4, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "weatherLat": 41.38879, "weatherLng": 2.15899, "borderColor": "#ffffff", "borderWidth": 1, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 26, "weatherLocation": "Farnborough, England, United Kingdom", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "#000000", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 0, "y": 85, "id": "ticker", "name": "Ticker", "type": "news", "width": 55, "height": 15, "zIndex": 3, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "https://ukdefencejournal.org.uk/feed/", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 1, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 32, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 28, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "#000000", "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": true, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 87, "y": 60, "id": "zone-1769741990921", "name": "Website QR", "type": "qrcode", "width": 10, "height": 21, "zIndex": 2, "mediaId": "", "qrLabel": "Contact me!", "qrContent": "https://www.4wall.com", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "4Wall Entertainment Uk Ltd", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "Scott Tompkins", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "stompkins@4wall.com", "qrVcardPhone": "+447976753496", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "vcard", "shapeArchSpan": 180, "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeFillColor": "#3b82f6", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "#000000", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "above", "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "qrWifiEncryption": "WPA", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 0, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "shapeCornerRadius": 0, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!"}, {"x": 0, "y": 0, "id": "zone-1772913143202", "name": "Shader", "type": "shader", "width": 100, "height": 100, "zIndex": 1, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 2, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "aurora", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "mediaPlayerLoop": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "mediaPlayerItems": [], "mediaPlayerMuted": true, "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "mediaPlayerFitMode": "contain", "mediaPlayerShuffle": false, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "mediaPlayerAutoPlay": true, "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "mediaPlayerTransition": "fade", "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!", "mediaPlayerTransitionDuration": 800}]	\N	2026-01-27 14:28:22.274908	2026-03-07 19:53:18.279	16:9	\N	\N
fe84a100-eb73-4c76-97cc-d43f4a373240	8efa891f-4bab-493a-8af2-17c3069aa5bf	Conference Room Layout (Copy)	1	[{"x": 4, "y": 2, "id": "zone-1769753670652-xc7sly9ic", "name": "Logo", "type": "media", "width": 93, "height": 9, "zIndex": 10, "mediaId": "e2b0542f-3133-4c17-a646-fb4b32574763", "qrLabel": "", "qrContent": "", "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "qrContentType": "url", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "textShadowBlur": 2, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "qrWifiEncryption": "WPA", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "textShadowEnabled": false, "textVerticalAlign": "middle", "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 0, "y": 13, "id": "zone-1769753670652-qwxttqsz2", "name": "FreeTEXT", "type": "ticker", "width": 100, "height": 3, "zIndex": 9, "mediaId": "", "qrLabel": "", "qrContent": "", "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "Welcome to the 58th Farnborough Airshow 2026", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "qrContentType": "url", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "textShadowBlur": 2, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "qrWifiEncryption": "WPA", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 30, "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "textShadowEnabled": true, "textVerticalAlign": "middle", "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 0, "y": 13, "id": "zone-1769753670652-cu4gwnqs9", "name": "Farnborough TEXT", "type": "text", "width": 100, "height": 18, "zIndex": 8, "mediaId": "", "qrLabel": "", "qrContent": "", "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "Farnborough Exhibition Centre", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "qrContentType": "url", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "textShadowBlur": 2, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "below", "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "qrWifiEncryption": "WPA", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "textShadowEnabled": true, "textVerticalAlign": "top", "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 20, "y": 41, "id": "zone-1769753670652-n2tfa269k", "name": "Photo Montage", "type": "montage", "width": 42, "height": 32, "zIndex": 7, "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "montageFitMode": "contain", "montageShuffle": false, "textShadowBlur": 2, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": ["9b977c09-d3bc-47fa-8058-f487d43336a5"], "newsScrollSpeed": 50, "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "textShadowEnabled": false, "textVerticalAlign": "middle", "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 30, "y": 81, "id": "zone-1769753670652-j7e44ct1o", "name": "Clock - San Diego", "type": "clock", "width": 40, "height": 11, "zIndex": 6, "textAlign": "center", "textColor": "", "clockLabel": "PST", "newsRssUrl": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 1, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "America/Los_Angeles", "newsItemCount": 10, "montageFitMode": "cover", "montageShuffle": false, "textShadowBlur": 2, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "#000000", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "textShadowEnabled": true, "textVerticalAlign": "middle", "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 0, "y": 81, "id": "zone-1769753670652-dc0vcr8eh", "name": "Clock - London", "type": "clock", "width": 41, "height": 11, "zIndex": 5, "textAlign": "center", "textColor": "", "clockLabel": "London", "newsRssUrl": "", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 1, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "Europe/London", "newsItemCount": 10, "montageFitMode": "cover", "montageShuffle": false, "textShadowBlur": 2, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "#000000", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "textShadowEnabled": true, "textVerticalAlign": "middle", "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 66, "y": 73, "id": "zone-1769753670652-eetjwv69d", "name": "Weather", "type": "weather", "width": 33, "height": 19, "zIndex": 4, "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "shaderCode": "", "weatherLat": 51.53333, "weatherLng": -1.36667, "borderColor": "#ffffff", "borderWidth": 1, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "montageFitMode": "cover", "montageShuffle": false, "textShadowBlur": 2, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "textShadowColor": "#000000", "weatherLocation": "Farnborough, England, United Kingdom", "gradientEndColor": "#000000", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "textShadowEnabled": true, "textVerticalAlign": "middle", "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 0, "y": 33, "id": "zone-1769753670652-hvmbuqn7w", "name": "Ticker", "type": "news", "width": 100, "height": 6, "zIndex": 3, "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "https://feeds.bbci.co.uk/news/england/london/rss.xml", "shaderCode": "", "borderColor": "#ffffff", "borderWidth": 1, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "large", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "montageFitMode": "cover", "montageShuffle": false, "textShadowBlur": 2, "backgroundColor": "#3700ff", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 10, "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "#000000", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "textShadowEnabled": true, "textVerticalAlign": "middle", "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 87, "y": 60, "id": "zone-1769753670652-u2ured7n7", "name": "Website QR", "type": "qrcode", "width": 13, "height": 9, "zIndex": 2, "qrLabel": "Contact me!", "qrContent": "https://www.4wall.com", "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "qrVcardOrg": "4Wall Entertainment Uk Ltd", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "Scott Tompkins", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "qrLabelColor": "#000000", "qrVcardEmail": "stompkins@4wall.com", "qrVcardPhone": "+447976753496", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "qrContentType": "vcard", "montageFitMode": "cover", "montageShuffle": false, "qrWifiPassword": "", "textShadowBlur": 2, "backgroundColor": "#000000", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": "medium", "qrLabelPosition": "above", "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "qrWifiEncryption": "WPA", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 0, "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "textShadowEnabled": false, "textVerticalAlign": "middle", "qrTransparentBackground": false, "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}, {"x": 0, "y": 0, "id": "zone-1769753670652-j3hnyk0bb", "name": "Background", "type": "shader", "width": 100, "height": 94, "zIndex": 1, "textAlign": "center", "textColor": "", "clockLabel": "", "newsRssUrl": "", "shaderCode": "", "borderColor": "", "borderWidth": 2, "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": "medium", "shaderPreset": "gradient", "textFontSize": "medium", "clockTimezone": "", "newsItemCount": 10, "montageFitMode": "cover", "montageShuffle": false, "textShadowBlur": 2, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "textShadowColor": "#000000", "weatherLocation": "", "gradientEndColor": "", "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "gradientDirection": "to-b", "montageTransition": "fade", "textShadowEnabled": false, "textVerticalAlign": "middle", "montageKenBurnsIntensity": 10, "montageTransitionDuration": 1000}]	\N	2026-01-30 06:14:30.738378	2026-01-30 06:49:08.907	9:16	\N	\N
2980f82c-d073-4b43-adac-ac565b4f3295	\N	Test Schedule Layout	1	[{"x": 0, "y": 0, "id": "zone-1772909020405", "name": "Media Player Zone", "type": "media_player", "width": 50, "height": 50, "zIndex": 3, "mediaId": "", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "mediaPlayerLoop": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "mediaPlayerItems": [{"id": "item-1772908987154-5d4gg", "duration": 10, "mediaAssetId": "be37cb83-578d-4c13-9cf9-6565435d7f0f"}, {"id": "item-1772908992405-ajkq7", "duration": 10, "mediaAssetId": "637b6032-240c-4e06-b163-52c38e5bf81a"}], "mediaPlayerMuted": true, "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "mediaPlayerFitMode": "contain", "mediaPlayerShuffle": false, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "mediaPlayerAutoPlay": true, "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "mediaPlayerTransition": "fade", "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!", "mediaPlayerTransitionDuration": 800}, {"x": 0, "y": 0, "id": "main", "name": "Main Content", "type": "media", "width": 100, "height": 85, "zIndex": 1}, {"x": 0, "y": 85, "id": "ticker", "name": "Ticker", "type": "ticker", "width": 70, "height": 15, "zIndex": 2}, {"x": 70, "y": 85, "id": "clock", "name": "Clock", "type": "clock", "width": 15, "height": 15, "zIndex": 2}, {"x": 85, "y": 85, "id": "logo", "name": "Logo", "type": "logo", "width": 15, "height": 15, "zIndex": 2}]	\N	2026-02-06 05:04:23.979908	2026-03-07 18:43:46.658	16:9	\N	\N
7752f452-a6ca-4435-a236-df28cd58018b	\N	Test Media Player	1	[{"x": 0, "y": 0, "id": "main", "name": "Main Content", "type": "media", "width": 100, "height": 85, "zIndex": 1, "mediaId": "be37cb83-578d-4c13-9cf9-6565435d7f0f", "qrLabel": "", "qrContent": "", "shapeIcon": "", "shapeType": "rectangle", "textAlign": "center", "textColor": "", "clockLabel": "", "clockStyle": "digital", "newsRssUrl": "", "qrVcardOrg": "", "qrWifiSsid": "", "shaderCode": "", "borderColor": "", "borderWidth": 0, "qrVcardName": "", "shaderSpeed": 1, "textContent": "", "weatherUnit": "celsius", "borderRadius": 0, "newsTextSize": 24, "qrLabelColor": "#000000", "qrVcardEmail": "", "qrVcardPhone": "", "shaderColor1": "#ff6b6b", "shaderColor2": "#4ecdc4", "shaderPreset": "gradient", "shapeOpacity": 100, "textFontSize": 24, "clockShowDate": false, "clockTimezone": "", "countdownSize": 24, "newsItemCount": 10, "qrContentType": "url", "shapeArchSpan": 180, "shapeIconText": "", "shapeRotation": 0, "clockFaceColor": "transparent", "clockHandColor": "#ffffff", "countdownTitle": "", "montageFitMode": "cover", "montageShuffle": false, "qrLocationName": "", "qrWifiPassword": "", "shaderVariable": 0.5, "shapeAlignment": "center", "shapeFillColor": "#3b82f6", "shapeIconColor": "", "textShadowBlur": 2, "tickerFontSize": 24, "backgroundColor": "", "backgroundImage": "", "backgroundVideo": "", "gradientEnabled": false, "mediaPlayerLoop": true, "montageAutoPlay": true, "montageDuration": 5, "montageKenBurns": false, "montageMediaIds": [], "newsScrollSpeed": 50, "qrLabelFontSize": 16, "qrLabelPosition": "below", "scheduleEndHour": 18, "scheduleEntries": [], "textShadowColor": "#000000", "weatherFontSize": 24, "weatherLocation": "", "clockMarkerColor": "#ffffff", "clockMarkerStyle": "numbers", "countdownCompact": false, "gradientEndColor": "", "mediaPlayerItems": [], "mediaPlayerMuted": true, "qrWifiEncryption": "WPA", "scheduleViewMode": "hourly", "shapeFillEnabled": true, "shapeStrokeColor": "#ffffff", "shapeStrokeStyle": "solid", "shapeStrokeWidth": 2, "textOutlineColor": "#000000", "textOutlineWidth": 0, "backgroundOpacity": 100, "countdownDayLabel": "Days", "countdownShowDays": true, "countdownTimezone": "", "gradientDirection": "to-b", "montageTransition": "fade", "qrBackgroundColor": "#ffffff", "qrErrorCorrection": "M", "qrForegroundColor": "#000000", "scheduleStartHour": 8, "shapeCornerRadius": 0, "shapeIconTextSize": 14, "textShadowEnabled": false, "textVerticalAlign": "middle", "countdownHourLabel": "Hours", "countdownSeparator": "colon", "countdownShowHours": true, "mediaPlayerFitMode": "contain", "mediaPlayerShuffle": false, "scheduleHeaderText": "", "scheduleTimeFormat": "24h", "shapeIconTextColor": "", "shapeLineDirection": "horizontal", "clockShowSecondHand": true, "countdownFontFamily": "mono", "countdownLabelColor": "", "countdownTargetDate": "", "mediaPlayerAutoPlay": true, "clockShowHourMarkers": true, "countdownMinuteLabel": "Minutes", "countdownNumberColor": "", "countdownSecondLabel": "Seconds", "countdownShowMinutes": true, "countdownShowSeconds": true, "mediaPlayerTransition": "fade", "shapeIconTextPosition": "right", "qrTransparentBackground": false, "scheduleShowCurrentTime": true, "montageKenBurnsIntensity": 10, "countdownShowLeadingZeros": true, "montageTransitionDuration": 1000, "countdownCompletionMessage": "Event Started!", "mediaPlayerTransitionDuration": 800}, {"x": 0, "y": 85, "id": "ticker", "name": "Ticker", "type": "ticker", "width": 70, "height": 15, "zIndex": 2}, {"x": 70, "y": 85, "id": "clock", "name": "Clock", "type": "clock", "width": 15, "height": 15, "zIndex": 2}, {"x": 85, "y": 85, "id": "logo", "name": "Logo", "type": "logo", "width": 15, "height": 15, "zIndex": 2}]	\N	2026-03-07 18:42:34.065353	2026-03-07 19:17:45.027	16:9	\N	\N
\.


--
-- Data for Name: live_overrides; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.live_overrides (id, event_id, name, priority, targets, layout_template_id, zone_sources, start_time, end_time, is_active, created_by_id, created_at) FROM stdin;
040e52bf-3acb-487c-8f66-b7bb4f01859f	\N	test	100	[{"id": "34d45319-4e22-441f-867e-542c8122bb7b", "type": "screen"}, {"id": "b33a6919-df32-4688-8acf-be5ff1575a72", "type": "screen"}]	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	\N	2026-02-21 23:31:45.929	2026-02-21 23:46:45.929	t	\N	2026-02-21 23:31:45.999801
\.


--
-- Data for Name: media_assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.media_assets (id, event_id, name, original_path, thumbnail_path, media_type, mime_type, width, height, duration, file_size, checksum, tags, created_at, display_mode, client_id) FROM stdin;
e2b0542f-3133-4c17-a646-fb4b32574763	\N	navlogonew2026.svg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/9fccb227-9832-4f8a-a150-e3cbe3208396	\N	image	image/svg+xml	\N	\N	\N	10581	\N	\N	2026-01-30 06:10:15.363573	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
2bc90c4f-ac11-4ad0-92ec-8c35d11f946a	\N	6410272231_5382fdf581_w.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/a548243e-103b-4fae-ad63-e9096bec95d8	\N	image	image/jpeg	\N	\N	\N	58222	\N	\N	2026-02-07 04:06:44.467587	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
bce74f20-1220-42ef-8414-3978da1c750b	\N	6410331415_f523ef0b86.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/5d0fd8e6-3f72-4845-8dcb-1959f1c56917	\N	image	image/jpeg	\N	\N	\N	67941	\N	\N	2026-02-07 04:06:44.728477	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
81f07281-c8a3-4665-a303-c78c23e92995	\N	6410495887_86c133e359.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/a266933f-dd9d-4801-95f5-ce717f7dccb4	\N	image	image/jpeg	\N	\N	\N	61404	\N	\N	2026-02-07 04:06:44.98893	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
6ede3ceb-39be-4918-a2e9-580621880390	\N	6410535621_2d866ff53e.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/cbe81dd0-fa20-418a-98c7-1e8c0d7f6209	\N	image	image/jpeg	\N	\N	\N	54461	\N	\N	2026-02-07 04:06:45.25251	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
f1a6ea6d-5fa3-44a3-92b6-72faf9853edf	\N	6410553651_80c0ec47bf.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/d9af5304-8ba1-43f2-9419-01439c14b081	\N	image	image/jpeg	\N	\N	\N	49059	\N	\N	2026-02-07 04:06:45.511319	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
441297af-7bd5-4667-907c-e5768e4a037d	\N	6410567281_7af7b88c5e.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/28393467-0b9c-46a5-b642-5be3f9e28b30	\N	image	image/jpeg	\N	\N	\N	55522	\N	\N	2026-02-07 04:06:45.767262	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
d526d71f-47a9-4ef2-b28c-993855255013	\N	6411207655_3e08fbc3c8.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/09937f64-7088-486f-bf91-f755ab25904a	\N	image	image/jpeg	\N	\N	\N	85234	\N	\N	2026-02-07 04:06:46.025791	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
e4700bfc-fa78-4595-ab66-cdd423aaba63	\N	A general view of the N1 control tower and N2 late 1930s watch tower from the south.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/03a453de-8a37-47f1-b244-6f62522c76d8	\N	image	image/jpeg	\N	\N	\N	108424	\N	\N	2026-02-07 04:06:46.286681	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
8cc5c312-7cd0-46ac-b6f4-3c29ef4b8387	\N	Farnborough Air Show 1952.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/22c83169-c8f3-4c17-bd78-da84ede994b6	\N	image	image/jpeg	\N	\N	\N	29146	\N	\N	2026-02-07 04:06:46.544438	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
ab8ea52e-61fb-47ae-ba38-960f0d43ce27	\N	6406563695_8f10b96d6e.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/4c4a9cd0-cc06-472f-9612-b0cb6c252fbd	\N	image	image/jpeg	\N	\N	\N	72950	\N	\N	2026-02-07 04:06:44.1798	contain	8c32deed-2f51-4fa6-806f-f8dcefc2923a
637b6032-240c-4e06-b163-52c38e5bf81a	\N	The Fairey Rotodyne, surrounded by a crowd of spectators, at Farnborough Airshow.jpg	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/802f4778-f6de-4d11-8679-bd09f14f28bf	\N	image	image/jpeg	\N	\N	\N	14777	\N	\N	2026-02-07 04:07:30.807621	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
be37cb83-578d-4c13-9cf9-6565435d7f0f	\N	4_4 Guest Intro v6.mp4	https://storage.googleapis.com/replit-objstore-dd7743ce-7973-48fd-a10b-9322339bbd7a/.private/uploads/803d36cf-8f39-4bab-b1ce-015e523517f6	/objects/thumbnails/512771cb-e830-4990-be2a-1a35525810c3.jpg	video	video/mp4	\N	\N	\N	13128378	\N	\N	2026-02-21 23:23:03.8693	cover	8c32deed-2f51-4fa6-806f-f8dcefc2923a
\.


--
-- Data for Name: media_shares; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.media_shares (id, media_asset_id, client_id, shared_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.password_reset_tokens (id, user_id, token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: player_heartbeats; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.player_heartbeats (id, screen_id, "timestamp", temperature, storage_free, uptime, current_block_id, current_item_id, errors) FROM stdin;
710b0154-5d2b-4394-9b75-f4be7c41ef77	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 16:52:26.72691	\N	\N	30	\N	\N	\N
7ee5573b-1ff1-4dda-8235-f05cf5fc6876	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:25:26.413346	\N	\N	32	\N	\N	\N
77e69f3b-3781-4cd3-8d3d-8f8442e41126	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:25:56.419963	\N	\N	62	\N	\N	\N
e499dad5-fde1-4edd-9853-a64063019e22	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:26:26.411868	\N	\N	92	\N	\N	\N
bcf769eb-1fa7-422e-8b2c-e5de42990902	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:26:56.438833	\N	\N	122	\N	\N	\N
abff0166-62f2-4c27-9a30-7b57adae60f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:27:26.414123	\N	\N	152	\N	\N	\N
9fee4838-6a2d-4ade-a180-f264577acf75	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:27:56.415785	\N	\N	182	\N	\N	\N
6bd8fbed-3daf-4c9f-bd6e-0f997d20d7a6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:29:29.419992	\N	\N	33	\N	\N	\N
0039babe-66bb-4a47-9957-c291c20ef3a5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:29:59.427678	\N	\N	63	\N	\N	\N
c9706232-2802-4d64-87a4-234cb78f709f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:30:29.414478	\N	\N	93	\N	\N	\N
a1bcf3cb-30c5-4b30-8315-410b3aebced6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:30:59.410247	\N	\N	123	\N	\N	\N
273e58f1-6aa5-4abf-ae4c-23c469485997	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:31:29.412733	\N	\N	153	\N	\N	\N
ef13e255-d90b-43dd-936b-047e3af7302c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:31:59.415557	\N	\N	183	\N	\N	\N
0511cb74-5bdc-49e6-a413-f46053409f64	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:32:29.411873	\N	\N	213	\N	\N	\N
0217e588-aac5-4d85-8318-bb7eb89e4eb9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:32:59.413752	\N	\N	243	\N	\N	\N
b5e63cf3-7c62-40c2-bb32-5ebcd1d545f0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:33:29.424137	\N	\N	273	\N	\N	\N
ce0451d6-bb40-4097-aa75-70b9a465e04f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:33:59.415808	\N	\N	303	\N	\N	\N
250f1979-1882-40a0-81a4-cfdcc7898771	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:34:28.860274	\N	\N	333	\N	\N	\N
ba72147d-7e50-4bc5-a2eb-77bd0ced2be7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:35:03.413548	\N	\N	32	\N	\N	\N
c78cd494-f0f6-44cc-87fa-4ff09ed4088c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:35:33.425172	\N	\N	62	\N	\N	\N
96999b34-05ba-428a-a175-5811ef3a1279	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:36:03.454138	\N	\N	92	\N	\N	\N
3086a735-1af4-4924-9454-c8812ae0053e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:36:33.44174	\N	\N	122	\N	\N	\N
234c641b-f57a-4aba-8faa-bdffd044f46a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:37:03.451133	\N	\N	152	\N	\N	\N
3a5e5f1d-9b28-4ce6-97d9-10f1e57e73ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:37:33.445821	\N	\N	182	\N	\N	\N
3ccad427-95e7-46b3-9c6f-0e72a9d1fe15	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:38:17.440687	\N	\N	226	\N	\N	\N
a79d80bc-9132-4d85-a2d0-cf73b570bdc2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:39:17.431131	\N	\N	286	\N	\N	\N
bfcc76c2-720e-4831-8a80-9938f0559996	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:39:51.411818	\N	\N	33	\N	\N	\N
f8bb9879-3138-4c2d-b724-1d01f3c2711a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:40:36.41485	\N	\N	31	\N	\N	\N
e9685cfd-b3aa-46c0-843e-e52ec67f903b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:41:06.432049	\N	\N	61	\N	\N	\N
a88a8324-6741-4bdf-8064-691f05d5d4f5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:41:36.455716	\N	\N	91	\N	\N	\N
304d7628-7cf4-4227-93c6-24e720bae675	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:42:06.441995	\N	\N	121	\N	\N	\N
b862993b-b55a-4fd9-bc2e-d024bef53e1e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:42:36.429267	\N	\N	151	\N	\N	\N
67df362b-aa56-4be3-a6de-54f9cc852e8d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:43:06.447255	\N	\N	181	\N	\N	\N
dc035849-18da-4bb4-8c04-9c0527417760	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:43:49.42247	\N	\N	32	\N	\N	\N
a344a611-37db-46d3-9ac4-e2a28fd6b1c9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:44:19.417757	\N	\N	62	\N	\N	\N
1aa3eaf7-f980-4db4-b34d-b36a0ca841da	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:44:49.435027	\N	\N	92	\N	\N	\N
8556ba59-595a-40ab-b011-6c3769cdc768	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:45:19.416677	\N	\N	122	\N	\N	\N
b42648f4-55ab-4ca4-aedc-c818d49919a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:45:49.445363	\N	\N	152	\N	\N	\N
e7b1537e-3b1e-493f-a693-d37f230b2f5d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:46:19.416958	\N	\N	182	\N	\N	\N
3faaf12a-2d16-4fa9-905e-66f0f2dd77fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:47:09.654502	\N	\N	230	\N	\N	\N
3463f9ff-f56a-435e-8f5a-680e861b0936	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:47:42.128291	\N	\N	32	\N	\N	\N
0462860e-1f09-4d4b-8c33-c6e04c753475	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:48:12.422221	\N	\N	62	\N	\N	\N
8390499e-0bee-4e7d-ad2f-8e97773ca023	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:48:51.140549	\N	\N	31	\N	\N	\N
9401b5b0-82e7-4fc3-9b7e-473150e36cca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:49:21.42741	\N	\N	62	\N	\N	\N
b1f1b6d9-d9d6-4cb5-b89d-6c0c764a1197	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:49:51.435574	\N	\N	92	\N	\N	\N
606b8bcb-5fe5-476c-9288-0841a3d513d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:50:21.419133	\N	\N	122	\N	\N	\N
c467eb82-fdd4-4380-99ea-96e6e2f0772d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:50:51.144789	\N	\N	151	\N	\N	\N
154e5901-6854-454f-935c-30f8771cfaab	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:51:40.48234	\N	\N	35	\N	\N	\N
a420e994-daef-4488-96a0-185b43e00673	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:54:07.653403	\N	\N	35	\N	\N	\N
bcba556c-d549-4730-aacf-98b91f3fb36e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:54:15.810317	\N	\N	30	\N	\N	\N
68ebabe1-1728-431a-aab7-13bb90f7527c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:54:57.195497	\N	\N	33	\N	\N	\N
3cc7f563-bd57-4453-a081-81b6a59bee5a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:55:27.187189	\N	\N	63	\N	\N	\N
fcf62fb7-c189-4f2d-a766-843bebfd70a3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:55:57.415753	\N	\N	94	\N	\N	\N
cac01914-4638-4c85-9a62-4d5992f2736c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:56:27.420719	\N	\N	124	\N	\N	\N
b06fe455-9a50-498e-950f-51326d9b531f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:56:57.44313	\N	\N	154	\N	\N	\N
1db97bc1-7a3a-44fa-bb07-5746699dc54f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:57:27.179607	\N	\N	183	\N	\N	\N
d2a28318-7de7-49f8-ba21-cfce5d837cf0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:58:03.417927	\N	\N	32	\N	\N	\N
42f02c93-6319-4245-9ce2-a8c0495189c4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:58:33.430939	\N	\N	62	\N	\N	\N
214f5e6d-9bd9-4a93-987e-0f63b1a5d502	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:59:56.555187	\N	\N	32	\N	\N	\N
5a2ec41f-2125-4a7b-8218-5c64b11a2fc4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 17:59:59.429645	\N	\N	30	\N	\N	\N
4d1b60d1-1d5b-41fd-ab8c-9b370e9968b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:00:26.548581	\N	\N	62	\N	\N	\N
69d7d245-9f69-48da-a15b-57428d2dd8f4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:00:29.463029	\N	\N	60	\N	\N	\N
e6526aee-8be3-4ecc-8911-db3f99c5e135	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:00:57.427867	\N	\N	93	\N	\N	\N
c290c27e-decc-4ebe-b0d8-da2a937d0753	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:01:29.864414	\N	\N	123	\N	\N	\N
1552a2d9-8eb1-4881-9e1c-859d7190bfa7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:02:06.774758	\N	\N	30	\N	\N	\N
c4ee4d72-eec3-4f45-bfad-840528dbf6bb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:02:14.631944	\N	\N	32	\N	\N	\N
77bcd514-eebb-466a-8c37-82d75fcaa30d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:03:09.930211	\N	\N	37	\N	\N	\N
f7de183f-6773-4f0e-8570-55d2baca0737	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:03:39.92099	\N	\N	67	\N	\N	\N
c14466a8-eccb-4d12-8a4a-9632ef582208	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:04:09.925907	\N	\N	97	\N	\N	\N
28550938-7c15-499f-a37b-24f25ef60d25	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:04:39.922216	\N	\N	127	\N	\N	\N
28425aa5-e71c-45ab-ae9f-c12480932df6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:05:09.930411	\N	\N	157	\N	\N	\N
d93966c9-3774-4787-824f-0603c6b7ac18	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:05:39.938343	\N	\N	187	\N	\N	\N
ed7317c5-5c25-4aa6-a9be-e540e0bf938e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:06:09.934555	\N	\N	217	\N	\N	\N
87178f68-63d8-4bd0-b806-9d8776cbbb3d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:06:39.921895	\N	\N	247	\N	\N	\N
7c6e85e1-fcdc-4343-a774-12b66cfa50cc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:07:09.930066	\N	\N	277	\N	\N	\N
bf7fbfe5-506b-44ea-9724-78a7edec3eaa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:07:39.924492	\N	\N	307	\N	\N	\N
4ecd85a3-d9a1-481d-b691-7a8073f28e48	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:08:09.930469	\N	\N	337	\N	\N	\N
3f1365c9-797a-456e-b211-47f6acc84547	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:08:39.926402	\N	\N	367	\N	\N	\N
de692b40-b644-43f3-82ee-8e1d04ab23d4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:09:09.923129	\N	\N	397	\N	\N	\N
7e382dab-c5e9-43df-961b-d57c8933c584	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:09:39.92579	\N	\N	427	\N	\N	\N
96c072cf-4598-47d0-880b-d637efa270b7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:10:09.925218	\N	\N	457	\N	\N	\N
eec061db-3177-4538-a733-1ff219b0928d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:10:39.932416	\N	\N	487	\N	\N	\N
f68449ff-137f-4cc4-9b39-39589583e162	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:11:09.945142	\N	\N	517	\N	\N	\N
e445a0e9-9cdf-4d38-a252-4c1c040ec6c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:11:39.922811	\N	\N	547	\N	\N	\N
f21b9e7a-6de4-41e9-8ad7-d70246f28ddb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:12:09.924697	\N	\N	577	\N	\N	\N
4a72b3ea-d8e5-4578-b484-12863d010b9a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:12:39.924458	\N	\N	607	\N	\N	\N
a4c99033-0436-465d-8f2e-ee1d47ba3827	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:13:09.923987	\N	\N	637	\N	\N	\N
c8b6fc0c-168e-42a0-acd9-f9d04bfc7973	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:13:39.927968	\N	\N	667	\N	\N	\N
d2553bde-5415-43d8-a8f6-3e872283e3a0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:14:09.938933	\N	\N	697	\N	\N	\N
c3624a0a-a6ff-45ce-8932-0a4f9fcc682b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:14:39.923755	\N	\N	727	\N	\N	\N
169bdc64-2489-49e2-bf22-9e9b6fcfd0ba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:15:09.925445	\N	\N	757	\N	\N	\N
28617816-a18f-43b6-833b-95340b5908bb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:15:39.931302	\N	\N	787	\N	\N	\N
aef0acae-69ee-4f90-b703-262ae854295b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:16:09.941435	\N	\N	817	\N	\N	\N
bbc4575c-7f0b-4154-9803-5d3c6e94a7a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:16:40.742794	\N	\N	847	\N	\N	\N
0a15f011-b735-48ca-81ba-6783260d9543	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:17:10.425235	\N	\N	877	\N	\N	\N
0399a565-3503-4312-b763-b143259c3a54	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:18:43.424394	\N	\N	33	\N	\N	\N
1d13cc5f-d777-42cd-b224-b98e5ea34204	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:19:13.427631	\N	\N	63	\N	\N	\N
7c71bc19-f2f5-4b2b-a37e-ba52356d541c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:19:43.431409	\N	\N	93	\N	\N	\N
bd54b7b2-674a-486c-93cf-7d2f99eaa9fa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:20:13.430914	\N	\N	123	\N	\N	\N
eb82c574-3287-4aa5-87bf-dbd732051859	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:20:43.430746	\N	\N	153	\N	\N	\N
fefafb84-8860-4313-8527-32af20839934	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:21:13.427165	\N	\N	183	\N	\N	\N
4e2ce0a9-55cc-4434-894e-03b6e349cdf5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:22:46.428841	\N	\N	33	\N	\N	\N
88440688-fd06-4458-a710-928929dba46f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:23:16.427138	\N	\N	63	\N	\N	\N
94b2615a-d20c-4fa8-a69b-49533c7df018	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:23:46.425182	\N	\N	93	\N	\N	\N
029e6407-85af-4712-a93c-2430e8d7cfe7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:24:16.424197	\N	\N	123	\N	\N	\N
1e951e27-f6ed-4869-8fed-150f2ff3a3ef	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:24:46.501672	\N	\N	153	\N	\N	\N
95e96640-c21d-4f29-8c05-44bc958b617e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:25:16.460221	\N	\N	183	\N	\N	\N
0f6b1aa6-62d3-4809-9b1c-09f2e3e58b95	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 18:26:17.761475	\N	\N	244	\N	\N	\N
e93ba41f-8637-4c7a-bdbf-a0e5d6cf847b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:40:39.390439	\N	\N	48	\N	\N	\N
45cd0069-51ac-4c14-bbb3-5d0f4bb36cea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:41:09.383675	\N	\N	78	\N	\N	\N
c818f328-3d3f-4678-878b-7c6e66ef9780	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:41:39.381311	\N	\N	108	\N	\N	\N
c8d9e5ac-e09b-420c-9a34-76197e58fef2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:42:09.375475	\N	\N	138	\N	\N	\N
ff3d9934-ad02-4b1c-bbc0-f3cf37a1f38b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:42:39.377651	\N	\N	168	\N	\N	\N
3567b01e-543a-4ab6-8951-4672fc5c637d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:43:09.394597	\N	\N	198	\N	\N	\N
e0fac715-5a2b-402f-bd18-b99aa0386739	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:43:39.391786	\N	\N	228	\N	\N	\N
c8abce7a-3642-4d52-9620-3169d4f59b3e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:44:09.382919	\N	\N	258	\N	\N	\N
baae6e0a-d9f7-4485-84fe-1983eec830c9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:44:39.383993	\N	\N	288	\N	\N	\N
53a17c31-2f48-4002-b280-bb1abb1cc6fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:45:09.388423	\N	\N	318	\N	\N	\N
d0a6976d-ecd6-424c-9b06-b829ba396402	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:45:39.390172	\N	\N	348	\N	\N	\N
cafd3135-4185-4a47-af35-7fd2eb713d49	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:46:09.592383	\N	\N	378	\N	\N	\N
17249085-5375-4f3d-9162-8701169fc5d0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:46:39.593344	\N	\N	408	\N	\N	\N
4708fe55-9a1e-4ddb-acf9-a222d4da551d	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:47:13.455286	\N	\N	50	\N	\N	\N
e38b3933-4a8f-4bb2-8a1e-faa0940cbf3a	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:47:43.455275	\N	\N	80	\N	\N	\N
6df0ef83-5cae-429c-83ad-274d93cca703	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:47:48.601675	\N	\N	477	\N	\N	\N
90c864c0-5268-4f99-b4e5-f1fb7d525cc4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:48:48.591652	\N	\N	537	\N	\N	\N
a9b01fa4-81e1-455f-b681-512bd4b46947	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:48:49.57084	\N	\N	36	\N	\N	\N
e6ea3915-6515-4af5-bf97-902e8432586b	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:49:19.565255	\N	\N	66	\N	\N	\N
d498a2a0-a9e5-47d7-8dc0-2739fe668563	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:49:48.596389	\N	\N	597	\N	\N	\N
5988ff35-141d-436a-a6ee-30421d1987cc	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:49:49.569482	\N	\N	96	\N	\N	\N
52cdc57b-7334-41d8-bab8-ff9c812acf28	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:50:45.3497	\N	\N	32	\N	\N	\N
d5852159-02ac-4a37-a1c2-1124e285600b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:50:48.605027	\N	\N	657	\N	\N	\N
2ec45417-175b-455c-90bd-6460553706b8	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:51:15.351688	\N	\N	62	\N	\N	\N
31041beb-d7ce-46a4-880a-ed9bd6ae09d0	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:51:45.35093	\N	\N	92	\N	\N	\N
818e9bc8-236c-45f8-8b7c-c9f95fc4df82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:51:48.597776	\N	\N	717	\N	\N	\N
c79559da-8516-4afa-9320-eaed78bc9fa3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:52:11.131486	\N	\N	740	\N	\N	\N
08d70d68-9e5a-41c4-9134-df71154b5bdc	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:52:15.349062	\N	\N	122	\N	\N	\N
cc019c56-20a5-4451-b843-fe5464fa50f4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:52:39.386679	\N	\N	768	\N	\N	\N
4f3da498-5c81-4e4e-b7fb-b82e71e73739	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:52:45.349446	\N	\N	152	\N	\N	\N
b3f603f4-6037-4637-846a-4144dcb0b995	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:53:09.384291	\N	\N	798	\N	\N	\N
d1d5edc9-bee9-4741-99e9-956abf0d5634	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:53:15.351196	\N	\N	182	\N	\N	\N
4cc9481e-acb4-42a4-9bd8-c799500b41d7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:53:39.381055	\N	\N	828	\N	\N	\N
db731efe-a1ea-48d0-b136-f063623e07fc	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:53:45.353016	\N	\N	212	\N	\N	\N
9efd3019-5104-4dec-9132-ffb1466f9116	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:54:09.391175	\N	\N	858	\N	\N	\N
9538b757-5ad3-4434-819a-935471869e65	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:54:15.348395	\N	\N	242	\N	\N	\N
1c4a954d-bba8-41ef-be4c-0d5c2edc1003	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:54:39.384414	\N	\N	888	\N	\N	\N
936380d5-5889-4a7f-b1c2-12eeb6fad0ca	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:54:45.355873	\N	\N	272	\N	\N	\N
d6f3442a-2152-4cca-b9c2-7b7e306ac03c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:55:09.3847	\N	\N	918	\N	\N	\N
36fe99f3-dce1-48ed-ab4f-508efc0f7bdf	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:55:37.237165	\N	\N	32	\N	\N	\N
1b5029b3-7873-4516-bf17-9d6f741aabf7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:55:39.591016	\N	\N	948	\N	\N	\N
ebe431c3-26e6-4750-a93e-24977c03a6e9	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:56:07.229876	\N	\N	62	\N	\N	\N
14ae0ef7-98c7-4e0f-96c8-e6a1f509829f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:56:09.589286	\N	\N	978	\N	\N	\N
106746d6-31c2-4663-8088-dc4cd81ace27	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:56:37.233074	\N	\N	92	\N	\N	\N
cf1118fe-cd17-4fb6-9b2e-1b44f1bdafc7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:56:48.600985	\N	\N	1017	\N	\N	\N
9cb2c9d8-1395-4033-90e5-13d53bbaa65e	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 20:57:07.249202	\N	\N	122	\N	\N	\N
b6a337dc-65a1-4e1f-b114-f1d81fff9fb7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:57:48.61123	\N	\N	1077	\N	\N	\N
de7732c6-2e6c-42c8-85bb-868b1a44828f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:58:48.593154	\N	\N	1137	\N	\N	\N
532396fc-4f4c-4999-8664-c686d192dc78	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 20:59:48.642209	\N	\N	1197	\N	\N	\N
b0912a2a-fff9-4d25-9136-fa4cd8f9ef0f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:00:48.598783	\N	\N	1257	\N	\N	\N
f7a0f54b-6590-4369-a7c0-97b4d96c8410	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:01:48.601176	\N	\N	1317	\N	\N	\N
159c3b1e-bf6d-416f-96fe-e727e4bda77e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:02:48.605485	\N	\N	1377	\N	\N	\N
dc04dbca-b85a-4f02-a2e5-e641588a9e07	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:03:48.603072	\N	\N	1437	\N	\N	\N
e54c20b4-17ae-404b-87a3-f3722ea9d2c8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:04:48.610019	\N	\N	1497	\N	\N	\N
5c575c42-8872-478c-884c-16a4539533d5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:05:48.632583	\N	\N	1557	\N	\N	\N
2805b148-e15e-4988-b363-dd933e1ce2b0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:06:48.605849	\N	\N	1617	\N	\N	\N
cbff6db1-39d2-45f6-9fa4-a71bda2ebc03	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:07:48.951516	\N	\N	1677	\N	\N	\N
b6db5d23-34ee-4252-bd17-29090d8fbdf7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:08:48.613648	\N	\N	1737	\N	\N	\N
d6c0bc68-f2c0-46e3-befe-9649ad90bfbb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:09:48.603162	\N	\N	1797	\N	\N	\N
c8715f47-bfb6-47e6-a7a9-6fabeee3489d	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:10:00.924303	\N	\N	422	\N	\N	\N
0bd48ce6-816e-495a-be5b-cf16a98fbe10	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:10:35.019209	\N	\N	32	\N	\N	\N
2e7dcf4b-4a83-445e-b7ff-fab6fb50ed4b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:10:48.597348	\N	\N	1857	\N	\N	\N
62161517-1708-4378-9373-025d7df68173	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:11:43.650444	\N	\N	101	\N	\N	\N
26d5e60d-61f6-46ab-b28a-3fb4bc2f5c97	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:11:48.602164	\N	\N	1917	\N	\N	\N
4f4dd1b7-accf-40b8-991a-efb3e55cd2c1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:12:48.606726	\N	\N	1977	\N	\N	\N
8a7ba28a-3a2a-41b5-8feb-822a691765a5	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:13:17.48862	\N	\N	32	\N	\N	\N
c1e046fe-4631-40d4-b6fc-631245889762	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:13:48.613077	\N	\N	2037	\N	\N	\N
89f8a792-9b40-4465-8e20-1afeafa11365	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:14:04.161444	\N	\N	65	\N	\N	\N
1371f870-9a4d-4bef-9a5e-0c0bbb67d577	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:14:48.60495	\N	\N	2097	\N	\N	\N
ca90f7cc-3430-4ec1-b454-eea2c98de48f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:15:48.622511	\N	\N	2157	\N	\N	\N
1cdbd9cf-710f-4150-b3e9-771db7501fae	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:16:48.599327	\N	\N	2217	\N	\N	\N
8e6aeca2-f75a-4aee-864e-faa914c6b76e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:17:47.560279	\N	\N	2276	\N	\N	\N
8def141c-3450-41bb-9371-3ea12627dd77	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:18:20.6011	\N	\N	32	\N	\N	\N
f3e6119c-80f5-45d5-a752-d6cdf4d10bea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:18:50.597086	\N	\N	62	\N	\N	\N
7636a1c7-6597-484f-9c0a-23f658511813	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:19:02.55293	\N	\N	44	\N	\N	\N
389afe72-0ac3-4822-b2ab-ce33cdf64334	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:19:20.60424	\N	\N	92	\N	\N	\N
5e699079-89bf-4b0d-aedb-3a7b47ce0247	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:19:32.554433	\N	\N	74	\N	\N	\N
4382f70a-2b55-4709-a691-864b2cbf2cbf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:19:50.60241	\N	\N	122	\N	\N	\N
9be1929c-a761-45ac-9646-0f724a4efcd4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:20:20.604955	\N	\N	152	\N	\N	\N
dd6a305f-6201-4548-ae85-a99eccb79512	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:20:50.602883	\N	\N	182	\N	\N	\N
2f7dec39-a896-4069-9402-63ed3436ce78	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:21:48.617473	\N	\N	240	\N	\N	\N
8ded3b65-12dd-457e-b92f-079ebd5cd547	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:22:48.608131	\N	\N	300	\N	\N	\N
2be32a7d-98fe-4c71-b9fd-32e8a4680b4f	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:23:13.176829	\N	\N	126	\N	\N	\N
57c0c27f-7f3e-43b6-9140-4ae4664a6f48	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:23:48.602411	\N	\N	360	\N	\N	\N
2c3c4c0c-5e25-41ed-b2bc-319fbdf8e5c0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:24:48.606406	\N	\N	420	\N	\N	\N
2ae1d4b2-e83a-486c-aac5-980c60fd3395	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:25:48.612252	\N	\N	480	\N	\N	\N
70f16b34-d839-45cf-b4fa-cb6a4b4f3f3d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:26:48.596303	\N	\N	540	\N	\N	\N
df9229ed-3d87-4b16-a7b7-5fe64503723f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:27:48.639866	\N	\N	600	\N	\N	\N
b7a7f5bc-8dea-4715-aab1-316e74501570	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:28:48.62615	\N	\N	660	\N	\N	\N
52199c9e-7d82-415e-aac1-a394ce10a9b4	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:29:41.567005	\N	\N	32	\N	\N	\N
3fa92b78-7f08-403c-a51a-ec9f96f8f8aa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:29:48.603996	\N	\N	720	\N	\N	\N
0f65207a-fa49-4150-8038-946daaac94aa	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:30:11.578144	\N	\N	62	\N	\N	\N
0613bfe4-9bf6-456d-b89f-f4a4b3ea9e51	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:30:48.604662	\N	\N	780	\N	\N	\N
48ca49a0-af52-4ab8-af96-bc970a902ee4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:31:48.605096	\N	\N	840	\N	\N	\N
19e901a3-ea09-4c5c-b6c9-61469c489b2b	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:32:08.655189	\N	\N	32	\N	\N	\N
38bc5bd3-61fb-4818-8f17-bf4145c7ffc9	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:32:38.653932	\N	\N	62	\N	\N	\N
dc56657b-f610-4143-968a-ef0c6bf690fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:32:48.612363	\N	\N	900	\N	\N	\N
520c8b60-02d2-4ede-af7a-cea5b93064b7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:33:48.6069	\N	\N	960	\N	\N	\N
9130ca62-5a4f-4641-88cc-ed41c75fc829	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:34:48.62015	\N	\N	1020	\N	\N	\N
02560a25-e584-4ae9-969e-ce4578361b1e	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:35:18.440998	\N	\N	47	\N	\N	\N
389e6b53-f6a5-4ffd-b9a7-3774b67f4dba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:35:48.599827	\N	\N	1080	\N	\N	\N
9ca3f031-3656-47c3-89f6-070a3da3d16c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:36:46.942397	\N	\N	1138	\N	\N	\N
69489b97-252f-41c8-a1ba-f32ea1803899	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:37:19.711276	\N	\N	32	\N	\N	\N
35101c78-2014-4ae6-b6bc-858da5bda232	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:37:49.716648	\N	\N	62	\N	\N	\N
18135200-bb9b-409f-bc89-548e05b59dea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:38:19.719536	\N	\N	92	\N	\N	\N
7e6170d6-8471-45ce-addc-e574bc188bfc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:38:49.71446	\N	\N	122	\N	\N	\N
cc1243d6-2398-4418-93ec-4c2c00b68157	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:39:19.718478	\N	\N	152	\N	\N	\N
c3d00d19-ea4e-41da-a6f7-0096db62eb56	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:39:49.727016	\N	\N	182	\N	\N	\N
f9f00f5f-1124-4cbc-9097-ce21aed69018	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:40:19.726956	\N	\N	212	\N	\N	\N
8d4a54d4-cd99-4283-9015-54d004fbb2e7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:40:49.715337	\N	\N	242	\N	\N	\N
cec76f6c-70ae-49e7-8604-09a20b804247	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:41:19.723442	\N	\N	272	\N	\N	\N
6a296b91-008f-4fea-a7a0-e8e1e22643fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:41:49.723344	\N	\N	302	\N	\N	\N
ca1b49e3-407d-4c10-852f-eb0c40762926	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:42:19.710665	\N	\N	332	\N	\N	\N
ba80ca90-24ec-4a08-9a50-525d89840538	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:42:49.719024	\N	\N	362	\N	\N	\N
84d1a15c-fab0-4345-8d18-439d5c2c0c4b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:43:19.712177	\N	\N	392	\N	\N	\N
0a3a5697-9779-4566-953a-f7e4aba5a22f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:43:49.717006	\N	\N	422	\N	\N	\N
55f21650-7c3e-40fe-be4c-292f9ee5c1a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:44:19.715415	\N	\N	452	\N	\N	\N
17dc8c65-3ecb-4c5f-97b6-bae69f7ce456	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:44:49.730141	\N	\N	482	\N	\N	\N
19179b66-10c6-4b7f-a8dc-2705b408c498	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:45:19.734268	\N	\N	512	\N	\N	\N
47b42002-d474-49c4-94f7-8b50c21d4adc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:45:50.605034	\N	\N	543	\N	\N	\N
21bbae8f-2898-44e7-98ef-8bccb088c1a4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:46:20.610261	\N	\N	573	\N	\N	\N
a0bc1822-c772-4572-bb6c-0b2672721663	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:47:30.897283	\N	\N	643	\N	\N	\N
ca2b2875-6c87-4a24-9053-0dd21bac5aa8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:47:49.720781	\N	\N	662	\N	\N	\N
316d9b51-f42a-4964-a49c-282cc295a476	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:48:20.604393	\N	\N	693	\N	\N	\N
3b114ac6-04e3-4578-90d6-3da552346efc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:48:49.71942	\N	\N	722	\N	\N	\N
aacc20c9-33b4-4afa-9cf8-27efd4c13107	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:49:20.608971	\N	\N	753	\N	\N	\N
f983298d-cdd1-4b46-bfc4-b931b1614a19	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:49:50.610804	\N	\N	783	\N	\N	\N
31247dd4-7ce9-49ad-a2ca-3fe9c7075422	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:50:48.612903	\N	\N	841	\N	\N	\N
89386658-aaae-4b19-837d-e33640ddb57e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:51:48.612624	\N	\N	901	\N	\N	\N
fd1c3207-b8aa-42a4-bf2c-d004dcb9a783	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:52:48.616127	\N	\N	961	\N	\N	\N
7bc9b89f-6419-4efb-bf28-977a73389607	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:53:48.61981	\N	\N	1021	\N	\N	\N
4549e89c-5d93-488f-98d5-3191f843c549	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:54:48.634349	\N	\N	1081	\N	\N	\N
c1cbd1ea-03fd-42f2-9a27-b28665e20707	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:55:32.710484	\N	\N	355	\N	\N	\N
009f9314-4cdb-4086-91ff-fa5eb4bf8247	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:55:48.625404	\N	\N	1141	\N	\N	\N
cb0c30b2-3186-4add-bae1-5e2d4405ea2b	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 21:56:06.707064	\N	\N	32	\N	\N	\N
2adb5ad1-8aaf-4af6-90bc-149a81e9bca3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:56:48.624474	\N	\N	1201	\N	\N	\N
653c1d91-2317-48ba-aaa7-04c7b525813c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:57:48.621296	\N	\N	1261	\N	\N	\N
e5f813a0-5631-44cf-994a-b50e5b996fbb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:58:48.618521	\N	\N	1321	\N	\N	\N
cedf6b5c-01b1-4bfd-964d-3ea79986e019	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 21:59:48.625928	\N	\N	1381	\N	\N	\N
894bfae2-3b08-4657-b66b-0e00cbffc482	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:00:45.473893	\N	\N	127	\N	\N	\N
3c750191-d965-4456-85f6-d5e77ed1777f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:00:48.61533	\N	\N	1441	\N	\N	\N
62a3d63f-8e6c-44ff-acf0-38ff4778a8be	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:01:19.748382	\N	\N	32	\N	\N	\N
358c1723-74f2-47ad-9691-18d4921da6f2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:01:48.611484	\N	\N	1501	\N	\N	\N
bb542173-9d5b-4df1-81d4-d23b8bfb7845	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:01:49.746221	\N	\N	62	\N	\N	\N
00740d56-27b4-472a-b814-43fefb56338b	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:02:19.743831	\N	\N	92	\N	\N	\N
32b99f34-88b6-477c-aa9e-e193f504d961	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:02:48.633579	\N	\N	1561	\N	\N	\N
44aebefb-b073-4a4e-b737-bd197a88f607	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:02:58.880314	\N	\N	123	\N	\N	\N
44ea72c8-7830-4204-9939-78b37238b891	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:03:31.615244	\N	\N	32	\N	\N	\N
4b1a7e0a-9caa-41d4-8ce9-d57d12f9386f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:03:48.621552	\N	\N	1621	\N	\N	\N
f65b7e35-20e3-4bad-8292-eedefcc315bc	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:04:01.606076	\N	\N	62	\N	\N	\N
e600a15f-614f-4fbb-8602-1c7864732bcb	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:04:31.60576	\N	\N	92	\N	\N	\N
a5922eac-224c-48f7-8bd2-7e36677ffc4b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:04:35.301573	\N	\N	1667	\N	\N	\N
f5a0fa8f-7dad-4e74-953b-cb2bcb74171b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:05:08.604756	\N	\N	32	\N	\N	\N
32525598-a446-41aa-9a75-eef511ea6c84	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:05:38.623048	\N	\N	62	\N	\N	\N
37bc24a9-167d-47c0-b8bb-7e17437254ae	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:06:08.61922	\N	\N	92	\N	\N	\N
3bd0da3d-01e0-4b04-b5bb-a06bc4923450	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:06:38.639434	\N	\N	122	\N	\N	\N
f8de7297-a187-418d-adb2-96e8531b2387	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:07:08.973003	\N	\N	152	\N	\N	\N
7c5ae527-45be-4dde-8d9d-0d76100249e4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:07:38.638566	\N	\N	182	\N	\N	\N
3f80f5b5-83d3-42ad-ba0e-92566cdf3dbb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:08:48.895192	\N	\N	252	\N	\N	\N
db982a54-572c-47d1-b434-f5372789a2d6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:09:48.648355	\N	\N	312	\N	\N	\N
0a6e4852-5d21-4bb2-a19c-b372e93332fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:10:48.643431	\N	\N	372	\N	\N	\N
c20cd2d0-04fa-45a9-9ca9-c1f077b4a321	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:11:48.638217	\N	\N	432	\N	\N	\N
4933cf30-ec09-4e35-b69e-7ba1af70e7bf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:12:48.641301	\N	\N	492	\N	\N	\N
1756c179-950e-4476-b581-46744f6dd243	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:13:48.646142	\N	\N	552	\N	\N	\N
cd0960d2-95d0-4657-908e-fbc520e04c09	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:14:48.642051	\N	\N	612	\N	\N	\N
2f036955-a049-4cf1-8db9-50ef93f2a0bc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:15:48.640503	\N	\N	672	\N	\N	\N
4671c207-a18b-4e8e-95fe-d33450c99745	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:16:48.647199	\N	\N	732	\N	\N	\N
032206f0-85a8-4ec4-8abe-ce9e8f192dfa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:17:48.641686	\N	\N	792	\N	\N	\N
2659ab4a-30c1-4c9d-b886-29e48d8755f2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:18:48.647209	\N	\N	852	\N	\N	\N
d328829e-8ed7-485f-9d88-f4733dd081df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:19:48.6363	\N	\N	912	\N	\N	\N
dabb9845-cf5e-484b-ab87-6fa78c749dbb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:20:48.64867	\N	\N	972	\N	\N	\N
cccd07f2-0a2b-4336-860f-457247910bd9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:21:48.645707	\N	\N	1032	\N	\N	\N
18cb1ed1-fe45-4d15-b946-5f2c3574c49b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:22:48.644542	\N	\N	1092	\N	\N	\N
ab2fdcba-1cdd-4f60-b5a9-d50e71e95465	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:23:48.646242	\N	\N	1152	\N	\N	\N
6ae088de-f0fe-4afd-8c03-65daf0d583cb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:24:48.643793	\N	\N	1212	\N	\N	\N
461a5412-4ab5-4a41-852d-81c03a4527f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:25:48.649415	\N	\N	1272	\N	\N	\N
700acf34-88fd-447a-9350-f46917eeef24	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:26:48.64438	\N	\N	1332	\N	\N	\N
be59af0f-8c8f-4958-bcb1-4681c9f48ccb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:27:48.650657	\N	\N	1392	\N	\N	\N
8400c050-f7f5-4929-9e75-005e1eddd211	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:28:48.64422	\N	\N	1452	\N	\N	\N
cc9be248-8029-4eec-be4b-6eea62d35957	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:29:48.649309	\N	\N	1512	\N	\N	\N
6412c06d-ff0b-4093-9061-857a11bf5d37	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:30:48.662695	\N	\N	1572	\N	\N	\N
3c83916a-5f11-41e2-b5b2-af059dae0473	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:31:48.645733	\N	\N	1632	\N	\N	\N
6f60d9ff-ce58-4f32-af63-a77667cf35a8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:32:48.651954	\N	\N	1692	\N	\N	\N
6fa0132b-11b1-422c-89e7-bc3a8e0d0ee2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:33:49.012696	\N	\N	1752	\N	\N	\N
2d5f0c22-7c24-4a3e-a341-ac2709f1c081	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:34:48.651082	\N	\N	1812	\N	\N	\N
dcdf49ad-8f34-41d0-b009-6ccfab6a6c3b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:35:48.669828	\N	\N	1872	\N	\N	\N
8729d862-6b3e-4cdc-bf52-63cd37f0e389	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:36:48.653838	\N	\N	1932	\N	\N	\N
77315b26-7362-49e6-9d62-5146cce70168	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:37:48.99341	\N	\N	1992	\N	\N	\N
84207854-ee2e-476f-9baa-14d0f13f40fd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:38:48.651752	\N	\N	2052	\N	\N	\N
12b366fa-4d83-4cff-9037-c6d7e082792c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:39:48.653899	\N	\N	2112	\N	\N	\N
9d5e7810-0671-47b2-8c16-ee5e704ff2b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:40:48.651453	\N	\N	2172	\N	\N	\N
d56cf030-c3fd-4915-9059-ce93eefeef11	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:41:48.665946	\N	\N	2232	\N	\N	\N
85345848-923c-4875-a524-500523118cd0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:42:48.649846	\N	\N	2292	\N	\N	\N
126adbb6-2552-4bfc-9d14-34a6e3b15d7d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:43:48.672692	\N	\N	2352	\N	\N	\N
fba35ce8-e355-4d37-9157-7fafe4b57999	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:44:48.660713	\N	\N	2412	\N	\N	\N
37d7bbb4-23a8-4aba-b459-bcad61a778c8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:45:48.658555	\N	\N	2472	\N	\N	\N
1e266381-4d80-4b95-8216-d9ff96b81252	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:46:48.971311	\N	\N	2532	\N	\N	\N
be6928b1-2ecc-4110-834e-44366675d200	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:47:48.655527	\N	\N	2592	\N	\N	\N
21c75f08-390f-4d59-88d5-29cd861f2952	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:48:48.651204	\N	\N	2652	\N	\N	\N
f3730311-2f3b-483d-b11c-e079bf140408	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:49:48.662084	\N	\N	2712	\N	\N	\N
d92748a8-3d43-4b9a-b5c2-30fe649f9538	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:50:48.657698	\N	\N	2772	\N	\N	\N
adae17c2-00c0-4ebc-9ff8-faadd0dcddc7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:51:42.803804	\N	\N	2826	\N	\N	\N
348e0687-78bd-4e14-b2fe-fcdec9642eba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:52:25.86602	\N	\N	32	\N	\N	\N
062173be-5f15-4d79-af61-89f7f82bfeb1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:53:26.64272	\N	\N	93	\N	\N	\N
0e658a9a-ebda-4e5f-950d-36291b6d9187	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:53:56.621723	\N	\N	123	\N	\N	\N
949d33d4-7f42-46dc-bcba-b5210a730e91	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:54:26.637987	\N	\N	153	\N	\N	\N
01a754f5-fbc9-4c80-ab7d-e03f8f41f20b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:54:56.623475	\N	\N	183	\N	\N	\N
667ba099-9141-470e-8755-ea0096895984	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:55:44.634871	\N	\N	32	\N	\N	\N
3832e563-9e47-4e93-9862-998cb54948ed	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:56:15.622432	\N	\N	63	\N	\N	\N
b964cfc1-5360-41a6-996f-ed67ec34498d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:56:45.627665	\N	\N	93	\N	\N	\N
bd6c6228-515c-46fb-8eb6-87919237a50e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:57:15.622535	\N	\N	123	\N	\N	\N
6e7ad4d3-aa64-429d-b179-42537047f06a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:57:45.632182	\N	\N	153	\N	\N	\N
796239eb-1858-4fe0-895c-e6cb753af21e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:58:15.646395	\N	\N	183	\N	\N	\N
6432ad1c-87d9-4848-9160-a6bc747d6b00	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:58:48.659778	\N	\N	216	\N	\N	\N
246c64de-3305-437f-920e-7243302d6611	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 22:59:48.648154	\N	\N	276	\N	\N	\N
edf6fd10-b862-4011-ac1d-cf6de9a12ccb	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-21 22:59:53.051554	\N	\N	864	\N	\N	\N
b0e2db10-b840-4f2a-b512-bb3e90663802	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:00:50.818174	\N	\N	336	\N	\N	\N
ce6b3dc8-43f7-4b80-887f-014a335cf820	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:01:48.629682	\N	\N	396	\N	\N	\N
a739b6c9-2960-4992-8cb7-22efd032dc0d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:02:48.641011	\N	\N	456	\N	\N	\N
f334f543-aa59-419f-a93b-c8baa24d49a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:03:48.668046	\N	\N	516	\N	\N	\N
2807278b-1468-4bf7-9f38-3b45becea01d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:04:48.673408	\N	\N	576	\N	\N	\N
2c62aab7-739c-40ce-9afe-5516c9da569b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:05:27.62622	\N	\N	32	\N	\N	\N
547b4aea-66e3-4b02-84db-4cefa1abed4d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:05:57.639799	\N	\N	62	\N	\N	\N
99d99d6e-24d3-4ed1-a5c1-1f7ef93ec731	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:06:27.624527	\N	\N	92	\N	\N	\N
b36f354f-0e45-40f0-956e-a5243e2fa2eb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:06:57.626467	\N	\N	122	\N	\N	\N
b694da75-4521-4662-9674-b4b2da96b6a0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:07:28.004912	\N	\N	152	\N	\N	\N
dc74be43-bdbf-47f4-a90f-3993f3f53805	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:07:57.630717	\N	\N	182	\N	\N	\N
e8dbd9bb-a62a-42f2-ae5d-bb029532bd6f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:08:27.634497	\N	\N	212	\N	\N	\N
f03e1c5b-42f9-4eef-ac40-3e144633091a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:08:57.635801	\N	\N	242	\N	\N	\N
b0763eed-07e5-4810-a89f-7c13ed5d077a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:09:48.660948	\N	\N	293	\N	\N	\N
2726b75e-5b1b-400c-b2c4-434c2169805b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:10:48.664583	\N	\N	353	\N	\N	\N
78408960-c287-4f98-9e93-da32d288c35c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:11:25.90473	\N	\N	390	\N	\N	\N
20de3d78-cf23-45c8-b2f7-75b3ae11d507	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:11:27.632151	\N	\N	392	\N	\N	\N
90098578-00ce-4645-a619-1dace0b0bc9d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:11:57.629651	\N	\N	422	\N	\N	\N
4424b57d-50c1-4748-8dc4-39963eee4b4f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:12:48.663095	\N	\N	473	\N	\N	\N
fec4466b-a016-47cd-8971-463acfd94182	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:13:48.646184	\N	\N	533	\N	\N	\N
c8f8464d-af32-448f-aea0-bf80e2895afe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:14:48.630108	\N	\N	593	\N	\N	\N
936b0487-cf15-411a-b5ee-10fb6be10eda	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:15:48.639001	\N	\N	653	\N	\N	\N
8c2a14a6-d48b-4844-af93-e3681270722d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:16:48.639497	\N	\N	713	\N	\N	\N
9d07c7fb-a776-41a8-a384-7b102b9034ad	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:17:48.641077	\N	\N	773	\N	\N	\N
dbf2a203-c6aa-4eaf-8934-5fba7995ad2e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:18:33.179574	\N	\N	818	\N	\N	\N
83f4db4e-e94e-4062-8104-d71d281f20c6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:19:05.841327	\N	\N	32	\N	\N	\N
53ae21da-4188-41b6-8a47-6a26a9763e85	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:19:36.630418	\N	\N	62	\N	\N	\N
97abc5f1-5449-4458-9559-35368b2f59b6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:20:06.632051	\N	\N	92	\N	\N	\N
7ac890c6-7425-462f-adac-89ee07c8c7c4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:20:36.636377	\N	\N	122	\N	\N	\N
7fca7ca1-68ea-455c-97a5-66a5c2c0aff3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:21:06.653804	\N	\N	152	\N	\N	\N
4b23f34e-6aea-4f88-9abc-79c803af1e38	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:21:36.649617	\N	\N	182	\N	\N	\N
fdb1af4f-cb4f-4021-9561-f19e4eb32128	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:22:48.665517	\N	\N	254	\N	\N	\N
3ab99a73-c8be-4b39-a879-df86cdbc60f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:23:48.660374	\N	\N	314	\N	\N	\N
5984b2a4-10b7-446c-b15f-a0c682ef622b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:24:24.99335	\N	\N	351	\N	\N	\N
9ba8ccd1-2f87-4dbc-bef3-ffa730c6acf6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:24:36.636397	\N	\N	362	\N	\N	\N
76f0bd6d-bf5c-402f-a273-8b117990f832	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:25:06.639203	\N	\N	392	\N	\N	\N
1c22ddc8-4c1e-431c-b3fe-ce0726db5282	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:25:36.63369	\N	\N	422	\N	\N	\N
0640caa7-dfc0-40cd-a576-e69f3dbf8f93	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:26:05.842555	\N	\N	452	\N	\N	\N
d40a576e-8035-4148-ab21-010c06c82afc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:26:36.631415	\N	\N	482	\N	\N	\N
b9320ee2-2676-48d6-a309-f573abba6955	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:27:06.632201	\N	\N	512	\N	\N	\N
2db0d118-5c79-4c98-8c0b-9a94ff10df87	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:27:48.989396	\N	\N	554	\N	\N	\N
aacb1cce-86aa-44b4-9362-a11ea9965bb1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:28:05.836991	\N	\N	572	\N	\N	\N
0ddd7066-f633-4492-bb9e-dcf9050a5082	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:28:38.123823	\N	\N	32	\N	\N	\N
6fcd989b-fad1-42eb-a2f7-89dfb3e39526	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:29:08.146053	\N	\N	62	\N	\N	\N
8e72a2cc-321c-40e6-8af0-55285fe76b76	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:30:05.651618	\N	\N	35	\N	\N	\N
718ed5d3-863f-4cc3-850d-9a5eb551a2c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:31:01.977032	\N	\N	31	\N	\N	\N
cab316ab-63b2-4569-80cc-650bdd936a81	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:31:32.634492	\N	\N	62	\N	\N	\N
f9fe1fa5-d773-46d8-ad86-638bb84ba763	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:32:29.63708	\N	\N	32	\N	\N	\N
39acff05-df4a-451a-ad6f-b52ea9f401e0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:32:59.636761	\N	\N	62	\N	\N	\N
7d4515f5-7558-45b8-8e20-df1b9370a75f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:33:29.654413	\N	\N	92	\N	\N	\N
f1a4311a-af15-4c94-ab5f-666cdf740f8f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:33:59.639304	\N	\N	122	\N	\N	\N
0f610022-f278-4b74-b12e-1d86a0950877	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:34:59.726821	\N	\N	182	\N	\N	\N
5abefa31-eb52-4d5e-b5ad-de16c2b787b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:35:48.671027	\N	\N	231	\N	\N	\N
3bb94d6f-4554-4939-8700-b294f26bfda8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:36:22.777684	\N	\N	32	\N	\N	\N
4894b251-cf77-41d7-956a-e04ee67d49fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:36:52.777817	\N	\N	62	\N	\N	\N
83adff5f-0d33-4d72-a680-20eea7dfe83f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:37:22.781602	\N	\N	92	\N	\N	\N
1d4389d0-2f41-4ce1-a297-0f0023cf37c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:37:52.766204	\N	\N	122	\N	\N	\N
03c250c9-52d1-4d90-a3a6-054c61fc7908	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:38:22.770694	\N	\N	152	\N	\N	\N
e950177d-aad8-4aae-824e-c87e3a73db62	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:38:52.773042	\N	\N	182	\N	\N	\N
3c90233f-394b-4261-b49f-5392429922a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:39:22.773428	\N	\N	212	\N	\N	\N
1c516cc1-8f9b-46b4-819a-04570efea1c9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:39:52.770084	\N	\N	242	\N	\N	\N
c6f98901-cfd6-4163-b46c-7726c41f3d62	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:40:22.787159	\N	\N	272	\N	\N	\N
679a10fb-09ef-40f0-ae4f-c59cd0fd6d19	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:40:52.777466	\N	\N	302	\N	\N	\N
c324ff41-f5c7-4917-b244-01d0e3141150	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:41:22.767139	\N	\N	332	\N	\N	\N
2bebbd37-72bb-4478-8222-0c32fca9dfdc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:41:52.767957	\N	\N	362	\N	\N	\N
1d457314-9625-4926-81ed-347249650c04	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:42:22.771124	\N	\N	392	\N	\N	\N
5ddf075f-e58a-4ba9-8e8b-8b0f0a83aa90	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:42:52.77177	\N	\N	422	\N	\N	\N
71adc339-6520-40f4-bc76-64c31ea109d0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:43:22.775311	\N	\N	452	\N	\N	\N
6fca843c-d65c-4b8f-a349-e0131c8fac4b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:43:52.787329	\N	\N	482	\N	\N	\N
97de4bc6-8d94-4057-a209-bf71fc172e65	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:44:22.783649	\N	\N	512	\N	\N	\N
a94f1ada-af08-40ba-b364-14b2bb454302	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:44:52.768439	\N	\N	542	\N	\N	\N
aef43b69-2e98-4aff-ba99-de4ae405956a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:45:22.775681	\N	\N	572	\N	\N	\N
b5b84d01-dcde-4eec-9b2f-045f2817ee04	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:45:52.771148	\N	\N	602	\N	\N	\N
906ff4eb-7f6e-45b9-9c21-fcf30cb2b739	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:46:22.773956	\N	\N	632	\N	\N	\N
e0dee721-b0e6-4106-a388-47857f48f391	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:46:52.770467	\N	\N	662	\N	\N	\N
ab1fb1db-675b-47fc-8751-ee5a2096da82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:47:22.78658	\N	\N	692	\N	\N	\N
277833ed-b57b-430c-96fe-aa2a7e3fe783	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:47:52.786914	\N	\N	722	\N	\N	\N
a5885998-b290-4408-bb96-f1c5ae627139	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:48:22.776524	\N	\N	752	\N	\N	\N
8158c374-7c5d-41e7-af01-880360d5151e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:48:52.778633	\N	\N	782	\N	\N	\N
baf3186c-c805-4ddd-a72e-44d92e996dec	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:49:22.774567	\N	\N	812	\N	\N	\N
b3903f95-7ac4-47b9-bedf-000dd90a15d6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:49:52.779876	\N	\N	842	\N	\N	\N
4510ac83-dc9f-429f-b560-262746e435f5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:50:22.77476	\N	\N	872	\N	\N	\N
2d869774-88ab-4cde-83a8-3f671c4f9fe7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:50:52.784494	\N	\N	902	\N	\N	\N
8178e4c4-6655-4024-8b84-a438e465fb11	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:51:22.784095	\N	\N	932	\N	\N	\N
46d0262d-eb63-4181-aa91-6a6f27c32720	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:51:52.773643	\N	\N	962	\N	\N	\N
d08a22d4-29f1-4b7b-8bb6-7b2f25c422b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:52:22.772732	\N	\N	992	\N	\N	\N
ada08527-acac-4322-ab94-1a939be60bf0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:52:52.776683	\N	\N	1022	\N	\N	\N
aefe5b8a-35d3-4d92-afd0-bbb74bd856c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:53:22.778148	\N	\N	1052	\N	\N	\N
f27f6a44-e8ed-499b-bd75-1929e1e1ae2a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:53:52.771389	\N	\N	1082	\N	\N	\N
5dad79b5-2aaf-4425-bccf-4ebe5d84defd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:54:22.791436	\N	\N	1112	\N	\N	\N
e91f4866-cbcf-42dc-a429-5eff6edb734c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:54:52.790675	\N	\N	1142	\N	\N	\N
93188040-489d-4f5c-9cea-db822281a186	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:55:22.773945	\N	\N	1172	\N	\N	\N
b4600a6f-a740-4bdf-96b6-abad39f60fa4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:55:52.778374	\N	\N	1202	\N	\N	\N
18eaf9e4-1a99-46c1-ad24-35160fa063cf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:56:22.792991	\N	\N	1232	\N	\N	\N
4a73b775-75fc-43ea-bd93-55db2a46eaa3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:56:52.779374	\N	\N	1262	\N	\N	\N
8e6ea351-c7ef-430c-b991-331ca4243f9e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-21 23:57:22.770524	\N	\N	1292	\N	\N	\N
2705ca3f-4e40-4d34-8161-063206f0139d	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-22 00:03:25.829445	\N	\N	2151	\N	\N	\N
846cfef5-6c69-433b-b2a8-1dcbdbbf8349	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-22 00:03:59.123136	\N	\N	32	\N	\N	\N
b351333a-306a-45e1-8d09-fb87271e1738	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-22 00:14:06.508292	\N	\N	170	\N	\N	\N
c768b9d8-7b2e-4175-959e-c623aa85d596	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-22 01:58:44.382152	\N	\N	121	\N	\N	\N
0d1ffe11-d309-4b01-87e1-ac671210f856	34d45319-4e22-441f-867e-542c8122bb7b	2026-02-22 01:59:13.916002	\N	\N	151	\N	\N	\N
9b785018-baa8-4f83-bd97-75a214cf12d4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:31:02.352349	\N	\N	32	\N	\N	\N
266304dc-67fd-47f3-8454-ad0c8d6f87b1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:31:32.343145	\N	\N	62	\N	\N	\N
1c9e36a7-1c8e-40e6-b70e-d0220645e6d2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:32:02.342951	\N	\N	92	\N	\N	\N
2390112a-7b9f-443f-a601-e48aa9776102	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:33:02.32395	\N	\N	152	\N	\N	\N
157f5c3a-f02b-4383-9c20-3260e58336b0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:33:32.317215	\N	\N	182	\N	\N	\N
bb84c037-109a-4a30-8082-5e5d61224ff3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:34:02.330053	\N	\N	212	\N	\N	\N
56742c70-f3bc-4eb6-aa84-35170b28154e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:35:32.33811	\N	\N	302	\N	\N	\N
858e5d2a-ca60-49ff-a827-6cd63f0273e2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:37:02.811296	\N	\N	392	\N	\N	\N
ea7cebb6-4f59-4066-ba12-9e1287458ba7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:32:32.328675	\N	\N	122	\N	\N	\N
4df9901b-7d8a-4295-bdef-9877dd99a9a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:34:32.326251	\N	\N	242	\N	\N	\N
002c6223-ae32-461a-9e63-fcb7e5dcf70c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:35:02.341964	\N	\N	272	\N	\N	\N
48e40150-bbfa-4d69-953e-3b8e9de215da	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:36:02.342759	\N	\N	332	\N	\N	\N
83b51267-d68b-463f-a965-3674be0e2954	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:36:32.809986	\N	\N	362	\N	\N	\N
b46db0d0-f662-4100-9913-28ef7cc327d3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:37:51.819018	\N	\N	441	\N	\N	\N
90c734a6-fbd0-4d2d-93d0-bda9c4aa918b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:38:51.845987	\N	\N	501	\N	\N	\N
d3f67261-0319-4e20-a547-fb8f2c7ed059	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:39:51.852385	\N	\N	561	\N	\N	\N
067f379e-c5e8-4a70-9e68-2107e173c28e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:40:52.233543	\N	\N	621	\N	\N	\N
33a63c94-0dcb-49d3-b73f-b837c7acf998	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:41:51.849054	\N	\N	681	\N	\N	\N
a9f2adb9-f765-419f-8b3c-c9661733cdf7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:42:51.872093	\N	\N	741	\N	\N	\N
b94ffcaa-0c2c-459a-ab1a-a42d08b1f471	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:43:51.858267	\N	\N	801	\N	\N	\N
e9038b3b-7730-42c6-ab60-2d779eac3224	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:44:51.863076	\N	\N	861	\N	\N	\N
57e33058-fb07-415f-9aa6-ab063a78ac44	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:45:51.850563	\N	\N	921	\N	\N	\N
cf0ae83c-10a4-4291-83c0-fc4705e4bae4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:46:51.868957	\N	\N	981	\N	\N	\N
f49d10cb-38e4-4408-b5de-f8936f11d9e1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:47:51.863323	\N	\N	1041	\N	\N	\N
ca083b34-a328-45fb-8e6e-bf550bca7e12	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:48:51.861946	\N	\N	1101	\N	\N	\N
ff3b1772-a292-4c2e-8334-f62a74ba1955	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:49:51.858665	\N	\N	1161	\N	\N	\N
6328e5f2-2575-4b8c-bd38-b699ff0f8131	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:50:51.851735	\N	\N	1221	\N	\N	\N
a693d90d-797a-49fd-a232-83b29375ec19	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:51:51.875481	\N	\N	1281	\N	\N	\N
8fd59fa8-fe9d-44f7-bfc5-530811e04d6f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:52:51.853975	\N	\N	1341	\N	\N	\N
23169c32-140f-4b63-b42a-bb68a4753d29	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:53:51.844076	\N	\N	1401	\N	\N	\N
69f3fd51-e3e4-4c99-b11c-a4b1e686f8cd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:54:51.855043	\N	\N	1461	\N	\N	\N
ea64b248-9724-48ad-a531-e41281a1f6e5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:55:51.865584	\N	\N	1521	\N	\N	\N
e53d51b1-34e9-493a-9a9f-3f4404781573	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:56:51.857274	\N	\N	1581	\N	\N	\N
1c9e20e2-27e2-4b12-82b4-50543a60e27b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:57:51.848412	\N	\N	1641	\N	\N	\N
44a44735-f3bc-4361-830f-7cf2baddc153	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:58:51.856994	\N	\N	1701	\N	\N	\N
92eb9795-f9d7-4b3c-b0e1-b4742d05ecc6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 20:59:51.897059	\N	\N	1761	\N	\N	\N
10ca9e9a-3726-44f2-865f-988a0ac17dac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:00:51.899021	\N	\N	1821	\N	\N	\N
bfb06b82-da93-4081-be07-3416809b8ed6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:01:51.858912	\N	\N	1881	\N	\N	\N
d9170727-bf6d-4e4b-8870-ac1f5a03948d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:02:51.859561	\N	\N	1941	\N	\N	\N
400053c0-0b54-4731-b58d-641c475850f1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:03:51.852261	\N	\N	2001	\N	\N	\N
7a393817-98b5-4f1f-af61-4107ae61fc31	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:04:51.855165	\N	\N	2061	\N	\N	\N
8cbd67c6-bfbf-4447-b691-4107c84b282d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:05:51.856342	\N	\N	2121	\N	\N	\N
e34a6347-fa90-4ae8-9236-48e4b817d66b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:06:51.864817	\N	\N	2181	\N	\N	\N
76a1a5b3-5575-40a1-bec2-387bd03b63f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:07:51.873053	\N	\N	2241	\N	\N	\N
f620c7c4-28d0-431f-b098-186f58d25efa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:08:51.870661	\N	\N	2301	\N	\N	\N
23091168-b5cd-4e2f-a0b5-396be1d7a180	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:09:51.85561	\N	\N	2361	\N	\N	\N
a22bbf1a-3a05-41fc-b102-d40cd739a049	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:10:52.256557	\N	\N	2421	\N	\N	\N
e236d947-1e65-4d32-a39d-769dd719556d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:11:51.859235	\N	\N	2481	\N	\N	\N
9b7251a3-ba9f-4798-8ecc-1f8df0a64c32	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:12:51.85422	\N	\N	2541	\N	\N	\N
53b5990e-42d7-40a0-b6ac-879ca2789b3d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:13:51.867921	\N	\N	2601	\N	\N	\N
d3e59278-17d1-48f0-b87c-74cc452de876	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:14:51.864607	\N	\N	2661	\N	\N	\N
213db629-d1fe-4f42-8d1d-3e44f4003a66	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:15:51.860638	\N	\N	2721	\N	\N	\N
d17d4b7b-5cbb-4378-b26d-a58fb591df5d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:16:51.853224	\N	\N	2781	\N	\N	\N
dd90c897-6632-4d20-83e9-356dcbb17f5b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:17:51.895493	\N	\N	2841	\N	\N	\N
e0e05eb8-a6cf-40c4-9844-e5d9072aee88	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:18:51.857905	\N	\N	2901	\N	\N	\N
d3490479-6e12-467d-ae45-91783ca1beb7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:19:51.880596	\N	\N	2961	\N	\N	\N
d6c7eef8-59e8-4cb6-af92-af63d0403a3b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:20:51.855352	\N	\N	3021	\N	\N	\N
8cf9eea1-07da-4a2b-af51-35fce0aef0d3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:21:51.867352	\N	\N	3081	\N	\N	\N
722af933-6ce7-4a14-b9ae-d82f61f4fed2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:22:51.863981	\N	\N	3141	\N	\N	\N
32350a82-49e7-4efe-b734-2948d21bb828	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:23:51.858223	\N	\N	3201	\N	\N	\N
2e0f6816-5c55-4fc5-afc3-6269a786295b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:24:51.860479	\N	\N	3261	\N	\N	\N
0430f8a8-8f30-4379-97b9-bc0c5310851a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:25:51.891267	\N	\N	3321	\N	\N	\N
317cbada-4c49-4240-92ee-774abe873eec	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:26:51.906032	\N	\N	3381	\N	\N	\N
5c44a17f-c85b-46c4-9e82-7837277191cf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:27:51.863245	\N	\N	3441	\N	\N	\N
ed1bd709-f564-4272-a893-cb2e4a3fcb04	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:28:51.859683	\N	\N	3501	\N	\N	\N
f3d9c284-1bb4-4e81-9a8a-13827b81bea1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:29:51.87636	\N	\N	3561	\N	\N	\N
898af8c0-15b7-4c02-846c-b45f907cd638	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:30:51.893931	\N	\N	3621	\N	\N	\N
2f35047d-c108-41fe-9199-2f242e574309	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:31:51.869521	\N	\N	3681	\N	\N	\N
3ff50036-a22b-4fc8-9dfe-6925b115db66	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:32:51.866912	\N	\N	3741	\N	\N	\N
a479c7ab-ce36-4abd-bb97-632efff1d910	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:33:51.875244	\N	\N	3801	\N	\N	\N
7d1b0ce8-1fd0-429c-a2ba-066abfbaa5bf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:34:51.868673	\N	\N	3861	\N	\N	\N
f6975302-ffff-4d16-add6-d8557e8c065c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:35:51.884989	\N	\N	3921	\N	\N	\N
84c42cb6-906f-47d7-a3b7-32d3638aac0d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:36:51.870439	\N	\N	3981	\N	\N	\N
81e782c8-46d8-4997-823c-3c33f7a5f191	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:37:51.867137	\N	\N	4041	\N	\N	\N
29df7bb5-30ec-41b3-94ad-e671d3be8c0a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:38:51.902399	\N	\N	4101	\N	\N	\N
e9e183cf-1dc2-4b04-a23f-4fe7ee8d0c03	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:39:51.873282	\N	\N	4161	\N	\N	\N
6e7db488-8271-4e9a-801e-d9b96910f738	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:40:52.228641	\N	\N	4221	\N	\N	\N
6cc3d688-0ee6-4101-856d-a96011dd33ce	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:41:51.866006	\N	\N	4281	\N	\N	\N
aec7b9d8-4c03-44d7-9df3-0ed7c95fe793	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:42:51.863067	\N	\N	4341	\N	\N	\N
f7ec008e-a3fc-474e-b9f3-c201423cd959	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:43:51.901985	\N	\N	4401	\N	\N	\N
91280ecc-8d1f-48b6-989c-4d04d942255e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:44:51.928558	\N	\N	4461	\N	\N	\N
224cae0f-8744-4854-8262-b42bf5330740	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:45:51.886469	\N	\N	4521	\N	\N	\N
0921ef40-10d2-4fe3-bf0c-a81f28f13f94	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:46:51.864981	\N	\N	4581	\N	\N	\N
ac07bb65-ca0f-4916-8c3d-acf4bdd91824	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:47:51.863573	\N	\N	4641	\N	\N	\N
933ddb16-6541-4644-b9ba-627ea711aab9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:48:51.866821	\N	\N	4701	\N	\N	\N
1d63e6b4-d0aa-43cf-9581-7cad7e0f3e3e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:49:51.864008	\N	\N	4761	\N	\N	\N
f8fcae5f-796d-4ecb-8235-26f5ba409b82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:50:51.865339	\N	\N	4821	\N	\N	\N
7e6a17a3-7e59-4b30-8706-91e2dd615364	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:51:51.86998	\N	\N	4881	\N	\N	\N
a3ce3dee-f55c-4f14-a3fd-02f44d6c4efe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:52:51.872601	\N	\N	4941	\N	\N	\N
056e4e4d-eff6-4ec7-adb4-971c88e9d5e7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:53:51.863036	\N	\N	5001	\N	\N	\N
887f254a-4345-4a4c-94b9-83bf007c784b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:54:51.865115	\N	\N	5061	\N	\N	\N
cd6c9bca-42b5-4828-9184-3b853ddc2108	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:55:51.870482	\N	\N	5121	\N	\N	\N
fa9b7238-d319-4d42-9c8a-d5786dacbb87	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:56:51.867012	\N	\N	5181	\N	\N	\N
4ce285d4-7013-4d9a-9d91-f96e780f0ddb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:57:51.869913	\N	\N	5241	\N	\N	\N
ee928875-44a4-4f15-b01d-b9be02450d66	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:58:51.868938	\N	\N	5301	\N	\N	\N
514387a2-792b-424a-ab4c-5b4943f1225d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 21:59:51.914723	\N	\N	5361	\N	\N	\N
b8d262a6-84be-4854-834a-b2508671cc4a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:00:51.875786	\N	\N	5421	\N	\N	\N
2d094dea-9e2e-40fb-8245-8f89094c4452	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:01:51.867892	\N	\N	5481	\N	\N	\N
5f5fe31d-4523-4601-84f5-d9208853f111	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:02:51.867811	\N	\N	5541	\N	\N	\N
02c3e061-b258-4274-b437-3762798f3f84	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:03:51.875825	\N	\N	5601	\N	\N	\N
24c84c8c-a368-4afd-aed6-ab3238ab9dc1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:04:51.917718	\N	\N	5661	\N	\N	\N
c1008552-6dc0-4e5e-a229-2c31e83be282	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:05:51.874483	\N	\N	5721	\N	\N	\N
2aed0532-51f0-40d0-a177-7951d32032d2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:06:51.872338	\N	\N	5781	\N	\N	\N
f3857eb4-1f28-4c08-918c-75759755ece0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:07:51.879204	\N	\N	5841	\N	\N	\N
ef4425eb-f86f-4cd1-a819-0b64a165b9d8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:08:51.885559	\N	\N	5901	\N	\N	\N
bb537dfe-76ab-4f1d-99c9-3ff064b1b29d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:09:52.044681	\N	\N	5961	\N	\N	\N
ea7181d5-028d-42f3-8b1b-b1d35d8b9072	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:10:55.899139	\N	\N	6021	\N	\N	\N
55ad8390-5e18-4c8b-a818-91fb2df695fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:11:51.883252	\N	\N	6081	\N	\N	\N
7baf5e94-1cf7-4757-82fe-52287071e0a6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:12:51.913076	\N	\N	6141	\N	\N	\N
bc54b551-8561-470f-88c1-4b05e5387a82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:13:51.893443	\N	\N	6201	\N	\N	\N
a6147c3c-7296-40a5-acbb-9fdaa618c09d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:14:51.870245	\N	\N	6261	\N	\N	\N
2a1cadfa-ffd3-44e5-acd3-df773443223c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:15:51.877772	\N	\N	6321	\N	\N	\N
64d73bd8-2ddf-4894-81ce-64d238813677	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:16:51.881864	\N	\N	6381	\N	\N	\N
df013ede-0a83-4415-a074-4eec6a0325ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:17:51.876979	\N	\N	6441	\N	\N	\N
f7948324-0717-4e5c-aa6b-0e8e67aa8877	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:18:51.894439	\N	\N	6501	\N	\N	\N
8de3b812-61c9-49bd-923d-f8826f2f133a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:19:51.883727	\N	\N	6561	\N	\N	\N
53105566-8a56-4f56-8ed1-f6eba6a2d0b4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:20:51.877714	\N	\N	6621	\N	\N	\N
6cc4fad1-3964-415f-a4a6-0e5f20b8018e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:21:51.880057	\N	\N	6681	\N	\N	\N
d14b9318-13bd-48be-ac07-375f85239f33	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:22:51.879647	\N	\N	6741	\N	\N	\N
13f1e6e4-325a-4e58-b005-d02fe3d4fada	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:23:51.877177	\N	\N	6801	\N	\N	\N
785e4d29-7bb1-4e6b-a110-6d0c92c41c44	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:24:30.114397	\N	\N	6840	\N	\N	\N
17a83835-40f8-4255-a9a8-2ff1429a49bd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:24:32.353745	\N	\N	6842	\N	\N	\N
335e8a32-2465-43a5-9020-6a934a296fe7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:25:02.845362	\N	\N	6872	\N	\N	\N
436530d3-69f5-4faf-8dae-667e90c6e4c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:25:32.843136	\N	\N	6902	\N	\N	\N
ccf764b8-a8bc-462e-acef-ffbddd62413c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:26:52.240655	\N	\N	6981	\N	\N	\N
35172d0f-ca13-4d85-9f16-28fa1a34a057	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:27:51.895048	\N	\N	7041	\N	\N	\N
7b84670b-c58d-49a6-8131-c6c9bd6538eb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:28:51.884727	\N	\N	7101	\N	\N	\N
5bbb2934-7e67-4bfc-850c-3a7a60676aa8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:29:51.875843	\N	\N	7161	\N	\N	\N
ad9c26c5-1dfe-4a1c-a60f-b206d86c8aae	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:30:51.886567	\N	\N	7221	\N	\N	\N
4bb59962-06fe-4ba6-a0cd-b6265d70805d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:31:51.892836	\N	\N	7281	\N	\N	\N
7aebf45b-5dca-4cf8-bd31-298a26dd9310	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:32:51.910236	\N	\N	7341	\N	\N	\N
10b38733-9108-4219-9fd7-5385e33148d5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:33:51.895611	\N	\N	7401	\N	\N	\N
850f32f7-a8ae-47dc-80a0-68047dba14ec	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:34:51.8961	\N	\N	7461	\N	\N	\N
ac135ba6-acc9-45e3-ac9b-387b13fffbbe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:35:51.887159	\N	\N	7521	\N	\N	\N
eb956ad7-24ea-451e-9fa8-6b982a538e3a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:36:51.904409	\N	\N	7581	\N	\N	\N
93130987-e11e-406e-b220-035894841582	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:37:51.884032	\N	\N	7641	\N	\N	\N
0aab00e9-5059-4da9-904b-20923b1f5e5f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:38:51.881854	\N	\N	7701	\N	\N	\N
b4e5a0d4-941f-4b30-ade4-66afd36d10f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:39:52.026469	\N	\N	7761	\N	\N	\N
44f87f8a-e0c8-476e-8eab-b9f6bfae047c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:40:52.244758	\N	\N	7821	\N	\N	\N
d79f6adf-4ffa-4730-a117-a3de317032b9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:41:51.927711	\N	\N	7881	\N	\N	\N
c009e0af-a48c-4abf-870e-48f71ed53422	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:42:51.881189	\N	\N	7941	\N	\N	\N
34b4fb7b-f420-4bf7-83af-46da9ffbadf1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:43:51.885125	\N	\N	8001	\N	\N	\N
df670801-2339-4ade-b49a-f2c134f2b09c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:44:51.893952	\N	\N	8061	\N	\N	\N
54831698-6320-4398-bf5e-3365137bb773	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:45:51.893812	\N	\N	8121	\N	\N	\N
0592c194-c225-47e4-8fc4-abd7b196324d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:46:51.894256	\N	\N	8181	\N	\N	\N
f4d45107-4687-4a22-839b-db71ab12ad4f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:47:51.897326	\N	\N	8241	\N	\N	\N
9ac68b7b-af7b-4537-8789-c9b2d383d3c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:48:51.905608	\N	\N	8301	\N	\N	\N
0cc1043a-df6d-44c1-b7a0-e5ddb914822f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:49:51.891801	\N	\N	8361	\N	\N	\N
e701c051-3ec5-4379-b2bd-8d309289a701	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:50:51.894867	\N	\N	8421	\N	\N	\N
140bda1d-0aeb-4475-8e61-01cf2f697c3a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:51:51.884885	\N	\N	8481	\N	\N	\N
6fa19cb3-7dc3-4bba-bfda-5f98eb90e353	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:52:52.036396	\N	\N	8541	\N	\N	\N
f65c7334-5d67-428e-87b6-d10445019f0f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:53:51.895665	\N	\N	8601	\N	\N	\N
b7833b8f-1e0a-4022-8925-42016339a9ae	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:54:51.89415	\N	\N	8661	\N	\N	\N
22fea058-45e3-4ed2-bfad-cacfc6f38d37	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:55:51.901882	\N	\N	8721	\N	\N	\N
7bdb5023-db5d-4582-8b82-3cac646db783	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:56:51.894992	\N	\N	8781	\N	\N	\N
76b0a980-cc63-4988-9710-17700e10e5dc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:57:51.924557	\N	\N	8841	\N	\N	\N
7b147dd1-c20a-4d84-ba85-9d7ddcf41a9a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:58:51.918167	\N	\N	8901	\N	\N	\N
8c57b070-1bbc-4c69-9453-0b5760d583e8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 22:59:51.898732	\N	\N	8961	\N	\N	\N
7a07e99c-75bc-46da-aaaf-5b76d71860b5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:00:51.893315	\N	\N	9021	\N	\N	\N
29decf61-dc98-47be-8f22-9c132563314a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:01:51.895715	\N	\N	9081	\N	\N	\N
159c7dd0-0b67-446a-9999-408e53dd9480	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:02:51.899473	\N	\N	9141	\N	\N	\N
b51da4b1-2ead-4f0f-b8cd-480efe6ed881	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:03:51.89802	\N	\N	9201	\N	\N	\N
a8a6f6b6-7e2d-4897-9056-92c7a25338eb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:04:51.902801	\N	\N	9261	\N	\N	\N
726bd6ce-5405-46b6-96b9-b256f01c0dee	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:05:52.081504	\N	\N	9321	\N	\N	\N
e2417bc1-c8ab-4f7e-bab7-f4df974e1e37	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:06:51.919765	\N	\N	9381	\N	\N	\N
719056d1-15b7-40e4-9912-6d7e06798357	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:07:51.919364	\N	\N	9441	\N	\N	\N
a3b9e75e-c9ce-4ba9-9f9e-31048df1e25c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:09:51.978234	\N	\N	9561	\N	\N	\N
08fca258-ac1e-4652-a96d-fe2d5d4630bf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:10:52.267859	\N	\N	9621	\N	\N	\N
7570d667-5619-4832-9a13-b140a5e9e560	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:11:51.925996	\N	\N	9681	\N	\N	\N
0477d530-8955-480c-8ae8-9b06a235663f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:12:51.892744	\N	\N	9741	\N	\N	\N
0c988d25-4913-4650-aa5c-38579f33b0ca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:13:51.898763	\N	\N	9801	\N	\N	\N
7b6af19e-b6d2-4ad9-b2f7-212ac9de5f56	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:14:51.894055	\N	\N	9861	\N	\N	\N
58688023-8f14-45b6-bbe0-a4559e58297c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:15:51.893795	\N	\N	9921	\N	\N	\N
d657f10f-0c28-4ee8-8b59-06f40bbb58b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:16:51.899582	\N	\N	9981	\N	\N	\N
ae9d2123-2774-407e-b461-ac531eeae4e5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:17:51.906133	\N	\N	10041	\N	\N	\N
acb00df3-795a-4097-b832-bfb209db24f0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:18:51.901183	\N	\N	10101	\N	\N	\N
701889ac-b4f2-403c-ac5c-037ff959800e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:19:51.907141	\N	\N	10161	\N	\N	\N
89efa408-30ca-46a7-8b3f-76b65684b2a4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:20:51.914188	\N	\N	10221	\N	\N	\N
9756b43b-5a8d-451d-a49c-a44e149f8634	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:21:51.914733	\N	\N	10281	\N	\N	\N
75fd0e6d-51bc-4dd9-913c-dfaa0254868d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:22:51.967935	\N	\N	10341	\N	\N	\N
87ce5340-1c7b-49eb-ad02-4bf659d0c047	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:23:51.907634	\N	\N	10401	\N	\N	\N
f9fd0651-ed24-4192-8dd7-405e5eb128bb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:24:51.906146	\N	\N	10461	\N	\N	\N
f508bb0c-b113-42d5-b2ea-10469cce2b36	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:25:10.004092	\N	\N	10480	\N	\N	\N
3859efdd-13f2-4016-97d1-8d842625a7a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:25:47.364606	\N	\N	36	\N	\N	\N
5cffe650-8e3d-46e1-b010-0259e0b00029	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:26:17.37289	\N	\N	66	\N	\N	\N
2b926c18-74b1-468b-9a60-5729525827a3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:26:47.379765	\N	\N	96	\N	\N	\N
19d7e5d3-42d0-4a57-ad67-e73b55970978	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:27:17.355288	\N	\N	126	\N	\N	\N
436a932e-f174-41ea-a2e2-1b1321f9943b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:27:47.359745	\N	\N	156	\N	\N	\N
d7da5037-cc7a-4874-b816-e24ef29b938d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:28:17.363526	\N	\N	186	\N	\N	\N
e2b8a873-4f93-4db1-8a03-96756293ff05	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:28:47.386811	\N	\N	216	\N	\N	\N
89381691-1cc3-4ee1-8f37-6a6d546c7384	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:29:17.360088	\N	\N	246	\N	\N	\N
749dad01-d975-42ac-80c9-0d43274886e3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:29:47.378006	\N	\N	276	\N	\N	\N
d432f24c-fbf4-48cf-ab44-25e5b9448811	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:30:47.364521	\N	\N	336	\N	\N	\N
3b3bb8d0-7a60-49ee-920d-0d0af71475de	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:31:17.360698	\N	\N	366	\N	\N	\N
179835a6-6a8b-4040-9276-70df378ded7c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:31:47.362373	\N	\N	396	\N	\N	\N
4de0f4cc-dfaa-45c9-953d-f4cab4218970	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:32:17.36701	\N	\N	426	\N	\N	\N
31b1c70f-74f7-43d1-bfae-bb569150e222	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:33:47.371239	\N	\N	516	\N	\N	\N
db6bb6df-31bf-4cb3-9495-e0273fae40d8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:30:17.37634	\N	\N	306	\N	\N	\N
e6a6f82b-b695-4616-a8ca-5ed8a79a211d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:32:47.358548	\N	\N	456	\N	\N	\N
1f603c05-9057-461d-85d8-9727042fff0a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:33:17.369207	\N	\N	486	\N	\N	\N
55bf8f2b-d89d-42c8-94b3-c6f86030e714	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:34:17.357256	\N	\N	546	\N	\N	\N
962db63e-4c5f-4564-b46f-8b462ccecfb9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:34:47.362951	\N	\N	576	\N	\N	\N
7e8cbad1-66e3-4b00-b26c-40ca8dd0a54d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:35:17.36224	\N	\N	606	\N	\N	\N
644e5b1f-64a6-4b3a-adef-9824e1d46583	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:35:47.362987	\N	\N	636	\N	\N	\N
b6bc08ec-0dc1-484d-89a2-5fc7e844ae0a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:36:17.364179	\N	\N	666	\N	\N	\N
24de5449-7789-41d8-8e4f-ae83c669e615	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:36:47.377253	\N	\N	696	\N	\N	\N
da2adc0d-4cd6-4d9d-942c-65653bb80d38	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:37:17.366511	\N	\N	726	\N	\N	\N
2f2c96ae-1da3-4db0-b12c-b9436264924a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:37:47.359481	\N	\N	756	\N	\N	\N
9eb3cc1e-7b76-4ef9-8bb8-f49b354ffa1b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:38:17.364016	\N	\N	786	\N	\N	\N
e66baed0-c481-4d28-b27c-8f4c4f835b6e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:38:47.359914	\N	\N	816	\N	\N	\N
b590532a-be6d-4367-9350-dc6f3173daf0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:39:17.362626	\N	\N	846	\N	\N	\N
d60b939f-7589-4a30-8880-787c6cff23ae	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:39:47.360988	\N	\N	876	\N	\N	\N
0f0856ad-c799-42f4-9767-726b44fc4079	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:40:17.371928	\N	\N	906	\N	\N	\N
99dabc84-8e1a-4ed0-8fb5-e463e1b3c478	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:40:47.369649	\N	\N	936	\N	\N	\N
5bc6ac7f-f274-4340-8cb8-edaa5788f595	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:41:17.363251	\N	\N	966	\N	\N	\N
236664c6-f2e9-4ded-9a4e-7597ccd5b7d0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:41:47.358994	\N	\N	996	\N	\N	\N
52393819-3491-4036-8e4c-876e68264d9b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:42:17.361647	\N	\N	1026	\N	\N	\N
7a899478-ab9c-4b08-952a-1a6371c485f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:42:47.362331	\N	\N	1056	\N	\N	\N
359ef33a-9680-43fb-a4b6-0fd9184c6858	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:43:17.362733	\N	\N	1086	\N	\N	\N
7529764e-17c7-4106-9aaa-6d02707c564d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:43:47.375546	\N	\N	1116	\N	\N	\N
fc399570-0e21-4243-abb4-12b45377d79f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:44:17.380238	\N	\N	1146	\N	\N	\N
b5d88b28-d822-4e64-9fdf-ab1cb00d9906	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:44:47.369063	\N	\N	1176	\N	\N	\N
a12a16ff-bc10-40b6-9e39-209aafe0f397	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:45:17.361994	\N	\N	1206	\N	\N	\N
961bfd1d-6dda-444d-9bb5-34fee090ec57	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:45:47.362874	\N	\N	1236	\N	\N	\N
a79f7333-edcc-4c3e-88c9-d119cad46ec0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:46:17.364804	\N	\N	1266	\N	\N	\N
9875bc12-eb7f-4a33-872c-32da634f10c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:46:47.373962	\N	\N	1296	\N	\N	\N
f71776ff-7154-455d-80c5-48dc37a8b566	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:47:17.378081	\N	\N	1326	\N	\N	\N
74dfb5e6-d387-4c72-afa2-63657fb9df09	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:47:47.375017	\N	\N	1356	\N	\N	\N
ff714388-5168-442f-b326-1857b02dc14d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:48:17.360743	\N	\N	1386	\N	\N	\N
2d8973c2-af24-4860-bb46-b0c5feab91f9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:48:47.363218	\N	\N	1416	\N	\N	\N
e3df6e97-ff09-40a0-8105-c06b9130f229	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:49:17.370637	\N	\N	1446	\N	\N	\N
2905830d-25b8-449c-a103-aca7d37da532	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:49:47.371254	\N	\N	1476	\N	\N	\N
5db9e569-5743-48c7-9623-264c5e2918b0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:50:17.374418	\N	\N	1506	\N	\N	\N
71376dcc-e16b-4f18-84dc-081864aee47c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:50:47.373888	\N	\N	1536	\N	\N	\N
35b740fc-e56a-425b-8ac4-6e93f6266453	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:51:17.379118	\N	\N	1566	\N	\N	\N
fd41794e-3956-4c96-8e1e-fe976d431b6e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:51:47.368772	\N	\N	1596	\N	\N	\N
95968e94-c489-440a-8ff8-7f078d298153	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:52:17.367721	\N	\N	1626	\N	\N	\N
e29d17c3-2088-4ee6-be6e-b6785bb0787a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:52:47.365842	\N	\N	1656	\N	\N	\N
fa8c9523-6027-4765-a46a-0973ce07f2cd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:53:17.370505	\N	\N	1686	\N	\N	\N
41e50f30-3f44-4fa1-a0a4-973ce0060c4d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:53:47.3789	\N	\N	1716	\N	\N	\N
ff868142-8794-4d91-85e7-090d7302398f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:54:17.376697	\N	\N	1746	\N	\N	\N
33aa9276-bc28-4db5-a9d4-cee15aabc8bc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:54:47.385259	\N	\N	1776	\N	\N	\N
c5762115-163f-415d-8e6d-ad4af39b88f3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:55:17.368225	\N	\N	1806	\N	\N	\N
3c5a7d99-0548-4a53-8b8d-01138759f766	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:55:47.367503	\N	\N	1836	\N	\N	\N
45b00728-8a68-474a-a3f8-01df2a230448	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:56:17.37348	\N	\N	1866	\N	\N	\N
46bb7798-d8c0-47f0-87ac-b13950851e04	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:56:47.373714	\N	\N	1896	\N	\N	\N
2411c391-890c-4fb7-8134-3aec87adf442	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:57:17.371533	\N	\N	1926	\N	\N	\N
45b541f3-8194-437b-b29b-70c845b2f41e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:57:47.381666	\N	\N	1956	\N	\N	\N
86a364b1-175f-47bb-b3a2-d1e4b3d27132	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:58:17.380573	\N	\N	1986	\N	\N	\N
3ddc9ec3-5ec7-487e-9d75-308bfda0f5b5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:58:47.382627	\N	\N	2016	\N	\N	\N
d862f69a-1d39-4b3b-b59e-6984e0846cc5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:59:17.369852	\N	\N	2046	\N	\N	\N
4b6fc116-2d25-4eec-bf17-ee1e88b524b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-22 23:59:47.372835	\N	\N	2076	\N	\N	\N
8e1a1ae0-27ad-4fca-9cf2-4adbd8e5fbd2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:00:17.371089	\N	\N	2106	\N	\N	\N
2119e3b9-4f23-4e14-bba7-ef6c43ae162b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:00:47.369201	\N	\N	2136	\N	\N	\N
95499e65-bf39-4c43-b377-f7647eb019c9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:01:17.38048	\N	\N	2166	\N	\N	\N
8dc33b9d-03ff-4af3-b274-4e794f0fd1f9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:01:47.385	\N	\N	2196	\N	\N	\N
e21f667b-4a17-4ce2-8eaf-1cc2326a9eb5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:02:17.367978	\N	\N	2226	\N	\N	\N
eb863b35-f9ce-41d9-9697-90ec129ba5df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:02:47.369922	\N	\N	2256	\N	\N	\N
2631e78c-a936-4af0-93ef-ab6ee5a963dc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:03:17.371232	\N	\N	2286	\N	\N	\N
ff4e3d6c-f974-42f2-9cc9-7f45eaab5e03	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:03:47.376581	\N	\N	2316	\N	\N	\N
c47077a9-ea58-4ea0-b05f-ed7cfae983a3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:04:17.377139	\N	\N	2346	\N	\N	\N
d9de42c1-ab7c-4bd8-8178-ccc53c7f989a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:05:47.371945	\N	\N	2436	\N	\N	\N
8cf5270f-7e9b-4527-aacb-60ef297c0bd7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:06:17.371472	\N	\N	2466	\N	\N	\N
de3deb0e-0700-47e8-b9b9-ceff8d4ec1a2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:06:47.370915	\N	\N	2496	\N	\N	\N
1d740a4d-ed53-4e08-9f25-baa09a91af4f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:07:47.372494	\N	\N	2556	\N	\N	\N
149062ff-8066-44df-a7be-45bc0818a884	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:04:47.376896	\N	\N	2376	\N	\N	\N
6128c63f-bded-4153-b90a-8e8ee28140fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:05:17.380052	\N	\N	2406	\N	\N	\N
8b27947f-4869-409e-ba64-f78797a1fe3d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:07:17.371521	\N	\N	2526	\N	\N	\N
923b90e1-4743-4b15-8470-fc7e5dc9a93b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:08:17.380164	\N	\N	2586	\N	\N	\N
d6504d76-8a94-43c9-ae0f-2c1e00f54692	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:08:47.384034	\N	\N	2616	\N	\N	\N
b8a9502e-e3d8-437e-9063-1fd485cb6c0c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:09:17.371231	\N	\N	2646	\N	\N	\N
07fee3c9-1980-40df-89db-c9a886c9d32b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:09:47.371779	\N	\N	2676	\N	\N	\N
64b6da8b-6e54-4078-9ada-aa9b8a52c177	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:10:17.374532	\N	\N	2706	\N	\N	\N
cf8636c4-ce7b-4196-8472-34202da99613	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:10:47.376134	\N	\N	2736	\N	\N	\N
8a8d7a13-4030-4fbc-9f5d-d12a45f852e0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:11:17.377996	\N	\N	2766	\N	\N	\N
5032a52c-2b91-4c1e-bf38-78059461fafa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:11:47.401414	\N	\N	2796	\N	\N	\N
e6db2959-5ddd-488e-aff0-16ee5b60f9ea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:12:17.393423	\N	\N	2826	\N	\N	\N
332b7240-fd12-4151-9c96-c0cc9c0babf8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:12:47.371298	\N	\N	2856	\N	\N	\N
dc5bd56b-0304-4e76-8305-9639456b3c8c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:13:17.377792	\N	\N	2886	\N	\N	\N
2014cdba-5018-419d-bc4c-45f5a3531b4f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:13:47.886098	\N	\N	2917	\N	\N	\N
292c438d-8112-42ee-af6f-01dc0c4796c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:14:17.886445	\N	\N	2947	\N	\N	\N
f52a52ac-9be9-450b-a4c2-b897b9937350	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:14:51.916356	\N	\N	2981	\N	\N	\N
5be8efec-e848-4609-a834-f27917e3be82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:15:51.919003	\N	\N	3041	\N	\N	\N
211ce78a-5f6c-4b8f-b9af-5b205ba16c6f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:16:51.923587	\N	\N	3101	\N	\N	\N
a81fda1d-2253-4c3d-8b86-76fed9b0e87b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:17:51.921512	\N	\N	3161	\N	\N	\N
b1c0ce0c-8c15-4c56-8b64-3a60333066eb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:18:51.918305	\N	\N	3221	\N	\N	\N
b02aa835-ee21-4c0a-8d76-9a513520f305	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:19:51.937601	\N	\N	3281	\N	\N	\N
9d71b153-7816-4cd2-b63e-643accb70135	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:20:51.930078	\N	\N	3341	\N	\N	\N
40a95d49-98d9-4202-bf58-36ad8543c151	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:21:51.928128	\N	\N	3401	\N	\N	\N
c39ed257-123b-4d60-bb1c-e6bcac8121a2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:22:51.952289	\N	\N	3461	\N	\N	\N
a5d1b737-092b-450d-8214-b6ae85e025c6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:23:51.928005	\N	\N	3521	\N	\N	\N
dfbfde6c-f197-407a-8f54-c23c630a4b2d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:24:51.936285	\N	\N	3581	\N	\N	\N
48234c1f-939b-4c24-92e3-73f0c3e8fc1a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:25:51.929592	\N	\N	3641	\N	\N	\N
c76f79f0-6d6c-493d-8dd6-45019c5b2203	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:26:51.937775	\N	\N	3701	\N	\N	\N
0d346c18-331b-408f-ad2b-9dd83ee63f39	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:27:51.932349	\N	\N	3761	\N	\N	\N
99fcdf9f-9213-4464-aa59-86613e8c95f9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:30:00.142968	\N	\N	3821	\N	\N	\N
3d3e07c1-59ad-432c-bb25-eee9d8aefc2a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:30:02.346871	\N	\N	3881	\N	\N	\N
650e18aa-eaf1-48df-88f9-c05becd27a56	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:30:51.959055	\N	\N	3941	\N	\N	\N
bcae2a14-9a7b-4f7f-a8db-a14d67b6a32c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:31:51.926345	\N	\N	4001	\N	\N	\N
8643398e-7931-4068-8f7c-1b3013affcdb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:32:51.944011	\N	\N	4061	\N	\N	\N
3c4150cb-7d99-4287-8823-b227ac03cf26	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:33:51.954922	\N	\N	4121	\N	\N	\N
9dcc0855-2570-4da8-be9c-ebfffc52da73	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:34:51.924635	\N	\N	4181	\N	\N	\N
8989120d-6b1d-49cb-9ef5-e9a8c432b668	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:35:51.928227	\N	\N	4241	\N	\N	\N
0f2b41a5-72a9-441a-97ef-099354f6902b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:36:51.932338	\N	\N	4301	\N	\N	\N
e457eb2f-464b-4b11-b748-9efb9dfa82a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:37:51.92528	\N	\N	4361	\N	\N	\N
dd2fd3e4-85e8-40ab-8157-7ac197add37c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:38:51.928869	\N	\N	4421	\N	\N	\N
d95878c7-5258-4264-b0bb-f3f0f6705b7e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 00:39:51.92102	\N	\N	4481	\N	\N	\N
46a151d4-99e0-4518-9976-7edb0b98bbf7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 09:55:00.411357	\N	\N	8741	\N	\N	\N
8d6775ec-3762-4e52-8b96-80d21589e846	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 09:57:44.693089	\N	\N	8801	\N	\N	\N
3f265f2a-5e28-4233-ba7d-f6b5c049cfce	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 09:58:44.734743	\N	\N	8861	\N	\N	\N
e74c4b87-f4e7-4dbf-98dd-650004d06f45	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 09:59:44.727155	\N	\N	8921	\N	\N	\N
5b0052c9-1cea-4a72-b642-a1243b858630	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:00:45.010851	\N	\N	8981	\N	\N	\N
9be10c47-ddca-4fa4-bc99-510d5b368282	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:01:44.686643	\N	\N	9041	\N	\N	\N
18d7c359-b1b2-4fc1-8e34-db3497ca574e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:02:44.720721	\N	\N	9101	\N	\N	\N
3edb10a6-f45e-4e02-9214-8454c2a2b6af	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:03:44.70847	\N	\N	9161	\N	\N	\N
eafc4419-cded-431f-9577-9f275e3fc036	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:04:44.688417	\N	\N	9221	\N	\N	\N
4192b7e9-abf5-4643-96ba-19bc56ecb023	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:05:44.697272	\N	\N	9281	\N	\N	\N
5387497b-96aa-40de-8954-dcd3b50d67d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:06:44.683024	\N	\N	9341	\N	\N	\N
125e83d2-e4a2-41e0-88fa-8fb52f4bedd8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:07:44.715355	\N	\N	9401	\N	\N	\N
b3d6d590-48c5-4842-9cd8-79e8c7bc3895	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:08:44.700729	\N	\N	9461	\N	\N	\N
9c594fbc-4d7f-4c07-89d5-f3c34d37cb9f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:09:44.707814	\N	\N	9521	\N	\N	\N
8942dac7-17b3-448e-9b83-00297b9d1892	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:10:44.709777	\N	\N	9581	\N	\N	\N
a813a135-1d25-4a17-9efc-123668337238	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:11:44.712769	\N	\N	9641	\N	\N	\N
26015361-a27a-4260-a1a1-d0c339013466	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:12:44.686182	\N	\N	9701	\N	\N	\N
49f28ef0-8566-4632-962d-b9447ad8c48c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:13:44.689979	\N	\N	9761	\N	\N	\N
a904fd84-b306-47c8-9f4f-e8bcca3d5c84	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:14:44.709397	\N	\N	9821	\N	\N	\N
4d7dfd07-fbe1-4de0-b8e5-af3655ebe2dd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:15:44.711495	\N	\N	9881	\N	\N	\N
7e537399-995e-4498-9612-301334f19814	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:16:44.992121	\N	\N	9941	\N	\N	\N
0199dd93-03f5-400d-a82b-fb252e34c6a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:17:44.691417	\N	\N	10001	\N	\N	\N
a9ba7a2f-7896-4205-9b5c-bcb9d02b9c66	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:18:44.694826	\N	\N	10061	\N	\N	\N
939fbd5d-a443-4889-880e-b41d44ae9dbe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:19:44.721822	\N	\N	10121	\N	\N	\N
a2f8557e-d40a-4883-a010-ddf9fb2acda6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:20:44.706379	\N	\N	10181	\N	\N	\N
9a2a542a-cb43-42f8-a044-d8b59b7c3306	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:21:44.720338	\N	\N	10241	\N	\N	\N
6766bc75-ed48-429f-8f02-d6324063f07d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:22:44.705475	\N	\N	10301	\N	\N	\N
615a6484-c4d0-4216-8ce4-efa961f0b9cd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:23:44.694151	\N	\N	10361	\N	\N	\N
3cf7e890-2e76-4c4f-b7d8-2760b4f6a603	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:24:44.701395	\N	\N	10421	\N	\N	\N
7f29842c-f03e-4e65-996b-77125c087214	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:25:44.701439	\N	\N	10481	\N	\N	\N
efed1c9c-302c-4e49-9cbe-dd61fe6933eb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:26:44.69797	\N	\N	10541	\N	\N	\N
46b6ea3c-eaf1-4624-baa1-385b2c877886	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:27:44.701672	\N	\N	10601	\N	\N	\N
1239bb87-9a02-4b48-bbf4-5c588912d96f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:28:44.725123	\N	\N	10661	\N	\N	\N
8166b00a-ccac-4b34-8c33-fb8a96c4b7e2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:29:44.716658	\N	\N	10721	\N	\N	\N
bcd6001a-7eb8-40d0-9647-71d927e41312	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:30:44.697606	\N	\N	10781	\N	\N	\N
d54ba23d-6d8f-44fe-8bec-846b0518fb64	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:31:44.702624	\N	\N	10841	\N	\N	\N
eef5a65d-1267-4db7-bef9-008ac5b77301	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:32:44.715796	\N	\N	10901	\N	\N	\N
e804be02-db84-4849-ab10-4936674749a4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:33:44.739868	\N	\N	10961	\N	\N	\N
6c15c3f3-62af-4b43-98d9-3c690890a78f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:34:44.712556	\N	\N	11021	\N	\N	\N
1cb5f245-3051-41b2-ad01-eb00599c1096	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:35:44.726876	\N	\N	11081	\N	\N	\N
b1b32b75-9538-4454-819d-ff3d623a2e5b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:36:44.707069	\N	\N	11141	\N	\N	\N
86f1cea7-cb70-4e65-a96c-5536f0437b0a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:37:44.725835	\N	\N	11201	\N	\N	\N
e94d2376-68cd-4978-b87d-fdc7060ae9f1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:38:44.714283	\N	\N	11261	\N	\N	\N
8dbbc02c-8779-4529-8089-20f818c7b95f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:39:44.711436	\N	\N	11321	\N	\N	\N
3664e390-241e-410c-811b-34e65d6a15d6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:40:44.708594	\N	\N	11381	\N	\N	\N
6feb902c-5545-4ae4-90aa-387041ed1471	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:41:44.691284	\N	\N	11441	\N	\N	\N
3dc88972-08fb-4c13-9ad2-35c61136bb03	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:42:44.720969	\N	\N	11501	\N	\N	\N
e0a9786f-069b-4743-ac42-4dc19a7f5548	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:43:44.712218	\N	\N	11561	\N	\N	\N
adbd9d61-507d-474d-afad-67f47bd18988	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:44:44.708359	\N	\N	11621	\N	\N	\N
afb47ee6-4c2c-4336-9931-8b1d26f180c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:45:44.712123	\N	\N	11681	\N	\N	\N
cb74cc21-9819-4b20-8d85-d8c3ad4e7d5e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:46:45.020377	\N	\N	11741	\N	\N	\N
3ae852c4-82ca-44c5-9e2f-b99361e08efc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:47:44.706075	\N	\N	11801	\N	\N	\N
3b26f6b9-ae46-4ad9-864b-1043908c7877	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:48:44.713987	\N	\N	11861	\N	\N	\N
200ec219-e4da-4a33-98b2-92f18403851c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:49:44.710459	\N	\N	11921	\N	\N	\N
d745ad57-7c45-4b6a-a43e-1d81bc1dce23	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:50:44.718539	\N	\N	11981	\N	\N	\N
5f9d119e-c9a1-478a-85b2-0bf19d18d377	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:51:44.703676	\N	\N	12041	\N	\N	\N
a83d0a1a-1710-4b0e-b2e2-68334d36662e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:52:44.738782	\N	\N	12101	\N	\N	\N
64144fbe-8f4b-4d40-820b-2f76cce62dd9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:53:44.751569	\N	\N	12161	\N	\N	\N
78348aac-9ea6-41a8-8f71-e790823b00b3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:54:44.706691	\N	\N	12221	\N	\N	\N
66abac69-fa89-4aa5-b934-f1de902bfe98	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:55:44.700341	\N	\N	12281	\N	\N	\N
503fde15-5e68-4078-8faf-dcb321604a33	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:56:44.69392	\N	\N	12341	\N	\N	\N
7950044d-28f1-44de-8615-acbc23ca17c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:57:44.699007	\N	\N	12401	\N	\N	\N
477d6661-a7d2-41bc-82ea-3782c8ac4c7f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:58:44.705319	\N	\N	12461	\N	\N	\N
87cbe9ac-b759-4d03-b4c7-e9b217d21d2a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 10:59:44.71886	\N	\N	12521	\N	\N	\N
98739e5a-8250-4c80-9bd7-50e835f75193	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:00:44.705518	\N	\N	12581	\N	\N	\N
af8ae0a3-fa47-4308-9a77-4e734f0e66f4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:01:44.717121	\N	\N	12641	\N	\N	\N
a6fb7fe1-2f1e-47d6-a8c5-3f1d94b61f5c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:02:44.712422	\N	\N	12701	\N	\N	\N
f9f43ad4-cfd8-4613-b46a-bbbf76ce5951	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:03:44.797529	\N	\N	12761	\N	\N	\N
64371338-cbb6-4966-adb2-804532ab98c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:04:44.717117	\N	\N	12821	\N	\N	\N
3a0e30fe-3a07-4125-a4e5-c76232ff0ece	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:05:44.711708	\N	\N	12881	\N	\N	\N
374a06d3-17b5-4873-aab6-fadeed530177	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:06:44.723024	\N	\N	12941	\N	\N	\N
d13eeddd-c5f7-4cf5-b526-23ffe2c8925e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:07:44.756211	\N	\N	13001	\N	\N	\N
009fb958-0fd5-44ac-a20b-0765e522e9cd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:08:44.7194	\N	\N	13061	\N	\N	\N
242c44ab-3291-4bb6-9f86-8e5ed562e50a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:09:44.728558	\N	\N	13121	\N	\N	\N
20aa4df8-6fd5-4bb1-b15a-14edd486bb20	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:10:44.712797	\N	\N	13181	\N	\N	\N
835521d9-ac57-4480-af87-edfed212ab64	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:11:44.723083	\N	\N	13241	\N	\N	\N
c4bf5ee2-bc07-48fa-a9c1-bbc8d994c99a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:12:44.71403	\N	\N	13301	\N	\N	\N
1fe4747e-3fda-4aa9-a01e-be31e12e3751	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:13:44.73839	\N	\N	13361	\N	\N	\N
6a29ac94-2cf7-4723-ac44-7a545071df8b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:14:44.721002	\N	\N	13421	\N	\N	\N
32c70fcd-42c9-4ee2-a8fe-3fc7d0ad4cdd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:15:44.719527	\N	\N	13481	\N	\N	\N
cc05f8a6-8a83-46ca-8d27-39589b60b268	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:16:45.032849	\N	\N	13541	\N	\N	\N
de27eb0f-75c6-4469-8da3-19d43e83d564	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:17:44.785558	\N	\N	13601	\N	\N	\N
d06a8920-5411-4da4-ad83-2bd1d7bdfa52	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:18:44.723107	\N	\N	13661	\N	\N	\N
84f850df-17c5-42a5-9712-d51ee9cd7a33	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:19:44.726756	\N	\N	13721	\N	\N	\N
7eedadf3-670b-4706-b341-4d0f38fdea9f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:20:44.719298	\N	\N	13781	\N	\N	\N
99ffe538-f69b-4828-9617-9274036f2cce	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:21:44.714762	\N	\N	13841	\N	\N	\N
6c83c9cd-da07-45d2-ac06-39663ad0248c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:22:44.729189	\N	\N	13901	\N	\N	\N
af760e78-86fa-447f-97dd-03a5f6891fbf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:23:44.721533	\N	\N	13961	\N	\N	\N
8d719826-d317-44a4-b69e-5e4654e9f657	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:24:44.718663	\N	\N	14021	\N	\N	\N
11dfaac7-7de2-4701-ba14-a0e26b2ff3f2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:25:44.767951	\N	\N	14081	\N	\N	\N
d07e573a-1ac1-4143-b922-f1e2fcede6dc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:26:44.71869	\N	\N	14141	\N	\N	\N
db09d13d-acba-467f-b050-f6099b2c032f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:27:44.721918	\N	\N	14201	\N	\N	\N
2d192a11-d51f-4680-8f6e-bc7d6de0d327	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:28:44.722356	\N	\N	14261	\N	\N	\N
67455f27-37a6-44eb-87f1-1b2dc353f0ef	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:29:44.740093	\N	\N	14321	\N	\N	\N
a5e3c28f-e30e-4e94-9a65-9341ae9f1b0b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:30:44.736993	\N	\N	14381	\N	\N	\N
7a10545d-ca0d-41cf-b628-c71b47339c28	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:31:44.725387	\N	\N	14441	\N	\N	\N
47f594ca-ee6c-4b87-af3f-f4b182986469	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:32:44.739918	\N	\N	14501	\N	\N	\N
6888dc51-613e-4079-97be-cf4d1b6b4417	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:33:44.740755	\N	\N	14561	\N	\N	\N
d5562eee-eaea-4206-908a-a44f491dc03e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:34:44.733247	\N	\N	14621	\N	\N	\N
f02b39cb-301e-4f4b-90a1-ce1544f245a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:35:44.731697	\N	\N	14681	\N	\N	\N
df70d207-9435-4f4c-9992-28e7eb03033e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:36:44.733138	\N	\N	14741	\N	\N	\N
49760870-288b-45e9-93ff-005221a26739	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:37:44.72796	\N	\N	14801	\N	\N	\N
2db7f5ec-fa50-4c0f-ae4a-4e13736aac0c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:38:44.738768	\N	\N	14861	\N	\N	\N
5564f116-c77a-44a3-9d96-738c9e2983d5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:39:44.740128	\N	\N	14921	\N	\N	\N
42fb354e-32d6-4b93-a8ff-2ca8a05bd4be	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:40:44.73866	\N	\N	14981	\N	\N	\N
7b0ef379-78cc-4397-a11a-56337d037f45	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:41:44.738066	\N	\N	15041	\N	\N	\N
b7b74e73-d717-4e70-8c31-45b111302991	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:42:44.75303	\N	\N	15101	\N	\N	\N
732ad64c-4453-4c6f-a7a4-843fc12268bf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:43:44.757248	\N	\N	15161	\N	\N	\N
48a51729-8d2d-450e-b95b-d230620f0e86	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:44:44.745489	\N	\N	15221	\N	\N	\N
715bbbc8-8fc9-428f-8f16-ea7899c4bc5e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:45:44.72613	\N	\N	15281	\N	\N	\N
fe574174-e732-434e-a44e-5624b41c8a18	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:46:45.054445	\N	\N	15341	\N	\N	\N
dc716e2c-0924-48a5-8643-339ffd82a061	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:47:44.732787	\N	\N	15401	\N	\N	\N
ab7b0089-c5a3-4eb5-ac75-76d1be060d82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:48:44.737197	\N	\N	15461	\N	\N	\N
306d2da1-65c2-4018-8338-4079ea87cec3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:49:44.731879	\N	\N	15521	\N	\N	\N
3569acc2-d232-41ea-b546-f3178f6594fc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:50:44.765402	\N	\N	15581	\N	\N	\N
7144850c-e2a3-4bb8-b8f7-a75ef43be7fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:51:44.739757	\N	\N	15641	\N	\N	\N
70c2ffdf-b6c7-4de5-adb1-e5d2436d6251	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:52:44.728334	\N	\N	15701	\N	\N	\N
de661e69-eab2-43fe-81d0-2f257daaffee	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:53:44.753161	\N	\N	15761	\N	\N	\N
e709298a-9c23-460b-a8a4-c192ccc04afc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:54:44.797658	\N	\N	15821	\N	\N	\N
aee49544-a1e0-433c-88ea-849df8127b10	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:55:44.747905	\N	\N	15881	\N	\N	\N
dfb6634e-2be3-408a-a00c-5c3a3d2b1d94	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:56:44.727631	\N	\N	15941	\N	\N	\N
af6648b4-47b1-426a-a69e-81a4694f7666	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:57:45.375108	\N	\N	16002	\N	\N	\N
b999ab5e-5977-429e-9fcf-cc096d6ca5ea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:58:44.962607	\N	\N	16061	\N	\N	\N
afd74580-0292-419e-baa5-280a19f12c2b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 11:59:44.752551	\N	\N	16121	\N	\N	\N
975d113f-c3a6-4a42-9522-f68071fc69d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:00:44.764891	\N	\N	16181	\N	\N	\N
235c3770-3f05-4b74-b733-058f1cecb160	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:01:44.839444	\N	\N	16241	\N	\N	\N
8b708a5a-c074-4507-a95c-b5f52db117b4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:02:44.761664	\N	\N	16301	\N	\N	\N
7a2e9c9a-a20f-4b27-9a5d-e4783825d393	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:03:44.787137	\N	\N	16361	\N	\N	\N
c2ec74f6-793a-40c9-ade3-9c35b3de2205	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:04:44.738909	\N	\N	16421	\N	\N	\N
0ec71c78-68b0-4bf5-86c1-660cd230da8d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:05:44.768643	\N	\N	16481	\N	\N	\N
28a5a33b-95eb-4a6b-bbd3-8ce66f260fb5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:06:44.782211	\N	\N	16541	\N	\N	\N
931e2acd-3e22-457c-9bb9-0172e52a659f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:07:44.737848	\N	\N	16601	\N	\N	\N
1b291a5f-9be5-4b2a-af1e-4d081e6ade53	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:08:44.750985	\N	\N	16661	\N	\N	\N
1864c54e-c81c-44e4-ac51-b769bb8e3459	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:09:44.779169	\N	\N	16721	\N	\N	\N
a026bb67-4c32-4732-b57e-e1c95896389b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:10:44.756288	\N	\N	16781	\N	\N	\N
7f15ce2c-55a4-4eee-bb64-7be695180425	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:11:44.771973	\N	\N	16841	\N	\N	\N
9b430823-f1d0-4102-8628-2652a23086db	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:12:44.751628	\N	\N	16901	\N	\N	\N
5c799213-fb68-4115-a8a5-f07bfb356493	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:13:44.757147	\N	\N	16961	\N	\N	\N
58a88b7b-db42-41c7-a02b-7aa8e840c9fc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:14:44.809416	\N	\N	17021	\N	\N	\N
50be88c8-970a-41f8-afea-728923494251	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:15:44.739765	\N	\N	17081	\N	\N	\N
1c482030-9a7f-468e-b3bb-54e8427dfc45	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:16:45.060737	\N	\N	17141	\N	\N	\N
a8190cfb-e668-4017-807b-a018ddb0534f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:17:46.201787	\N	\N	17202	\N	\N	\N
3cf441db-1917-4502-ba29-42ecb28f1075	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:18:44.736913	\N	\N	17261	\N	\N	\N
cdf1b70a-0209-4fdf-9bf8-bf09e93e0af4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:19:44.795337	\N	\N	17321	\N	\N	\N
7ec67d2e-a35a-4100-9e5f-8d6a389f5d5a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:20:44.741467	\N	\N	17381	\N	\N	\N
c20ff138-c4a9-467f-9991-ec34d19e337f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:21:44.757488	\N	\N	17441	\N	\N	\N
547c9f85-ff2c-41fb-8751-eb7d096c7e56	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:22:44.753454	\N	\N	17501	\N	\N	\N
0e7c123f-a4de-498c-a81a-f26f15279b54	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:23:44.747575	\N	\N	17561	\N	\N	\N
d0cafa7a-7dda-485c-8302-d39107951f3f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:24:44.743407	\N	\N	17621	\N	\N	\N
e3d9956b-1d4e-42ea-92f8-037c3d81132e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:25:44.751484	\N	\N	17681	\N	\N	\N
fb0b6fd6-ff46-4fa5-8614-4f505ad2e72a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:26:44.745867	\N	\N	17741	\N	\N	\N
82690488-1180-443c-b916-e5256198c328	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:27:44.758845	\N	\N	17801	\N	\N	\N
c4698e2d-c212-4c8b-bfd2-06b6dd7285cb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:28:44.747664	\N	\N	17861	\N	\N	\N
bfe5123a-6144-48fc-8952-b9ad0850a077	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:29:44.747685	\N	\N	17921	\N	\N	\N
10580026-bb67-4bb0-9304-5aed45033e8d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:30:44.744339	\N	\N	17981	\N	\N	\N
b5a637e0-e428-4dbd-a01a-be023c8cea90	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:31:44.752954	\N	\N	18041	\N	\N	\N
86680e2e-a061-483d-9ae3-13056d2207f6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:32:44.746573	\N	\N	18101	\N	\N	\N
7708de38-2ed0-4d31-a820-743c7a0afbe0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:33:44.7843	\N	\N	18161	\N	\N	\N
c6add38f-8a4f-4d9d-b308-8fcc838b6536	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:34:44.753535	\N	\N	18221	\N	\N	\N
95ac75c4-117a-464b-8f75-a44296eaef40	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:35:44.759866	\N	\N	18281	\N	\N	\N
edda3830-84c3-4c2b-a41f-a0348113e52d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:36:44.738853	\N	\N	18341	\N	\N	\N
36cd2a86-1ffe-49e4-8a7c-519abf68c6d4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:37:44.757718	\N	\N	18401	\N	\N	\N
3bd578e9-6a0e-43c0-870a-f6cdcb0e7714	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:38:44.781648	\N	\N	18461	\N	\N	\N
883be58a-edc7-4e6c-add2-0df46d11a92c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:39:44.761654	\N	\N	18521	\N	\N	\N
6574bbe9-bbd2-44b5-b306-5bd3ca2fae66	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:40:44.753782	\N	\N	18581	\N	\N	\N
1e31f5d4-36c6-40be-aee6-04517a49b525	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:41:44.763517	\N	\N	18641	\N	\N	\N
0747f31a-6446-4992-92b7-d212d252d0b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:42:44.763711	\N	\N	18701	\N	\N	\N
e2d04c4e-1137-404b-8e13-642a232cb63e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:43:44.758479	\N	\N	18761	\N	\N	\N
dfadca6b-003b-4e5a-8d27-b7a9e3f8347e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:44:44.766739	\N	\N	18821	\N	\N	\N
c36faece-d04f-45f8-9d76-57bc86413f6b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:45:44.75524	\N	\N	18881	\N	\N	\N
80d02f6a-396a-40ff-806c-fba0d9666399	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:46:45.064997	\N	\N	18941	\N	\N	\N
7384adad-2f72-49e7-88b6-b7c7b995354b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:47:44.784491	\N	\N	19001	\N	\N	\N
05b43417-f8f9-4916-863b-d7ee78193c61	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:48:44.765207	\N	\N	19061	\N	\N	\N
bacb455c-a43b-4220-aef7-7f479228f5c6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:49:44.792688	\N	\N	19121	\N	\N	\N
f5d00c58-86e5-4a63-8670-58a0b8d856b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:50:44.782502	\N	\N	19181	\N	\N	\N
eb04c96c-002e-4965-9329-91b98ebbc38c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:51:44.771907	\N	\N	19241	\N	\N	\N
274af78f-5780-4844-a2a1-bfdec304896f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:52:44.754497	\N	\N	19301	\N	\N	\N
8e9f7f71-4c98-417b-87c1-1420bfac6b07	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:53:44.778139	\N	\N	19361	\N	\N	\N
39e9717c-f94a-41fb-ab7d-9c2e9c68f1ba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:54:44.771416	\N	\N	19421	\N	\N	\N
d5ba72be-f2bb-409e-9e43-7096ab59a424	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:55:44.767076	\N	\N	19481	\N	\N	\N
d505704d-9c44-4cd4-8275-9db5a9c91ca0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:56:44.758837	\N	\N	19541	\N	\N	\N
9b7d27c0-6017-4a48-9093-47db4813a8ed	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:57:44.759497	\N	\N	19601	\N	\N	\N
3ff8d5ed-b75f-4002-841d-8471f600d7f9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:58:44.766909	\N	\N	19661	\N	\N	\N
fbd37f72-02cf-4fc2-8496-733ae68931e8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 12:59:44.7828	\N	\N	19721	\N	\N	\N
69afd0c5-4fbd-4d55-aedf-53cd67867358	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:00:44.754717	\N	\N	19781	\N	\N	\N
24c00a13-fb71-40a2-96e3-68a1e63644e8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:01:44.763878	\N	\N	19841	\N	\N	\N
f4ebc756-26aa-4247-89ba-b027dcad9e3c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:02:44.765139	\N	\N	19901	\N	\N	\N
07e302db-fa03-4c69-b459-6730e4e6059f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:03:44.766824	\N	\N	19961	\N	\N	\N
0e06af0c-73c8-4cc3-8837-c9af9e1563aa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:04:44.760347	\N	\N	20021	\N	\N	\N
6612baf6-d61a-4927-afe4-d292be0c00ef	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:05:44.769313	\N	\N	20081	\N	\N	\N
83c4b15e-d302-4869-a6b9-0bea6217e77e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:06:44.761577	\N	\N	20141	\N	\N	\N
b846bc05-fca7-41ae-8d73-91584c64b6a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:07:44.775619	\N	\N	20201	\N	\N	\N
bad31b4f-fa94-459c-95da-8106034a9345	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:08:45.528419	\N	\N	20261	\N	\N	\N
61735b61-0546-48c6-916d-7010f8fd2dd0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:09:44.767412	\N	\N	20321	\N	\N	\N
a23dcaaa-77c4-471e-ab7e-5c02c7a41307	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:10:44.790716	\N	\N	20381	\N	\N	\N
0e88c705-a6c4-4139-bd0c-ecdda68d94b1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:11:44.761645	\N	\N	20441	\N	\N	\N
c33cd3c8-6fb0-4995-ae42-6fb7bafba3f0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:12:44.781024	\N	\N	20501	\N	\N	\N
a2e0c455-bf04-4711-8ea0-a73545e2ac13	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:13:44.788579	\N	\N	20561	\N	\N	\N
e051cb16-9073-444a-a0b2-3fa1bea941f9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:14:44.773969	\N	\N	20621	\N	\N	\N
75b4ad32-bbba-4580-8f8a-c9f47dade693	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:15:44.762094	\N	\N	20681	\N	\N	\N
e6149043-b93f-4fad-9875-2100af7aa4b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:16:45.080387	\N	\N	20741	\N	\N	\N
2d0680af-0f9f-4f8f-a221-1d88f40c5aba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:17:44.814018	\N	\N	20801	\N	\N	\N
1152bb0c-e2e1-4c13-b2f5-be398b2175e8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:18:44.760343	\N	\N	20861	\N	\N	\N
efc070a3-25b0-4550-b966-48d0602d47b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:19:44.796338	\N	\N	20921	\N	\N	\N
200f129d-7037-424b-a42b-5e47b87a78a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:20:44.762238	\N	\N	20981	\N	\N	\N
a8778a60-16e4-4717-9a58-ac6206b27449	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:21:44.782099	\N	\N	21041	\N	\N	\N
69ba98ff-20e0-4340-8633-a8667b0e1a7c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:22:44.755879	\N	\N	21101	\N	\N	\N
d2f53320-75c9-461d-89be-b76d07a58aca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:23:44.791345	\N	\N	21161	\N	\N	\N
dc2ef12c-34dd-47f8-ae46-c68908a03261	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:24:44.801183	\N	\N	21221	\N	\N	\N
e0e4c8f4-57bb-4d87-be13-3fe44fd74f61	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:25:44.787772	\N	\N	21281	\N	\N	\N
a78c7bc0-58bd-40d4-baea-9bb4bb23df93	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:26:44.799496	\N	\N	21341	\N	\N	\N
03ec6637-185b-4ee9-bb94-def4ee504830	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:27:44.756994	\N	\N	21401	\N	\N	\N
2ffd5578-c6ca-4e2b-aad7-f6fa6ecb2b19	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:28:44.770073	\N	\N	21461	\N	\N	\N
62880390-1713-4482-b908-10a20fa517bd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:29:44.775134	\N	\N	21521	\N	\N	\N
9617a772-b607-4983-8b22-561981152275	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:30:44.784565	\N	\N	21581	\N	\N	\N
d6a09113-d9e6-42e2-8a73-842f01f69ba9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:31:44.771934	\N	\N	21641	\N	\N	\N
6568d7b2-ae7a-4b68-9ff1-4463eae72044	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:32:44.778777	\N	\N	21701	\N	\N	\N
95acbfe9-1412-4b46-8f47-dc84179c5f89	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:33:44.786767	\N	\N	21761	\N	\N	\N
efdda142-fded-4cc6-a094-ccab0da73790	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:34:44.77122	\N	\N	21821	\N	\N	\N
9ee351ac-606a-4d86-a8ff-718ff7af0e08	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:35:44.77089	\N	\N	21881	\N	\N	\N
78ef220e-1d91-43c3-b3e5-ff725f59d7fd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:36:44.782978	\N	\N	21941	\N	\N	\N
ddfa149f-981d-4f22-ab09-5bed0ef24ea5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:37:44.777498	\N	\N	22001	\N	\N	\N
60238a2f-e9d6-48fe-a0cc-fdd026dbade8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:38:44.779965	\N	\N	22061	\N	\N	\N
10ff982d-76e8-4351-91f6-badb6b34b7df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:39:44.774934	\N	\N	22121	\N	\N	\N
af30f269-4c84-4983-903d-73dfbf5d0d8e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:40:44.78637	\N	\N	22181	\N	\N	\N
3581c8fd-27f7-49ce-a923-bc813c5232af	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:41:44.778187	\N	\N	22241	\N	\N	\N
2dd24a1f-343e-4939-9c05-c75620e0f603	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:42:44.772324	\N	\N	22301	\N	\N	\N
eae38bad-fe95-4fd7-85a8-11ea1fd7956d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:43:44.787926	\N	\N	22361	\N	\N	\N
6c8e32cd-efc1-4d11-a857-5ca1ab72b782	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:44:44.778869	\N	\N	22421	\N	\N	\N
9b51a421-9151-4762-aea2-476c095b198c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:45:44.780773	\N	\N	22481	\N	\N	\N
00df2475-31f2-46fd-b321-c4ee6ed7d6b1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:46:45.105079	\N	\N	22541	\N	\N	\N
4a452afc-812e-4a60-bb52-3a5e41af4a1b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:47:44.786389	\N	\N	22601	\N	\N	\N
0c37c3e9-0a6e-49ab-8571-676bff5016fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:48:44.827633	\N	\N	22661	\N	\N	\N
d4f554f2-5279-47a7-87d7-4b79eef8160b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:49:44.788745	\N	\N	22721	\N	\N	\N
e462cb3b-f56c-47f0-acbb-b611fbc9983b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:50:44.808181	\N	\N	22781	\N	\N	\N
9439f94b-ac32-4bf4-901e-34bd99e36582	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:51:44.827364	\N	\N	22841	\N	\N	\N
0ec902b5-3998-4ff7-b015-8f1f4ce9bbb7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:52:44.790518	\N	\N	22901	\N	\N	\N
797da9ec-3b29-432b-ba36-749c61c255b4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:53:44.859193	\N	\N	22961	\N	\N	\N
997ffabc-d0d5-45ae-a98b-97fdfd9eccf6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:54:44.798755	\N	\N	23021	\N	\N	\N
9701f514-4b4e-4cc9-8a31-90bacdd380d5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:55:44.802482	\N	\N	23081	\N	\N	\N
56dc8657-51f9-4c0d-97dc-c8e1cbca6180	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:56:44.78044	\N	\N	23141	\N	\N	\N
3d557de6-526c-45fe-a4f2-c4b82f6d5482	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:57:44.782941	\N	\N	23201	\N	\N	\N
90bd3cb0-ddc2-48be-85a1-da1d2552f85e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:58:44.788089	\N	\N	23261	\N	\N	\N
bd5e8456-c10d-4a5f-9578-197868e935b6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 13:59:44.821949	\N	\N	23321	\N	\N	\N
c2c2f419-e77d-4d1c-b8f5-7635bdf81fdd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:00:44.816216	\N	\N	23381	\N	\N	\N
1d5bfa7d-18ac-48b7-bf13-66d26d076144	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:01:44.886739	\N	\N	23441	\N	\N	\N
5a80a39d-1616-4274-b0f0-be12c2fd5031	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:02:44.771334	\N	\N	23501	\N	\N	\N
63596a4b-25a8-4e29-958a-1326abdd5c9b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:03:44.80154	\N	\N	23561	\N	\N	\N
9cf45562-b05e-45ca-b684-bb4fdb16d706	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:04:44.781393	\N	\N	23621	\N	\N	\N
6e1fe33b-bdaf-46d7-9fe9-f45ba986052e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:05:44.812209	\N	\N	23681	\N	\N	\N
c845cb10-b464-4c55-854e-4da1a26e421e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:06:44.824785	\N	\N	23741	\N	\N	\N
09552d79-2075-4ac3-8100-87696751e265	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:07:44.807946	\N	\N	23801	\N	\N	\N
db0857fc-b7f2-431a-9e6d-329d0b3c3f2d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:08:44.802955	\N	\N	23861	\N	\N	\N
659222e5-1978-494a-94ae-817ba98a8d6d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:09:44.808932	\N	\N	23921	\N	\N	\N
7eda9117-2eb9-4dbb-81ce-96befd768957	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:10:44.780933	\N	\N	23981	\N	\N	\N
adc3ce41-14ef-487e-9070-545a63aa00c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:11:44.799738	\N	\N	24041	\N	\N	\N
71882411-b5e1-4fee-abe2-db9efc776bbc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:12:44.783097	\N	\N	24101	\N	\N	\N
b5538d32-25d1-4ed8-829b-a3bf07ba29b1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:13:44.8458	\N	\N	24161	\N	\N	\N
d11847c3-2e4d-4afb-92c4-83376c597f9c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:14:44.782538	\N	\N	24221	\N	\N	\N
b1751c25-233d-442a-a251-d2b44bfa693b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:15:44.78321	\N	\N	24281	\N	\N	\N
55935e81-2b2f-41de-9fa5-e733b11cb44a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:16:45.088558	\N	\N	24341	\N	\N	\N
f5f31c6a-ffb1-4b99-962d-ce85df468d71	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:17:44.806944	\N	\N	24401	\N	\N	\N
77f5da38-77e9-44ad-982e-cf2e1fb96d6b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:18:44.792986	\N	\N	24461	\N	\N	\N
b80dc4b5-19b2-42bd-8b80-f9baf6821ac8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:19:44.785543	\N	\N	24521	\N	\N	\N
87842af3-8159-49a2-a0a3-b6eabe1e903e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:20:44.80832	\N	\N	24581	\N	\N	\N
c291e5ec-5d65-4f26-bf2b-095357774d41	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:21:44.808129	\N	\N	24641	\N	\N	\N
70d21946-f34d-4726-85e2-299f8cd611b5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:22:44.791115	\N	\N	24701	\N	\N	\N
68de064d-c701-4327-ba5d-40f7d6b3d8f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:24:44.899478	\N	\N	24821	\N	\N	\N
6df77a0f-653a-4862-b1ab-c96c5de798ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:25:44.823183	\N	\N	24881	\N	\N	\N
deb90657-35c7-4336-8e4d-a74de6a9db8c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:26:44.815435	\N	\N	24941	\N	\N	\N
2877f625-310a-4672-90d6-cbb7974fc980	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:27:44.820186	\N	\N	25001	\N	\N	\N
b4453585-4f24-44d3-9788-8f1deb9682f5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:28:44.829271	\N	\N	25061	\N	\N	\N
fc325288-7f7b-44e7-be35-6a6fb6a9a867	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:29:44.832939	\N	\N	25121	\N	\N	\N
bf685e0e-549c-479d-90ae-e5b04df53543	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:30:44.81803	\N	\N	25181	\N	\N	\N
c517fc64-dc66-4be7-91ab-0c5fcc10412e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:31:44.848951	\N	\N	25241	\N	\N	\N
0c765d26-4b3d-4f6b-a21b-602e7f6d37b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:32:44.825731	\N	\N	25301	\N	\N	\N
d3d7da76-157e-414f-bf09-1c5292f725a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:33:44.846918	\N	\N	25361	\N	\N	\N
4e634783-4856-4c54-acc1-27f8def61786	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:34:44.846427	\N	\N	25421	\N	\N	\N
91698722-1cc4-479b-b2de-28698dad62d6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:35:44.851513	\N	\N	25481	\N	\N	\N
5d2a3d08-db62-4bca-8934-15960a19d5fa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:36:44.856699	\N	\N	25541	\N	\N	\N
c05710ad-eda5-4219-9bec-44e4821685c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:37:44.880628	\N	\N	25601	\N	\N	\N
a7db2d6e-520e-4561-9f08-6d9798c36888	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:38:44.898618	\N	\N	25661	\N	\N	\N
6715edb8-0499-44d5-bb1d-cbe79f1d9363	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:39:44.85109	\N	\N	25721	\N	\N	\N
b224c71b-e8ac-4f45-a665-075ece288ece	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:40:44.841538	\N	\N	25781	\N	\N	\N
50483969-157a-4525-8f93-c2104957b9f2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:41:44.856008	\N	\N	25841	\N	\N	\N
dc44cd3d-3771-491a-b64a-79d859a00e9e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:42:44.851731	\N	\N	25901	\N	\N	\N
133b394b-a822-48a8-8640-b9aab9f664a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:43:44.84246	\N	\N	25961	\N	\N	\N
8059fd0c-2187-4c91-aec7-bd37b66f8289	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:44:44.877096	\N	\N	26021	\N	\N	\N
fd2bebde-42c1-4a8b-b5e1-b8d8b6d3268b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:45:44.854132	\N	\N	26081	\N	\N	\N
a9308d7f-f61d-4841-805d-cd90fbe9e3e8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:46:45.19016	\N	\N	26141	\N	\N	\N
7171f255-fa4a-4a03-9665-f2652df9b7a5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:47:44.847275	\N	\N	26201	\N	\N	\N
995718c1-b1ae-468a-965e-a19c90f020cc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:48:44.855627	\N	\N	26261	\N	\N	\N
152745c4-ab5c-4a46-91f1-11fcf679a011	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:49:44.851743	\N	\N	26321	\N	\N	\N
21e9d321-5e17-44f6-a003-b3d1a2db3782	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:50:44.852588	\N	\N	26381	\N	\N	\N
3e4b64ac-24e0-4797-bae3-a86cd2991566	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:51:44.874742	\N	\N	26441	\N	\N	\N
abc26801-3666-4ae0-8792-710ee1496ebb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:52:44.869111	\N	\N	26501	\N	\N	\N
9b6ee18c-6367-417b-be61-ad479135bf92	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:53:44.861673	\N	\N	26561	\N	\N	\N
fa6f396b-7189-45ca-91df-628bdcacee33	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:54:44.843806	\N	\N	26621	\N	\N	\N
6d8df3b5-aa2d-43fd-96ef-72445d251ede	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:55:44.8581	\N	\N	26681	\N	\N	\N
c1585384-4ec4-4327-ab92-2cddb6aeeea1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:56:44.860838	\N	\N	26741	\N	\N	\N
4c2f5335-949a-4c0b-9d51-84871ea918f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:57:44.911715	\N	\N	26801	\N	\N	\N
5352aded-a237-40f8-9d23-f75f883cabca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:58:44.951775	\N	\N	26861	\N	\N	\N
a6f4abfd-10cb-4130-9c21-8b951c2f010e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 14:59:44.942505	\N	\N	26921	\N	\N	\N
f0057ce7-0cf7-4625-9be6-a4b1edfce0be	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:00:44.82902	\N	\N	26981	\N	\N	\N
41109860-eb2f-4fb7-972c-2889648186cf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:01:44.85334	\N	\N	27041	\N	\N	\N
71ab877c-ae5c-475a-b1e2-dac90934abca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:02:44.849694	\N	\N	27101	\N	\N	\N
19c94721-444b-4e86-84e2-8e916a148fc5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:03:44.848106	\N	\N	27161	\N	\N	\N
ba08c2bf-d946-414b-b5ef-06f8f80198fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:04:44.880314	\N	\N	27221	\N	\N	\N
31d9ce61-6d77-4e99-8f4f-ed02efe03908	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:05:44.876368	\N	\N	27281	\N	\N	\N
03318e5c-e290-48a7-9acd-d7f6646564bc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:06:44.827062	\N	\N	27341	\N	\N	\N
f8728924-1152-4ad0-b79a-24139f4a06fa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:07:44.848405	\N	\N	27401	\N	\N	\N
ed482f84-04f5-4f48-ad32-40a1427e151a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:08:44.83732	\N	\N	27461	\N	\N	\N
3a7945e5-d927-43e6-b554-24bb97b5254d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:09:44.839178	\N	\N	27521	\N	\N	\N
4738bfbb-0b7d-4992-8e5e-fef0acf37630	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:10:44.846466	\N	\N	27581	\N	\N	\N
3278d2cc-7637-40e8-a305-0d831084be04	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:11:44.845151	\N	\N	27641	\N	\N	\N
8c507c2e-64ba-45a8-815a-a120ef4446a5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:12:44.829844	\N	\N	27701	\N	\N	\N
b8edf799-c76c-4893-8bc4-86a319083e8f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:13:44.849287	\N	\N	27761	\N	\N	\N
a216a91f-9719-49d9-a0ad-40443694ea6a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:14:44.832529	\N	\N	27821	\N	\N	\N
1ffc00a9-ced1-41b1-8a88-8eb4c8efc1d3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:15:44.832189	\N	\N	27881	\N	\N	\N
28fc7706-fa44-44bd-b7bc-3c0323a9c839	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:16:45.143177	\N	\N	27941	\N	\N	\N
a077211d-e25f-40b3-beb6-dcff849bbebb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:17:44.917571	\N	\N	28001	\N	\N	\N
cee0dfc5-68a8-4794-824b-8dbd3ea1c4f5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:18:44.836722	\N	\N	28061	\N	\N	\N
e0983dee-651b-43b2-b4d5-e509c53ec259	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:19:44.84289	\N	\N	28121	\N	\N	\N
7237d49c-f1e0-4770-825d-fa2a72e5265a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:20:44.826445	\N	\N	28181	\N	\N	\N
9b0d834d-13de-41b5-9e42-03ad427b1bb0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:21:44.829738	\N	\N	28241	\N	\N	\N
e6b71d0c-20b2-452d-89d7-c7472f0b6917	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:22:44.842452	\N	\N	28301	\N	\N	\N
c33913d5-9cd2-496e-b979-0e7eaffc7821	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:23:44.867808	\N	\N	28361	\N	\N	\N
8a2b73c7-78ae-4f11-a07b-76d999c46d24	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:24:44.845585	\N	\N	28421	\N	\N	\N
c353f37b-4f4c-4688-8048-2975a687f4d8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:25:44.861252	\N	\N	28481	\N	\N	\N
9de1b44a-3d2f-43f5-82d6-649cf40ebb59	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:26:44.845164	\N	\N	28541	\N	\N	\N
4eaada1c-f0cb-40db-918c-5d614cfc798d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:27:44.84741	\N	\N	28601	\N	\N	\N
ae5f72d3-fa08-4ac1-b0cc-631168cf2159	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:28:44.870248	\N	\N	28661	\N	\N	\N
f1544302-4a4c-4986-b80c-fa35e70e6747	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:29:44.863269	\N	\N	28721	\N	\N	\N
c8697b72-d452-4e7a-8873-a2fe4eed4292	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:30:44.871739	\N	\N	28781	\N	\N	\N
3d31017e-35fc-434e-958e-185b896d8916	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:31:44.840948	\N	\N	28841	\N	\N	\N
852cf70a-a478-4908-9efa-b71706abcd92	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:32:44.857146	\N	\N	28901	\N	\N	\N
c7e17abe-c8d8-4af4-9d74-23ea97cdee7c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:33:44.869672	\N	\N	28961	\N	\N	\N
560947e0-eea3-43ec-aede-f75633bfc3d0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:34:44.85336	\N	\N	29021	\N	\N	\N
39a0165e-8326-4e71-bbea-73cd58a85817	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:35:44.864914	\N	\N	29081	\N	\N	\N
23e72089-4961-4c29-864b-bd575ae3b550	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:36:44.843733	\N	\N	29141	\N	\N	\N
220de4de-7e15-4327-9ff8-de1ee4bf65fa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:37:44.831697	\N	\N	29201	\N	\N	\N
b70575d9-4c87-4e17-9b41-aa8df4f564b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:38:44.831194	\N	\N	29261	\N	\N	\N
83d83597-17f7-40af-b327-4be69b6f5909	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:39:44.867041	\N	\N	29321	\N	\N	\N
434e9180-9c23-4a1c-a1ca-5b6a86483143	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:40:44.841188	\N	\N	29381	\N	\N	\N
ce732458-5cc2-4419-83d8-d9180a00437e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:41:44.985133	\N	\N	29441	\N	\N	\N
ca841378-3b70-4d8a-8aa5-7eb45e05ac7f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:42:44.827542	\N	\N	29501	\N	\N	\N
0057ca83-deca-45b1-b3a0-b12cb33cd9af	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:43:44.860517	\N	\N	29561	\N	\N	\N
8e0693c7-fd49-4d61-a9c8-4106f5aadf7b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:44:44.84522	\N	\N	29621	\N	\N	\N
da2682cc-b5f8-4ab0-974e-bcbcc20f69d8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:45:44.853739	\N	\N	29681	\N	\N	\N
dcc9557b-1e80-414a-a08b-53da88506a3b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:46:45.196656	\N	\N	29741	\N	\N	\N
fe7514aa-27fe-4d95-968f-d7ac70020472	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:47:44.835355	\N	\N	29801	\N	\N	\N
48e05288-54fb-491a-ad79-984d0242a8df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:48:44.843765	\N	\N	29861	\N	\N	\N
8a58fe81-824d-412e-bef4-6585716df74a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:49:44.839116	\N	\N	29921	\N	\N	\N
5d01aa9f-49ed-471c-b4ff-65fcefbbcd5c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:50:44.858339	\N	\N	29981	\N	\N	\N
e29c0599-6ec8-4340-8c51-071f10e94819	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:51:44.84186	\N	\N	30041	\N	\N	\N
9b711901-c736-42ba-bb20-7e9306cb335a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:52:44.845265	\N	\N	30101	\N	\N	\N
77075bdc-43e3-4dc6-bab9-234c0c747923	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:53:44.846156	\N	\N	30161	\N	\N	\N
c3dee5e0-8aff-4e6a-881f-074e6ca8bf98	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:54:44.868744	\N	\N	30221	\N	\N	\N
5ecc5d61-a1c0-4bab-a476-cea7b527ba4c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:55:44.845242	\N	\N	30281	\N	\N	\N
7ef4ab71-45ab-476d-8cfe-901721b2a349	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:56:44.849874	\N	\N	30341	\N	\N	\N
1dbf5692-793d-4dea-8637-89959a41ee39	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:57:44.842843	\N	\N	30401	\N	\N	\N
648e52f9-0267-48b7-ba40-e07e041a89d8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:58:44.873278	\N	\N	30461	\N	\N	\N
187c0cb1-3362-4d3f-9403-ff1662aa726a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 15:59:44.858273	\N	\N	30521	\N	\N	\N
e9f5fc34-79b2-41b5-a00f-37a6bfccfd12	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:00:44.853097	\N	\N	30581	\N	\N	\N
97f66427-2a1d-4d09-b09f-54f244c839f6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:01:44.88191	\N	\N	30641	\N	\N	\N
15b63491-b4f6-46ce-9b7f-abb028cd8d0e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:02:44.852513	\N	\N	30701	\N	\N	\N
29e1061e-60cc-458c-beb3-29fdc22e0517	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:03:44.860655	\N	\N	30761	\N	\N	\N
2ded764b-1c69-4e9c-92ea-7c1092f64c46	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:04:44.862474	\N	\N	30821	\N	\N	\N
cc7488f1-b019-4150-acdb-ac1235aa9fb2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:05:44.839105	\N	\N	30881	\N	\N	\N
23e3463f-fa61-466c-a59e-d00cc0cd5dd0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:06:44.844998	\N	\N	30941	\N	\N	\N
88ef2177-495e-49e3-8c89-9825fd194c82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:07:44.845577	\N	\N	31001	\N	\N	\N
64b310ad-85fb-4775-bb72-f4c7ad6f75a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:08:44.830713	\N	\N	31061	\N	\N	\N
65f69b29-dffc-4a12-884b-b8f0c9ebb407	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:09:44.839542	\N	\N	31121	\N	\N	\N
45ff82a0-c947-47ce-a29b-5d1051fed0b9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:10:44.836755	\N	\N	31181	\N	\N	\N
6c760618-1605-4e4c-a26d-bd380006c431	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:11:44.836648	\N	\N	31241	\N	\N	\N
57930f36-b469-46ea-9020-24711f435c68	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:12:44.838004	\N	\N	31301	\N	\N	\N
40ac11bf-722c-4d66-80b6-5396e8dac259	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:13:44.843387	\N	\N	31361	\N	\N	\N
5cb7b084-505d-4aa5-9aad-022e2bf988f5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:14:44.835905	\N	\N	31421	\N	\N	\N
38a61d9e-cfa5-4022-8a09-b1ca135deeea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:15:44.833466	\N	\N	31481	\N	\N	\N
1c17d569-e469-4149-9cf4-4a0d2256f9ef	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:16:45.1525	\N	\N	31541	\N	\N	\N
60e276e2-18bd-48cb-8d0a-13c2905f9e89	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:17:44.840308	\N	\N	31601	\N	\N	\N
c3f6a7d0-1537-42e9-a688-d9a8ca6e2ba3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:18:44.843786	\N	\N	31661	\N	\N	\N
ce436018-a0b5-4550-b911-23e2d9edba8a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:19:44.83353	\N	\N	31721	\N	\N	\N
0752910b-373c-4269-848f-f99a6fce6706	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:20:44.834588	\N	\N	31781	\N	\N	\N
1629b9ba-ca31-44cb-836a-1ef5391c3748	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:21:44.849155	\N	\N	31841	\N	\N	\N
ae4a045e-74ef-4118-bec9-939099b2ab21	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:22:44.839564	\N	\N	31901	\N	\N	\N
f6607ae9-15d7-400c-afc7-97f388c1619a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:23:44.842507	\N	\N	31961	\N	\N	\N
34c72739-4ae5-4219-a96f-4dccb08e68a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:24:44.850743	\N	\N	32021	\N	\N	\N
6e029e4d-e218-4f3c-a906-d940cf46bdad	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:25:44.858894	\N	\N	32081	\N	\N	\N
68795f88-e064-4147-a0a7-1d2047e20473	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:26:44.84457	\N	\N	32141	\N	\N	\N
0cc2fd24-f887-4b0b-a4de-87fe275ae7c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:27:44.84277	\N	\N	32201	\N	\N	\N
2061327c-37dd-4df2-82eb-5ff1f768ad16	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:28:44.847046	\N	\N	32261	\N	\N	\N
76d07744-b256-4836-97d2-4e430603555e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:29:44.84992	\N	\N	32321	\N	\N	\N
03ec8516-5801-4332-a6bd-0b8f687f8433	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:30:44.846363	\N	\N	32381	\N	\N	\N
6f2fa41f-7ab2-40c3-a617-81fe0d8fd614	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:31:44.844477	\N	\N	32441	\N	\N	\N
3a4d6b51-c931-4925-92a5-3343c22c8c89	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:32:44.857293	\N	\N	32501	\N	\N	\N
11005046-204c-41ec-818f-b49fd1f8ab4a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:33:44.839641	\N	\N	32561	\N	\N	\N
b0a17747-051a-4b76-aebb-ddcb084e4774	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:34:44.856387	\N	\N	32621	\N	\N	\N
7db12131-a59a-4290-aead-40d186aaaa45	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 16:35:44.844001	\N	\N	32681	\N	\N	\N
273819f1-ef4d-47b5-9556-a55576d5617f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 17:48:17.010582	\N	\N	32921	\N	\N	\N
0275ae67-242f-4da4-b4e9-5d5e826e96f3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-23 17:51:57.836854	\N	\N	32981	\N	\N	\N
843314e3-ac68-425c-b68c-141c16a2d700	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:48:20.81685	\N	\N	47981	\N	\N	\N
651c5980-a227-466b-b453-b5b1a81aee9b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:49:20.53689	\N	\N	48041	\N	\N	\N
14a33efc-5f4e-4c38-8bef-dbda205aa591	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:50:20.529151	\N	\N	48101	\N	\N	\N
e960754a-103d-4093-9f57-668f74011bc8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:51:20.527859	\N	\N	48161	\N	\N	\N
b28eb80b-96e2-48a0-90fc-a92c4f962535	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:52:20.531077	\N	\N	48221	\N	\N	\N
568bf434-e9fa-49ff-98bd-864d7506bc87	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:53:20.526739	\N	\N	48281	\N	\N	\N
c06bd89b-900d-4fa7-b76a-41ed4578aba8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:54:20.513676	\N	\N	48341	\N	\N	\N
9ad4de4e-e675-4291-ba96-93d46b3d6d50	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:55:20.514084	\N	\N	48401	\N	\N	\N
8cd8d407-b9d3-47ac-a244-8eadf7c8d1c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:56:20.520373	\N	\N	48461	\N	\N	\N
1a76a1d3-c3f6-46e6-8a91-a88fb8a52f84	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:57:20.527246	\N	\N	48521	\N	\N	\N
2f79bc15-0f6e-49a9-b237-04a2f26fcd46	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:58:20.520448	\N	\N	48581	\N	\N	\N
bdcdd6e0-ae9e-4dbc-bd27-f0221d0cdbdd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 09:59:20.522478	\N	\N	48641	\N	\N	\N
78b855c2-eb9b-4378-85e4-45445903dab1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:00:20.534734	\N	\N	48701	\N	\N	\N
9c01186d-f9b9-4523-bd71-ac96c796f5b6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:01:20.528886	\N	\N	48761	\N	\N	\N
7b4f16ea-678c-484b-bc76-bd72d2679b5b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:02:20.52188	\N	\N	48821	\N	\N	\N
ae964df4-4e99-4ebd-bad7-81884debd0fe	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:03:20.536166	\N	\N	48881	\N	\N	\N
1a87c167-c394-4433-92bb-c8ea040cb73f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:04:20.520521	\N	\N	48941	\N	\N	\N
3422d3f6-d985-4a9f-812e-d6f85ad86f03	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:05:20.525408	\N	\N	49001	\N	\N	\N
9c2650e1-1308-49e1-a311-f12c6762f8b1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:06:20.523136	\N	\N	49061	\N	\N	\N
023d92f4-862c-49a2-9a68-a171131c0e75	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:07:20.523022	\N	\N	49121	\N	\N	\N
06f9eb84-c266-4a03-93bc-5b83f051c0ab	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:08:20.527416	\N	\N	49181	\N	\N	\N
3254c517-8c79-4077-ba62-09c4ba321f09	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:09:20.516494	\N	\N	49241	\N	\N	\N
dc6aec36-eb60-4408-acd2-10ce7267c0e4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:10:20.518458	\N	\N	49301	\N	\N	\N
3e269fb5-64fd-4f26-bc49-f4d915796ad3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:11:20.521326	\N	\N	49361	\N	\N	\N
6aa2444c-c147-44b3-acf2-977dacdeb1e5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:12:20.520444	\N	\N	49421	\N	\N	\N
7dd09bb0-0698-4fd4-a163-006eec7cc91f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:13:20.520888	\N	\N	49481	\N	\N	\N
362ae0d1-ee1c-4961-b1f2-790072a5d98f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:14:20.852208	\N	\N	49541	\N	\N	\N
c555ae40-ad9f-4e01-b3b4-fb6962f7f00a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:15:20.527707	\N	\N	49601	\N	\N	\N
47e8b5fd-f757-4843-80ed-1dc219771709	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:16:20.520022	\N	\N	49661	\N	\N	\N
05ef0124-d70b-4a06-8b6e-dcb431aa2177	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:17:20.517658	\N	\N	49721	\N	\N	\N
7de6d890-916b-49be-ac1d-43d12933dc8e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:18:20.517118	\N	\N	49781	\N	\N	\N
1f01134d-22ee-49c3-b8af-2af51a1dd5de	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:19:20.527014	\N	\N	49841	\N	\N	\N
2679965b-6606-483d-a941-4b1e5950f1aa	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:20:20.521262	\N	\N	49901	\N	\N	\N
019e463b-4448-49e5-a9e2-a06f83620c47	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:21:20.536197	\N	\N	49961	\N	\N	\N
5b8d9143-27f9-4787-b493-a2e6dbc231c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:22:20.520322	\N	\N	50021	\N	\N	\N
9c0e9b5c-3c8e-4877-925a-ab7de4506f17	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:23:20.521271	\N	\N	50081	\N	\N	\N
1d37ff29-4c9b-4e45-9ad4-a6ceeec93774	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:24:20.517852	\N	\N	50141	\N	\N	\N
17ff7bb2-c4f4-495b-97dc-003813f7ad65	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:25:20.52331	\N	\N	50201	\N	\N	\N
ebbf540f-4617-43ae-8dfe-5b19df431485	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:26:20.515481	\N	\N	50261	\N	\N	\N
683188b3-78d6-47b4-a4d4-756125314019	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:27:20.532361	\N	\N	50321	\N	\N	\N
ef90c90e-6281-4baa-9162-93b4698a8026	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:28:20.523253	\N	\N	50381	\N	\N	\N
adbf9ac6-c8b2-4dab-8488-cf87144c2159	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:29:20.525817	\N	\N	50441	\N	\N	\N
a0b27fdd-3456-4e34-9980-81a4820fc9f1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:30:20.526595	\N	\N	50501	\N	\N	\N
a2740141-d0ff-43db-9032-2562ae41b52e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:31:20.539381	\N	\N	50561	\N	\N	\N
188ddaa2-58a6-4586-b1ef-989fea452818	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:32:20.529684	\N	\N	50621	\N	\N	\N
b1b1c9ea-ee96-4e56-b494-080733c448ca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:33:20.53132	\N	\N	50681	\N	\N	\N
1367ca53-2af8-44e5-bc5e-13ed38763061	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:34:20.526689	\N	\N	50741	\N	\N	\N
742a3f13-e96d-4c95-9077-8cf9f3bfe9a0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:35:20.533373	\N	\N	50801	\N	\N	\N
4b086bd3-d5da-41cf-a51c-f04bce2ed76b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:36:20.530154	\N	\N	50861	\N	\N	\N
b98f5004-eea0-4148-935e-3d47161eb90f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:37:20.525759	\N	\N	50921	\N	\N	\N
0355f5a6-0700-425b-996c-6a797b9ea8e7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:38:20.528816	\N	\N	50981	\N	\N	\N
bf344e4a-766e-44fc-bdd8-b95a8d17da51	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:39:20.542323	\N	\N	51041	\N	\N	\N
931315d5-aae0-46fa-9caa-04d0108758bf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:40:20.530218	\N	\N	51101	\N	\N	\N
5c5f9672-c815-4045-98ef-df3224538b20	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:41:20.53537	\N	\N	51161	\N	\N	\N
91532c4a-ab82-4020-9fa6-1718208333e7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:42:20.520263	\N	\N	51221	\N	\N	\N
9d5ad30b-6c9b-4da9-8331-ba47228f958b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:43:20.541132	\N	\N	51281	\N	\N	\N
6d1cf0ef-d395-4ba9-a083-61d276f9ff25	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:44:20.841285	\N	\N	51341	\N	\N	\N
a00faf36-684a-470f-82d7-ae3988c64723	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:45:20.543406	\N	\N	51401	\N	\N	\N
ef8d75f1-2f1e-4017-be86-ec74bece948f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:46:20.544469	\N	\N	51461	\N	\N	\N
d3ba03ab-eaeb-4237-8d38-34ffd2bc2abd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:47:20.552092	\N	\N	51521	\N	\N	\N
3dce5d05-5d96-464c-bfd9-9d5bdf24a2ed	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:48:20.550334	\N	\N	51581	\N	\N	\N
7e0d8fc6-6d21-4332-853f-71428a360501	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:49:20.545106	\N	\N	51641	\N	\N	\N
79152746-fe89-4afa-9f37-6df25e1ae57d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:50:20.536133	\N	\N	51701	\N	\N	\N
6a68aab4-f66d-4d5b-bfc6-4ef130b0957d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:51:20.539411	\N	\N	51761	\N	\N	\N
1fc4eda8-12f6-4e5e-a33f-1976a12bea54	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:52:20.847804	\N	\N	51821	\N	\N	\N
97e14c6a-d3c2-47e7-82d6-caccf8daacbc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:53:20.549461	\N	\N	51881	\N	\N	\N
ef952d5b-4d7b-454c-8b75-3e956e53a941	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:54:20.533711	\N	\N	51941	\N	\N	\N
e6a1ae52-e26f-4b66-b102-9b28fa994f30	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:55:20.543634	\N	\N	52001	\N	\N	\N
97038274-107b-4b51-9d85-e950623e52de	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:56:20.530139	\N	\N	52061	\N	\N	\N
9d5cbc53-66be-4d19-a291-a9c7ab2eaaf4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:57:20.54504	\N	\N	52121	\N	\N	\N
ec15a73c-bc96-4e19-b3fb-b19887780cad	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:58:20.539168	\N	\N	52181	\N	\N	\N
ba4bb1c5-24dc-4cea-b7a2-ac03524f457d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 10:59:20.557238	\N	\N	52241	\N	\N	\N
314e3c7c-f679-426a-8267-e0a0c52dfd5b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:00:20.54549	\N	\N	52301	\N	\N	\N
e64145d5-07a6-46ac-ae02-c5b5b4360d13	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:01:20.556517	\N	\N	52361	\N	\N	\N
e5c8bbbc-c2c2-41a2-82e6-9433549330fd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:02:20.544435	\N	\N	52421	\N	\N	\N
ca8fa1f4-9387-43bb-a6d0-cf832a8a37cf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:03:20.563071	\N	\N	52481	\N	\N	\N
b61ecd94-07de-42e1-870d-c17577a6bbc0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:04:20.535438	\N	\N	52541	\N	\N	\N
5dc5bb4c-a5c4-4368-aa60-6230b08250bf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:05:20.531903	\N	\N	52601	\N	\N	\N
8ae070b7-09d8-4ca6-b296-a1445f5427e9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:06:20.532883	\N	\N	52661	\N	\N	\N
20ec3319-f09b-4875-bc45-82d8cc0732ca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:07:20.553294	\N	\N	52721	\N	\N	\N
5204c093-b369-49a3-ba51-08cdc4e91759	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:08:20.535714	\N	\N	52781	\N	\N	\N
12f754ac-adf9-4500-8dca-751664ff9022	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:09:20.555278	\N	\N	52841	\N	\N	\N
cfbe97e1-d375-48e4-87fd-f1e6ec3154d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:10:20.550464	\N	\N	52901	\N	\N	\N
94fc6b8a-7a46-4420-9528-ce38da9b1e47	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:11:20.537922	\N	\N	52961	\N	\N	\N
0852b5bb-40b1-49bb-bc94-873042bc11d9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:12:20.538453	\N	\N	53021	\N	\N	\N
abf7c431-a5ce-4931-97d3-9603a8e9e00e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:13:12.494973	\N	\N	37	\N	\N	\N
642ae5fd-c9ba-44c7-8923-01d6ca192c54	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:13:42.885518	\N	\N	67	\N	\N	\N
38881d52-d0a7-4a87-9d70-58085a2d36f3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:14:12.508813	\N	\N	97	\N	\N	\N
493fdeca-871e-40fc-b723-b9df8e1242e9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:14:42.498474	\N	\N	127	\N	\N	\N
c65f52cd-a217-4b56-8f9e-34f9fc5c05ea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:15:12.501225	\N	\N	157	\N	\N	\N
bd9f60ba-c2a7-4c58-8b15-27143f12ebc6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:15:42.502962	\N	\N	187	\N	\N	\N
c33b4871-b7e3-4956-9712-1422d2786fe3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:16:12.504005	\N	\N	217	\N	\N	\N
99a6f83e-c4a4-4a94-98bb-adf473016969	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:16:42.49943	\N	\N	247	\N	\N	\N
65782bce-4112-46de-9440-f4e3dc4423c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:17:12.509614	\N	\N	277	\N	\N	\N
8cb2df81-f7ab-4921-8935-56f96b1da796	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:18:20.533644	\N	\N	345	\N	\N	\N
9d4aa5f9-ed49-471e-96a9-b0e92a5c77bb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:19:20.530144	\N	\N	405	\N	\N	\N
992eefb1-44b6-44d8-a81d-6ccc79fbe6e2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:20:20.534256	\N	\N	465	\N	\N	\N
be3045da-33dc-426d-8ab4-a9c97c6f2b22	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:21:20.533721	\N	\N	525	\N	\N	\N
353403a7-0c8c-42ce-a92a-f8150809b921	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:22:20.537434	\N	\N	585	\N	\N	\N
0b2302c0-13a0-43e1-9b88-1f0acb80e95c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:23:20.53424	\N	\N	645	\N	\N	\N
978d0e52-f1d6-4e9c-9a13-5ceb810c81f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:24:20.539444	\N	\N	705	\N	\N	\N
40a193f8-f533-4f07-8b5b-f777c4cca1dc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:25:20.534624	\N	\N	765	\N	\N	\N
0ee60561-f6d0-4514-869c-aa10a03fe865	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:26:20.537948	\N	\N	825	\N	\N	\N
dd55831d-82d0-4d61-9158-54a52fc57f3e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:27:20.534495	\N	\N	885	\N	\N	\N
f306ba03-c594-4b09-8d48-48e65c987ac8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:28:20.534598	\N	\N	945	\N	\N	\N
031e8b2a-aa72-4c66-9a41-e2423b45789e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:29:20.538321	\N	\N	1005	\N	\N	\N
3b98ecad-3f85-483b-9bcb-99c7e749aac6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:30:20.539423	\N	\N	1065	\N	\N	\N
c99356ab-b0fd-4840-b4d3-638a28985e44	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:31:20.534751	\N	\N	1125	\N	\N	\N
20ff72b2-dea2-4e5e-8497-38417ed44306	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:32:20.535781	\N	\N	1185	\N	\N	\N
e9f8068a-764b-4d89-9dfd-d989814cafa2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:33:20.530607	\N	\N	1245	\N	\N	\N
05d6b047-cec2-4705-ac43-bb00144fe96c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:34:20.542116	\N	\N	1305	\N	\N	\N
c86f591a-ab91-4356-b637-80cd9e017100	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:35:20.536946	\N	\N	1365	\N	\N	\N
32766842-129e-454f-8425-d9b2867e21e1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:36:20.542337	\N	\N	1425	\N	\N	\N
2ee0490c-d5ad-4166-864b-4fc479a57580	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:37:20.538428	\N	\N	1485	\N	\N	\N
4ab27ed0-fec4-4152-a435-025e6215f70f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:38:20.534367	\N	\N	1545	\N	\N	\N
436b2a33-ca59-4aa7-88f8-f2d46b7d76a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:39:20.548122	\N	\N	1605	\N	\N	\N
7540cf87-6669-4ca9-9e59-1f42ecc71f52	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:40:20.538636	\N	\N	1665	\N	\N	\N
409ccc1e-3190-4423-9848-8c36daf92dc6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:41:20.540681	\N	\N	1725	\N	\N	\N
33e50e0f-d632-4154-9f83-b00e56959ea4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:42:20.536904	\N	\N	1785	\N	\N	\N
bfaa9255-13d4-4d3b-a64a-657bc4de8f57	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:43:20.544278	\N	\N	1845	\N	\N	\N
326aead1-ec84-44e7-ad12-7e10d113dafd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:44:20.855454	\N	\N	1905	\N	\N	\N
21b9ff0e-2441-4c41-a031-606f63d59b3d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:45:20.540367	\N	\N	1965	\N	\N	\N
fe824364-a29e-4795-8e1a-03e056113eb3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:46:20.543022	\N	\N	2025	\N	\N	\N
826f5747-f129-4424-af06-d6eb85817737	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:47:20.539619	\N	\N	2085	\N	\N	\N
ba8ebd4a-25d0-403b-85fe-d27a10e5273d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:48:20.556013	\N	\N	2145	\N	\N	\N
da60e66f-1475-4468-803e-5a7b19101e86	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:49:20.541677	\N	\N	2205	\N	\N	\N
14d5322d-b8b0-424d-af9e-e6ffdb4353dd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:50:20.53979	\N	\N	2265	\N	\N	\N
9d869a82-17eb-4ef8-875b-1d12cbef7152	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:51:20.556616	\N	\N	2325	\N	\N	\N
a6ecadb4-4b82-451c-9834-26245574cc1f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:52:20.543145	\N	\N	2385	\N	\N	\N
f4346887-cd5f-4383-8660-2b40ef971fc4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:53:21.534767	\N	\N	2445	\N	\N	\N
b495a181-93b8-4833-ba2d-cba9a964f3b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:54:20.546106	\N	\N	2505	\N	\N	\N
5ed8067b-cf5b-48ff-8030-61765c0c80c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:55:20.542606	\N	\N	2565	\N	\N	\N
88cefa6d-a975-4fdd-ba28-3d592841ee5d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:56:20.544445	\N	\N	2625	\N	\N	\N
da48dd22-8368-4a04-8038-a6990afdbc36	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:57:20.543892	\N	\N	2685	\N	\N	\N
4f8ae46a-5f23-4e76-b0eb-02d13fe2d9cf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:58:20.562833	\N	\N	2745	\N	\N	\N
2e1899d0-5217-4561-8ecb-d4c62771d5c4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 11:59:20.545466	\N	\N	2805	\N	\N	\N
ee5d39b7-3f96-41e8-9fe4-f3cbd4a2631c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:00:20.54162	\N	\N	2865	\N	\N	\N
cd756f6e-c5b1-4508-bf2a-3eba811703a8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:01:20.543523	\N	\N	2925	\N	\N	\N
7adb0a08-54c7-4a14-ac00-b13b85559191	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:02:20.546883	\N	\N	2985	\N	\N	\N
037be0b4-0485-4c36-b0ba-830c7e46094c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:03:20.54387	\N	\N	3045	\N	\N	\N
f43ad514-c54b-46f9-b51a-6422bcf96745	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:04:20.546299	\N	\N	3105	\N	\N	\N
fc828a2e-03f5-46a1-8ec5-01e0aaf40f73	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:05:20.552927	\N	\N	3165	\N	\N	\N
f7ff7faf-d5e0-460f-82e6-2fea4f09860d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:06:20.540265	\N	\N	3225	\N	\N	\N
224aee2b-32d4-4876-8786-65509f14f329	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:07:20.551599	\N	\N	3285	\N	\N	\N
962ecb37-9cd0-471d-9472-04b5b5fff588	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:08:20.560247	\N	\N	3345	\N	\N	\N
7161709c-a6be-40a7-8d9a-aeda23a99d99	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:09:20.547256	\N	\N	3405	\N	\N	\N
b9856390-8656-4985-b0f5-8d5575b9adca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:10:20.546246	\N	\N	3465	\N	\N	\N
46d28c13-8f4e-40fa-a6ad-6588e0cd4eef	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:11:20.562416	\N	\N	3525	\N	\N	\N
e003bfc7-9a8c-427b-a549-f6fe6486f32e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:12:20.551484	\N	\N	3585	\N	\N	\N
f95d13cb-45d6-4bd1-a3d9-ad11fa3848c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:13:20.549777	\N	\N	3645	\N	\N	\N
fef74e5a-6fd3-4cdb-bf40-703d022596a4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:14:20.911688	\N	\N	3705	\N	\N	\N
3a6db0d7-153f-48ed-88f9-d1e49a47ade6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:15:20.548039	\N	\N	3765	\N	\N	\N
49c0b607-8580-422c-86f3-c52cd24de1c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:16:20.548905	\N	\N	3825	\N	\N	\N
948999a3-ff59-4050-922a-0f3f31a73dc1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:17:20.543071	\N	\N	3885	\N	\N	\N
3cecef9b-106b-4ad4-8e79-8838fdee8510	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:18:20.550532	\N	\N	3945	\N	\N	\N
81f285de-c2f1-481f-8292-e88d768a7d21	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:19:20.559418	\N	\N	4005	\N	\N	\N
98a96d57-e152-43dc-96b6-5a65a6e7af24	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:20:20.548799	\N	\N	4065	\N	\N	\N
cc06c5a6-0528-48e2-ae73-7ce52e3838cd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:21:20.558051	\N	\N	4125	\N	\N	\N
cf7cf462-e987-4bec-acf7-68c66681e6d2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:22:20.552803	\N	\N	4185	\N	\N	\N
d18bc6e3-5f54-484f-8dcf-22ed93ef2640	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:23:20.559636	\N	\N	4245	\N	\N	\N
b5c7e193-9087-457c-874d-43e7c8c62669	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:24:20.550447	\N	\N	4305	\N	\N	\N
091db8a8-9612-47de-92ed-52c1cf41f837	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:25:20.55013	\N	\N	4365	\N	\N	\N
64d48b59-830d-4749-b41a-ce3b6f98f2ff	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:26:20.551237	\N	\N	4425	\N	\N	\N
93ea1349-4d4f-42b4-ad00-4cb115761032	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:27:20.556567	\N	\N	4485	\N	\N	\N
1b21a590-44eb-4e7d-b481-407dce240278	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:28:20.554803	\N	\N	4545	\N	\N	\N
3d14da3c-9a07-4092-9d48-f4d7cb604fc0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:29:20.55687	\N	\N	4605	\N	\N	\N
a301ffe9-4eb4-4241-a18d-d3677cbffb30	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:30:20.554303	\N	\N	4665	\N	\N	\N
e442df5b-c0c5-4ebd-bba9-2145781baed8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:31:20.550456	\N	\N	4725	\N	\N	\N
1f6246f3-2a7e-4a08-b8b3-c09984fac651	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:32:20.565078	\N	\N	4785	\N	\N	\N
a366c868-e473-44ee-8387-b25a896795ee	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:33:20.555407	\N	\N	4845	\N	\N	\N
e5963c7e-33df-4feb-87e1-643d737d35f6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:34:20.557131	\N	\N	4905	\N	\N	\N
10e918d0-a0cf-4b97-baac-885f5d658757	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:35:20.554806	\N	\N	4965	\N	\N	\N
5921482d-273b-42c9-b88d-a64ee763985e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:36:20.558015	\N	\N	5025	\N	\N	\N
0c7bd8b2-c8f5-47b9-94bb-57e1e53f3041	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:37:20.550862	\N	\N	5085	\N	\N	\N
070580e4-992e-4838-9db0-b5dd2a5bfd12	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:38:20.564032	\N	\N	5145	\N	\N	\N
3bdeb97a-f7ec-4bdc-a50d-47e5c297856e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:39:20.56032	\N	\N	5205	\N	\N	\N
997e4d2f-8a36-4566-b44b-6c1114b6ebf5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:40:20.559224	\N	\N	5265	\N	\N	\N
2276c210-33f8-4804-924e-ba4f9ab8ec40	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:41:20.568046	\N	\N	5325	\N	\N	\N
eeec5c24-a3a7-4c7b-99a4-c5300a3f45fc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:42:20.566613	\N	\N	5385	\N	\N	\N
f3e1856a-2198-474b-adcf-5bb0d69aaa2c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:43:20.557847	\N	\N	5445	\N	\N	\N
08ca52a4-36e1-4488-b2fb-0e34e079e3c6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:44:20.990148	\N	\N	5505	\N	\N	\N
ee697a65-2625-478f-8895-340cb00f610f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:45:20.565415	\N	\N	5565	\N	\N	\N
cc058923-f2cc-4048-b09c-4d5ddbb364a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:46:20.556636	\N	\N	5625	\N	\N	\N
f61e3ff2-a199-4ea6-8a86-b5d805d5e13f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:47:20.560798	\N	\N	5685	\N	\N	\N
19d2bda8-8094-4880-a1cd-abe49825ac23	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:48:20.552861	\N	\N	5745	\N	\N	\N
1c3f7ca4-8601-4540-9d7c-3a4a9460db1d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:49:20.562728	\N	\N	5805	\N	\N	\N
f0d5c184-cc3b-4ec8-b472-1fd6b51d6769	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:50:20.564398	\N	\N	5865	\N	\N	\N
ed7760ec-638a-4822-a8a8-dfafdd99bd64	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:51:20.568493	\N	\N	5925	\N	\N	\N
d11e1ecb-941b-46ca-8d4f-79f7ba1f511f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:52:20.563819	\N	\N	5985	\N	\N	\N
5595b959-a8ac-433d-81c1-c40bc64e6226	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:53:20.567835	\N	\N	6045	\N	\N	\N
3de08655-cc52-4a25-856a-0e670996f617	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:54:20.567909	\N	\N	6105	\N	\N	\N
61d8caf6-5034-4e0e-aa2d-3b08c2a02e3b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:55:20.570312	\N	\N	6165	\N	\N	\N
3b0b7fde-65ce-4bc4-9920-80bab4dbc349	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:56:20.572822	\N	\N	6225	\N	\N	\N
12f6bf92-bded-4c0d-9f27-abf856c9dd11	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:57:20.567622	\N	\N	6285	\N	\N	\N
e118c4b9-4eef-44ba-bb90-5fce8235c0e6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:58:20.565781	\N	\N	6345	\N	\N	\N
17ae9abc-3390-4e14-b558-120269c4bc8e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 12:59:20.567506	\N	\N	6405	\N	\N	\N
7c94c168-9826-4008-94a9-e2c0d04a2cb9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:00:20.564056	\N	\N	6465	\N	\N	\N
4dd1b5e5-47d2-451e-86ea-9cd7fb280ef7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:01:20.5706	\N	\N	6525	\N	\N	\N
7a694eff-5182-4e5e-b5c8-adf90faed10d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:02:20.575353	\N	\N	6585	\N	\N	\N
b3181d89-8b73-47c5-8cf1-ec973e9aea19	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:03:20.572989	\N	\N	6645	\N	\N	\N
5e7df43c-15ee-4514-add2-2d1b223a6556	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:04:20.573329	\N	\N	6705	\N	\N	\N
c9392613-4c2f-465e-b7ad-3f892c54c9f9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:05:20.574012	\N	\N	6765	\N	\N	\N
dbf9fff2-22b2-40eb-b2e7-f703befb5c48	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:06:20.566217	\N	\N	6825	\N	\N	\N
1ddf05b5-3125-4b43-8597-694e0f7e506c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:07:20.574376	\N	\N	6885	\N	\N	\N
daca39ad-c54b-43c0-892a-2004964c6333	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:08:20.569334	\N	\N	6945	\N	\N	\N
5d657d9b-fe53-4636-bc35-2f90756bfab7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:09:20.568177	\N	\N	7005	\N	\N	\N
0bf12b2d-9ed6-457d-a80e-b17207ccd502	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:10:20.877609	\N	\N	7065	\N	\N	\N
66d5e46a-f2c1-4113-bbca-3b0683b3064d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:11:20.569423	\N	\N	7125	\N	\N	\N
7a51074e-20ef-4288-a5d0-fc21802147ce	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:12:20.574372	\N	\N	7185	\N	\N	\N
561fe17c-6380-47a2-bb3a-c7eabe078205	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:13:20.571346	\N	\N	7245	\N	\N	\N
95004013-da25-4d28-9b07-8dd0ff3d407c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:14:20.888069	\N	\N	7305	\N	\N	\N
c330aecc-c9a4-431a-8cd1-f965530e3e81	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:15:20.570633	\N	\N	7365	\N	\N	\N
77b92f52-f0e5-4f40-a81a-79c3bac17da9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:16:20.576079	\N	\N	7425	\N	\N	\N
24720191-b659-4435-9230-5cd3d24a95a4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:17:20.57219	\N	\N	7485	\N	\N	\N
01568ca6-ef2a-4ba0-ba68-f4465da1668d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:18:20.573031	\N	\N	7545	\N	\N	\N
1deee5dd-6c17-49e0-ab30-63e00367d148	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:19:20.578638	\N	\N	7605	\N	\N	\N
87c3d91f-c7bd-4a3d-9a8f-2e9dfec7698e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:20:20.571088	\N	\N	7665	\N	\N	\N
93852d1a-6d4c-40ff-8f49-3aad4ced22b9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:21:20.574791	\N	\N	7725	\N	\N	\N
9447d50a-065c-4adc-b3ea-6f6c5d3686d6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:22:20.878421	\N	\N	7785	\N	\N	\N
c066088e-e039-43a3-8780-4d34a01cfb91	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:23:20.589018	\N	\N	7845	\N	\N	\N
275aff87-fcc9-4e9d-ac0c-91699988cf75	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:24:20.572816	\N	\N	7905	\N	\N	\N
aef9c6de-96ee-4a8a-813e-f33f51381bf9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:25:20.57731	\N	\N	7965	\N	\N	\N
69a13c7f-060f-4f41-bcb2-b0090fcf8fb0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:26:20.571408	\N	\N	8025	\N	\N	\N
3c8e3652-b132-43c9-8531-3918b1e689c6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:27:20.575076	\N	\N	8085	\N	\N	\N
d576d86e-7f7a-47c6-a175-84d867ecb3de	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:28:20.58099	\N	\N	8145	\N	\N	\N
2add99b7-3578-46e9-8849-576c53d066a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:29:20.583452	\N	\N	8205	\N	\N	\N
8ececb63-7365-4790-8dd3-773b8334f228	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:30:20.588566	\N	\N	8265	\N	\N	\N
6bf890e4-0f50-4fa7-a62a-13e7eb5e7e32	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:31:20.589384	\N	\N	8325	\N	\N	\N
215cb76a-bc81-42f2-aecc-10f549bc5703	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:32:20.574426	\N	\N	8385	\N	\N	\N
dba90a77-2410-4c05-951b-1206ecb9537a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:33:20.579807	\N	\N	8445	\N	\N	\N
11c67a77-5874-461c-b703-3a1a13e53869	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:34:20.579563	\N	\N	8505	\N	\N	\N
ef96cef4-72ac-4dec-8ee0-b8491da471b0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:35:20.588122	\N	\N	8565	\N	\N	\N
70e0e775-e179-497c-b383-bcca5e5a8bce	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:36:20.580746	\N	\N	8625	\N	\N	\N
bfa5525f-5338-4d05-b646-7952a4d9b446	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:37:20.578982	\N	\N	8685	\N	\N	\N
c1927c23-f414-429d-bbd1-908d3fbc6c0e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:38:20.574749	\N	\N	8745	\N	\N	\N
810b1274-7b71-4395-9ee7-0ae5406b1f53	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:39:20.585877	\N	\N	8805	\N	\N	\N
6da26269-79da-4793-b217-877c501195ff	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:40:20.581873	\N	\N	8865	\N	\N	\N
a59e315c-b8e6-425f-8c9f-103fd95af0fc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:41:20.582167	\N	\N	8925	\N	\N	\N
7d234168-ae68-4dad-9f1d-9f98d2c95ed0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:42:20.58613	\N	\N	8985	\N	\N	\N
91b33465-e06c-4d7c-b35b-b34cc8297e8b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:43:20.587364	\N	\N	9045	\N	\N	\N
43372e57-dffa-4ccd-9072-fdeae51a3f38	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:44:20.889964	\N	\N	9105	\N	\N	\N
6f83f8a9-b4ec-4ce3-9fbf-a44eb8b5ba8f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:45:20.586969	\N	\N	9165	\N	\N	\N
4b105274-1849-4bcf-80d7-d4311efe7995	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:46:20.584608	\N	\N	9225	\N	\N	\N
28dbfbea-5c29-47d9-9ef5-faaa23d482f8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:47:20.585856	\N	\N	9285	\N	\N	\N
8c89b1ea-3f6d-446c-ab92-660bc4fcd512	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:48:20.587919	\N	\N	9345	\N	\N	\N
e3de8334-16ba-47d5-9ec5-f3c9aa5030ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:49:20.595253	\N	\N	9405	\N	\N	\N
0961a8bd-eea7-44ed-a3f7-bd4ae83d68eb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:50:20.584392	\N	\N	9465	\N	\N	\N
7d0472b1-f0ab-427a-bbcb-0461edf67482	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:51:20.591792	\N	\N	9525	\N	\N	\N
a5573006-7bb4-4c53-9010-1a796a5cea7d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:52:20.590978	\N	\N	9585	\N	\N	\N
f4f753fd-8897-4ba6-8d78-8683e9b575b6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:53:20.585185	\N	\N	9645	\N	\N	\N
4c9bf1b3-dd6b-471b-8bfd-3eb3fd1b5ae9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:54:20.595974	\N	\N	9705	\N	\N	\N
2cdb8089-4b00-45bd-b543-010560a22630	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:55:20.599706	\N	\N	9765	\N	\N	\N
375b9220-b4b5-45b8-97bc-dfc3b6c4b616	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:56:20.591903	\N	\N	9825	\N	\N	\N
9244a4ab-acb4-4342-a160-c34a36c45d10	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:57:20.595622	\N	\N	9885	\N	\N	\N
0cabc888-8176-4794-b98a-8ea00c2e7f15	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:58:20.591433	\N	\N	9945	\N	\N	\N
2266c0e0-c7af-4880-8da7-644234b74999	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 13:59:20.604276	\N	\N	10005	\N	\N	\N
b7e692ce-d366-4dc2-8300-b9fc1d95b3b2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:00:20.604611	\N	\N	10065	\N	\N	\N
97250b0d-0813-42aa-96ba-d39f2961068a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:01:20.603338	\N	\N	10125	\N	\N	\N
7b40dec2-521b-40e2-817d-9671253fac1f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:02:20.591502	\N	\N	10185	\N	\N	\N
ce217b1e-a050-4ae9-9fcd-483779605f17	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:03:20.597188	\N	\N	10245	\N	\N	\N
5947440a-4253-4858-b959-3a9f5958eec5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:04:20.595172	\N	\N	10305	\N	\N	\N
c93d141a-d40a-4eb1-8d9d-33c6dd319ec6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:05:20.594193	\N	\N	10365	\N	\N	\N
17fb12ba-0ff1-413c-b749-5d29cb09c856	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:06:20.593777	\N	\N	10425	\N	\N	\N
15fe9d91-a010-4558-87d4-002d6890275c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:07:20.595014	\N	\N	10485	\N	\N	\N
38d65af7-5842-488c-9e9d-7038d9b164ba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:08:20.600344	\N	\N	10545	\N	\N	\N
13c840fd-36ac-4bf5-8ed2-ad7fdd254171	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:09:20.605661	\N	\N	10605	\N	\N	\N
99c0c0a7-5ba0-4e50-b201-7b477b85cfba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:10:20.596606	\N	\N	10665	\N	\N	\N
74c0a903-84b8-42cc-898a-66c78b23fd1c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:11:20.603255	\N	\N	10725	\N	\N	\N
3bd27f6c-e445-4909-b5b6-2c126a468885	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:12:20.596348	\N	\N	10785	\N	\N	\N
a8c1cf1b-9cd9-45f1-abbe-42244b44b67b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:13:20.599378	\N	\N	10845	\N	\N	\N
58dde898-178d-4cc3-a744-0268bec1d3d4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:14:20.916258	\N	\N	10905	\N	\N	\N
5ab97b74-9b6d-4f14-a901-f2c8d0697db4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:15:20.600274	\N	\N	10965	\N	\N	\N
4ba1239e-6544-42c2-91b4-4a54013e0068	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:16:20.601639	\N	\N	11025	\N	\N	\N
ec3430a0-0c8a-4f00-9444-9e27a6349f82	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:17:20.6047	\N	\N	11085	\N	\N	\N
cc2a8470-a99f-4e5b-b6b0-d44b34fdfa60	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:18:20.601494	\N	\N	11145	\N	\N	\N
d7c8b69e-a0cf-412b-ad7e-22990b8543f0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:19:20.593433	\N	\N	11205	\N	\N	\N
c86cf983-027f-42d5-8dc5-677078bb718c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:20:20.591483	\N	\N	11265	\N	\N	\N
d6d62732-3deb-41ae-9a41-e9bfe8a7c648	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:21:20.596431	\N	\N	11325	\N	\N	\N
2379de29-77fe-4fe0-bcaa-23e1f01e3d75	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:22:20.606134	\N	\N	11385	\N	\N	\N
9b212cc5-5e3f-4b1d-814d-cba165bc388f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:23:20.595578	\N	\N	11445	\N	\N	\N
9eb3bd55-5a15-42fb-9cc5-dabd7562bfd2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:24:20.597988	\N	\N	11505	\N	\N	\N
87809a31-5a16-48ba-9460-deecff2555b0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:25:20.595412	\N	\N	11565	\N	\N	\N
8b552515-de9a-429c-b44c-d823963865c5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:26:20.595661	\N	\N	11625	\N	\N	\N
e44b4738-48d3-4936-b046-6ea5cb1328a6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:27:20.595963	\N	\N	11685	\N	\N	\N
5a535c8a-7166-44f3-a03a-f8e88eb64bc8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:28:20.595148	\N	\N	11745	\N	\N	\N
df5b1ba5-fcea-4ac8-af47-0916c83c02c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:29:20.598687	\N	\N	11805	\N	\N	\N
b7854011-de10-4c6c-9938-0090e088db51	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:30:20.607269	\N	\N	11865	\N	\N	\N
5fcc0ad7-e9c9-4f56-966c-31e8d7f0ded9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:31:20.609025	\N	\N	11925	\N	\N	\N
ab1e66ac-5d29-4558-a13e-a83e0063577f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:32:20.60276	\N	\N	11985	\N	\N	\N
69791287-ee2a-4948-afc1-62a2662588a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:33:20.595202	\N	\N	12045	\N	\N	\N
533a5be7-c4e7-4143-a52c-eb3e0afa5616	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:34:20.603799	\N	\N	12105	\N	\N	\N
ce6ebbaf-12e3-48be-be0d-c1674e313717	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:36:15.668549	\N	\N	34	\N	\N	\N
1a462aef-ec22-4a4a-8393-9dc37f8cedb0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-24 14:36:45.633935	\N	\N	64	\N	\N	\N
31234726-6566-4096-94db-7657c27b80e4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:29:20.812441	\N	\N	8442	\N	\N	\N
8bf22067-869f-4070-91d8-79083a14196e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:30:20.112087	\N	\N	8501	\N	\N	\N
9be21238-9ac9-44d3-bd72-ad4b061525f5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:31:20.098558	\N	\N	8561	\N	\N	\N
a6354a05-25fb-49c8-ade5-e5e038bc00be	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:32:19.500929	\N	\N	8621	\N	\N	\N
4f45cf49-d4e8-49c1-a7d2-00b6293c10d7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:33:19.49826	\N	\N	8681	\N	\N	\N
a2801569-a484-492f-997e-81f1875c23b9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:34:19.59789	\N	\N	8741	\N	\N	\N
5f11eae5-ccf3-4f7f-81e4-d5103f58a419	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:35:19.485553	\N	\N	8801	\N	\N	\N
deb0100b-8271-4fef-b4b8-356ed2160cea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:36:19.493543	\N	\N	8861	\N	\N	\N
4ce498ff-5056-439c-ac4b-a78ff2fc55bc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:37:19.499295	\N	\N	8921	\N	\N	\N
9c570343-11c3-4e0c-9802-05f862ffc4c4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:38:19.497511	\N	\N	8981	\N	\N	\N
1ca0b635-96ba-4e9a-965d-03ba35a027dc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:39:19.493012	\N	\N	9041	\N	\N	\N
84e06679-ea96-4d54-b564-4c092f5be8c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:40:19.502686	\N	\N	9101	\N	\N	\N
b91433e5-f3b3-419b-946d-24db7ee3fd04	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:41:19.498081	\N	\N	9161	\N	\N	\N
32186cd7-fb08-4c53-8147-c615f073e10e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:42:19.509014	\N	\N	9221	\N	\N	\N
3e53778b-afc9-4a0c-819e-dc3ef4a27d35	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:43:19.506415	\N	\N	9281	\N	\N	\N
f1fccd78-9325-4457-87e6-2daaa3f05c88	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:44:19.502029	\N	\N	9341	\N	\N	\N
27832f3f-b4d1-40ac-923a-bd93342e1418	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:45:19.496475	\N	\N	9401	\N	\N	\N
ba4fd287-dff9-4990-a4c0-56047fdecb81	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:46:19.824438	\N	\N	9461	\N	\N	\N
8d391e82-4bac-4b8c-8be9-90e1ec0f6158	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:47:19.505579	\N	\N	9521	\N	\N	\N
f8e2ebeb-65f5-4c72-8fb2-79d6f5a1b101	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:48:19.505274	\N	\N	9581	\N	\N	\N
d41eb411-980a-4c87-ad8b-ab011086f4f7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:49:19.49968	\N	\N	9641	\N	\N	\N
d564e98d-0018-4e64-93e0-7ae146a5aa27	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:50:19.493756	\N	\N	9701	\N	\N	\N
71805842-dabb-4b89-9067-6b368e361f50	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:51:19.499961	\N	\N	9761	\N	\N	\N
bd9fda03-e9d7-498a-9972-49936bc4db42	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:52:19.498397	\N	\N	9821	\N	\N	\N
0f20a5a4-ee35-402f-ae7b-23ec0c10dad3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:53:19.500808	\N	\N	9881	\N	\N	\N
35a59d3c-539f-45bf-aa45-1e9645db4708	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:54:19.497576	\N	\N	9941	\N	\N	\N
028137c5-6db8-43b6-b6f7-91b94b87527b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:55:19.539065	\N	\N	10001	\N	\N	\N
3df4e654-3e74-4510-82fa-cdae3c2240fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:56:19.493228	\N	\N	10061	\N	\N	\N
a851fc77-d14e-4667-a647-2865eb965562	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:57:19.505447	\N	\N	10121	\N	\N	\N
8ca5a56e-aca6-4a91-ae60-39e16bd7ad4b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:58:19.492617	\N	\N	10181	\N	\N	\N
6d4dd63a-6402-40c4-a130-05670ba90393	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 08:59:19.501828	\N	\N	10241	\N	\N	\N
c6ac6dbb-e6cf-4c7d-a1b1-15c781b85f3b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:00:19.538289	\N	\N	10301	\N	\N	\N
76cba924-99ad-49b1-817a-a1a22af33cdb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:01:19.494857	\N	\N	10361	\N	\N	\N
9ea0cc71-e4b1-4278-915a-72ac72cf519e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:02:19.519189	\N	\N	10421	\N	\N	\N
a69ab68f-f02c-4c03-b7d8-dd423b8ecc8b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:03:19.49606	\N	\N	10481	\N	\N	\N
121dbd21-2b19-4150-ae90-be51751ca4ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:04:19.505352	\N	\N	10541	\N	\N	\N
9376cfc1-dc1a-4e37-a22e-4d2503647205	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:05:19.497984	\N	\N	10601	\N	\N	\N
b2740e50-fdae-4f5c-9923-58b9bec57f7f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:06:19.502257	\N	\N	10661	\N	\N	\N
ae9374bb-5644-4ecd-9b7b-e3f93ea00b95	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:07:19.526355	\N	\N	10721	\N	\N	\N
00c05225-1635-4a69-9e9f-2c6b766f0a3f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:08:19.511165	\N	\N	10781	\N	\N	\N
62bf5409-0249-4856-ae0d-2c3b4e21bb62	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:09:19.502217	\N	\N	10841	\N	\N	\N
53f6d13e-3466-4776-a4ad-f92015129906	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:10:19.499195	\N	\N	10901	\N	\N	\N
66faf0a6-c88f-4a89-b79a-876cbeeb93f8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:11:19.509329	\N	\N	10961	\N	\N	\N
bf108b40-e781-4482-9946-53844f76e782	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:12:19.516027	\N	\N	11021	\N	\N	\N
8c013b5d-1473-4a19-b9c5-a423ca8b187f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:13:19.513119	\N	\N	11081	\N	\N	\N
0465d961-134d-424c-9753-6cf24bda37e9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:14:19.505699	\N	\N	11141	\N	\N	\N
2c9cf580-412b-495d-b3dc-540e2b6f49d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:15:19.504204	\N	\N	11201	\N	\N	\N
47ab1071-a99a-4a1e-9fb2-72ddd4f6aae3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:16:19.82396	\N	\N	11261	\N	\N	\N
7d0394a0-1eea-4321-b940-8496958fb636	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:17:19.496985	\N	\N	11321	\N	\N	\N
a0ff4420-c4b6-4374-84b8-427b75fd9626	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:18:19.540426	\N	\N	11381	\N	\N	\N
33adeb07-aa19-4375-a9c2-51eb6afe409f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:19:19.50086	\N	\N	11441	\N	\N	\N
04f9fd7c-2247-41bc-8c8e-b6af54cfef90	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:20:19.508747	\N	\N	11501	\N	\N	\N
ac7726fa-890f-44d6-a63a-1294b8a435cd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:21:19.518724	\N	\N	11561	\N	\N	\N
fce436b6-13f5-42e3-a019-642abd894494	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:22:19.515713	\N	\N	11621	\N	\N	\N
1a9c2101-ca52-4239-bf65-9576918d2b07	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:23:19.507778	\N	\N	11681	\N	\N	\N
bcb43eea-0789-413c-820a-f4d3d1a8bd02	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:24:19.519042	\N	\N	11741	\N	\N	\N
b8c920b0-679b-4559-9831-18622f444d42	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:25:19.512742	\N	\N	11801	\N	\N	\N
6af2775d-9c4b-4aaf-9dd5-f9e96c59209a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:26:19.517063	\N	\N	11861	\N	\N	\N
975c9d45-a424-4bc9-86f4-d87e837910d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:27:19.517163	\N	\N	11921	\N	\N	\N
217f1315-4b86-4a68-8c98-c5ccb19169e4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:28:19.511886	\N	\N	11981	\N	\N	\N
bea9e0c3-a7ac-4b1e-aafc-4333d84a0f87	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:29:19.501585	\N	\N	12041	\N	\N	\N
6af96b74-bf11-4b25-9117-1cb6d9abe9f8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:30:19.50838	\N	\N	12101	\N	\N	\N
0e019a39-c3b1-43a3-8c13-bcb5c87284a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:31:19.505814	\N	\N	12161	\N	\N	\N
60d5d581-13ba-47fb-a2c4-b72380c8c24e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:32:19.516208	\N	\N	12221	\N	\N	\N
63598942-7c83-450c-904f-462a2cccafca	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:33:19.512392	\N	\N	12281	\N	\N	\N
975f929e-21a7-4c40-85f0-f091280772ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:34:19.510951	\N	\N	12341	\N	\N	\N
26320c00-be2e-4759-9b43-f0ad87d6e6fb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:35:19.515	\N	\N	12401	\N	\N	\N
52b5db8f-88fc-4ed2-85e0-a05145c963b4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:36:19.508417	\N	\N	12461	\N	\N	\N
1c302fee-fe1a-41df-b0e0-9be00fce33f2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:37:19.507966	\N	\N	12521	\N	\N	\N
a2b6deb0-3356-465c-9100-fb318c12ae11	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:38:19.516092	\N	\N	12581	\N	\N	\N
59fda984-c87b-469d-943a-e9c9dadbf85b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:39:19.509265	\N	\N	12641	\N	\N	\N
7e273285-6e35-4c37-8e46-6b46102794c0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:40:19.517765	\N	\N	12701	\N	\N	\N
18f3a723-e0dc-4eda-8881-7687d4e19c96	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:41:19.535487	\N	\N	12761	\N	\N	\N
e1c5aee2-8ed7-45e1-b7c6-71e12d64f7b8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:42:19.84882	\N	\N	12821	\N	\N	\N
f9320e48-3e8f-4193-ab6d-f0bba1c1c754	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:43:19.513806	\N	\N	12881	\N	\N	\N
019f6616-1b99-4791-aeae-0df39d941ea2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:44:19.511599	\N	\N	12941	\N	\N	\N
83957bde-aca4-437b-a9b9-da902bc0a00a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:45:19.515124	\N	\N	13001	\N	\N	\N
117e4ca1-d126-4c32-b3a5-ca390a225f92	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:46:19.840426	\N	\N	13061	\N	\N	\N
d02dd1e5-2066-44f6-8333-dd41f24aeb2e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:47:19.514841	\N	\N	13121	\N	\N	\N
bbf0a58d-746e-419b-a2b9-1e8b490ebea9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:48:19.557873	\N	\N	13181	\N	\N	\N
b13673fb-1dd2-4ed3-a03b-27dbedcf3c33	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:49:19.521166	\N	\N	13241	\N	\N	\N
8d000143-1288-4f1f-afde-4a2f81c33cd4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:50:19.517941	\N	\N	13301	\N	\N	\N
7ca913f3-ab94-4252-9b6c-816972b4d7bd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:51:19.529453	\N	\N	13361	\N	\N	\N
33b8a052-311c-4f39-a777-0c381ed3914c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:52:19.524816	\N	\N	13421	\N	\N	\N
f008e3e0-4491-46c4-a947-17e0b5fb6a8b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:53:19.528115	\N	\N	13481	\N	\N	\N
9273f46f-c950-4c81-857d-1b45f307982e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:54:19.5261	\N	\N	13541	\N	\N	\N
52b07492-e63a-48a8-8e03-bf5aed8632e7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:55:19.516235	\N	\N	13601	\N	\N	\N
367ed0e7-2f7d-4d1f-8494-7515f424f106	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:56:19.515649	\N	\N	13661	\N	\N	\N
2cabb183-881b-4c45-adc4-378f70afe7e9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:57:19.514043	\N	\N	13721	\N	\N	\N
4de5499e-aa9b-4c73-9f73-58f8fe4ced5f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:58:19.532218	\N	\N	13781	\N	\N	\N
9dbc605c-a462-4489-b6e6-bb88976013e6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 09:59:19.524018	\N	\N	13841	\N	\N	\N
55f01e75-c9be-4946-b073-db774c89a0c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:00:19.512252	\N	\N	13901	\N	\N	\N
fdc5e1c3-3682-436a-bb3a-1fbf54843fd3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:01:19.518592	\N	\N	13961	\N	\N	\N
582138a7-9b1d-473e-a8c2-2d833e509cb6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:02:19.527665	\N	\N	14021	\N	\N	\N
37fdb1a2-bba1-42ff-b650-4256028de5ac	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:03:19.512416	\N	\N	14081	\N	\N	\N
bfcbf87e-8142-4ef8-9170-02756c920cc4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:04:19.524789	\N	\N	14141	\N	\N	\N
ab3dea79-45c4-4170-9781-d8c4468abad6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:04:41.435385	\N	\N	14163	\N	\N	\N
dd45b6bb-75ba-4978-b812-d4597ffa2e8d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:05:17.63558	\N	\N	35	\N	\N	\N
45095aa9-f884-457c-891e-607752c33373	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:05:48.492119	\N	\N	66	\N	\N	\N
129c3edb-eefa-4fc2-8be4-39f31e920e53	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:06:18.487957	\N	\N	96	\N	\N	\N
50a03f0b-9071-47da-b77f-e64e013f4d07	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:06:48.513245	\N	\N	126	\N	\N	\N
fff65258-a820-4bd7-b12d-2705ca00ede5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:07:18.510114	\N	\N	156	\N	\N	\N
8741cd7a-e198-4f37-a575-a29a7c88fa76	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:07:48.515297	\N	\N	186	\N	\N	\N
cf2fc854-5499-44fb-aa4c-8b6174196c9e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:08:19.524069	\N	\N	217	\N	\N	\N
2e4ba533-e9cc-43b2-84e5-91852fe49c6b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:09:19.512177	\N	\N	277	\N	\N	\N
7f05ee7b-4522-4ea5-a117-764f1909cbd3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:10:19.519163	\N	\N	337	\N	\N	\N
4f7a32e7-8ce8-4eb7-bfc2-fc8a4c24d659	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:11:19.521685	\N	\N	397	\N	\N	\N
74635f2a-4bc6-4971-9014-d65e419205dd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:12:19.51677	\N	\N	457	\N	\N	\N
77fa489e-d7ac-4687-916d-0dfd94936f95	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:13:19.509052	\N	\N	517	\N	\N	\N
a59c7320-c741-4250-945b-5e4ccb03e1f6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:14:19.524488	\N	\N	577	\N	\N	\N
41397fc9-6a77-4aa6-bc5c-795369c6e616	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:15:19.515	\N	\N	637	\N	\N	\N
a9fb937a-6044-47bf-82ef-0cba9cf8ec29	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:16:19.845121	\N	\N	697	\N	\N	\N
828658f7-3857-48b7-8011-fee36c09b169	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:17:19.526068	\N	\N	757	\N	\N	\N
20ed278a-7862-4461-8b55-156cdd236325	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:18:19.516451	\N	\N	817	\N	\N	\N
4eb51d7c-c78e-40d7-b4c8-34a9b39f3098	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:19:19.519321	\N	\N	877	\N	\N	\N
046e52f1-ec38-4d1a-a79f-9ee8df813b58	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:20:19.520542	\N	\N	937	\N	\N	\N
92cc0c51-14d9-4e3b-905a-427e9f15565c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:21:19.532681	\N	\N	997	\N	\N	\N
448d1446-5e5f-4896-a689-c2eb73f38395	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:22:19.519679	\N	\N	1057	\N	\N	\N
5495bfc0-004d-444f-9d87-7031f15386c2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:23:19.516732	\N	\N	1117	\N	\N	\N
8f7739b0-a87e-4b7c-81d7-5676877c5cbb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:24:19.527831	\N	\N	1177	\N	\N	\N
cad3dc62-83db-41a3-a633-9bb44b37bfb6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:25:19.549986	\N	\N	1237	\N	\N	\N
7238be96-c530-428a-9ed9-7caf3f8aa47d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:26:19.514034	\N	\N	1297	\N	\N	\N
7ea927bb-aa3b-4ee1-8c7f-f386e2b863da	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:27:19.529294	\N	\N	1357	\N	\N	\N
855be8ec-8167-4f90-a7ec-c8666ead6ec7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:28:19.533422	\N	\N	1417	\N	\N	\N
a9386cf5-0bfa-4abf-8d02-82a35f525549	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:29:19.533128	\N	\N	1477	\N	\N	\N
bc10e295-ef60-4dab-80ff-7dc1f7e07ace	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:30:19.534076	\N	\N	1537	\N	\N	\N
82ae17c2-88e7-4390-ada5-ac7a13f50aeb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:31:19.520934	\N	\N	1597	\N	\N	\N
7f7f3f99-05d0-4a7c-bcb3-994b317b450c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:32:19.532845	\N	\N	1657	\N	\N	\N
fcd887db-054a-4e78-b4fd-81f6767430e3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:33:20.600877	\N	\N	1717	\N	\N	\N
b2607a7e-fee2-4d46-8c52-3714ec22230a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:34:19.542782	\N	\N	1777	\N	\N	\N
b52830ea-d0a0-4bb5-a2a3-e49e7d5733ba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:35:19.535052	\N	\N	1837	\N	\N	\N
cfbe2c8d-a05a-4eaf-96d9-6534289a39dd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:36:19.527935	\N	\N	1897	\N	\N	\N
7e604f3c-82b8-45c8-881a-4f9b429c9727	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:37:19.527918	\N	\N	1957	\N	\N	\N
61d52ca4-3673-4a12-aec9-2ab672dbbb95	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:38:19.528688	\N	\N	2017	\N	\N	\N
b4b9999b-41f4-4f80-aac1-65bbfbb02048	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:39:19.825103	\N	\N	2077	\N	\N	\N
cf7ac581-a854-4511-b6c6-8ff7897203fc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:40:19.524153	\N	\N	2137	\N	\N	\N
383fa3a6-35e0-4dbf-acee-732834e54acf	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:41:19.536782	\N	\N	2197	\N	\N	\N
c2117504-85ae-43d4-b9e1-36913b70c82c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:42:19.540983	\N	\N	2257	\N	\N	\N
8512841d-1868-4063-8627-70a824560f90	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:43:19.536327	\N	\N	2317	\N	\N	\N
6050ebc9-a2b9-4be0-9f40-6f446bc1df59	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:44:19.527597	\N	\N	2377	\N	\N	\N
b3103903-215a-4b16-8847-c549289aca37	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:45:19.538662	\N	\N	2437	\N	\N	\N
ffd09f6d-3d96-4e10-a595-1a62cb2361e7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:46:19.856029	\N	\N	2497	\N	\N	\N
00b3901e-24bf-4623-8e0a-766c32763b17	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:47:19.54252	\N	\N	2557	\N	\N	\N
7ff5feaf-b381-49cd-ab52-131dd56afe11	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:48:19.525277	\N	\N	2617	\N	\N	\N
d2789569-914d-4842-93b7-f4c0a902b82b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:49:19.52937	\N	\N	2677	\N	\N	\N
8547afeb-2410-4bec-bbbe-aee557efabfb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:50:19.544716	\N	\N	2737	\N	\N	\N
4fe245a3-bfac-4664-b87e-0a596b9915a3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:51:19.540237	\N	\N	2797	\N	\N	\N
851ab5aa-8dd6-47c5-b8b3-1a2a5a3d0a75	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:52:19.531413	\N	\N	2857	\N	\N	\N
904bde49-5305-494c-8830-206ac79abe90	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:53:19.539379	\N	\N	2917	\N	\N	\N
5334a51d-8492-4206-866f-aa4420a076ea	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:54:19.540436	\N	\N	2977	\N	\N	\N
8028e492-69a3-48f3-917b-b3ee9a2569d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:55:19.542304	\N	\N	3037	\N	\N	\N
b2120712-dccf-43ab-805d-aa9127dd63ba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:56:19.556438	\N	\N	3097	\N	\N	\N
da51a74e-1cbb-4ce4-99ce-9d612eecf10b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:57:19.543994	\N	\N	3157	\N	\N	\N
1143c786-ed71-44f5-8b5c-fb87303ef4b4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:58:19.548027	\N	\N	3217	\N	\N	\N
cb02c21c-d7c6-46ff-8509-6176a4b9aac8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 10:59:19.53953	\N	\N	3277	\N	\N	\N
7feb8378-6840-4465-bd2e-d07b78f67d52	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:00:19.535631	\N	\N	3337	\N	\N	\N
1d09635c-60fc-4543-97fb-300a0b393953	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:01:19.535959	\N	\N	3397	\N	\N	\N
6b115959-83db-4513-95ee-fa7c7c4d7387	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:02:19.546455	\N	\N	3457	\N	\N	\N
7fc8ef4b-01d3-4a8a-a179-7d14f4633393	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:03:19.537702	\N	\N	3517	\N	\N	\N
263d87c4-3118-47ed-bdad-9ecbf9a7ddd8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:04:19.55182	\N	\N	3577	\N	\N	\N
36f9cb12-1a25-453f-a6dc-a410119097b3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:05:19.546056	\N	\N	3637	\N	\N	\N
ae09a24a-a6a4-4c15-9f48-f294e6184567	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:06:19.551683	\N	\N	3697	\N	\N	\N
b70ef9a5-ef26-4521-865a-e7bcfb24daf8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:07:19.545785	\N	\N	3757	\N	\N	\N
a9d9b2b9-510a-4e3f-b219-66c4cae4fd89	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:08:19.540879	\N	\N	3817	\N	\N	\N
229125f7-f59b-4fd1-a815-362252640db0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:09:19.537764	\N	\N	3877	\N	\N	\N
53f117f3-af8e-4ccf-b372-d9e2bc41d21c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:10:19.541692	\N	\N	3937	\N	\N	\N
9fe214ff-7d30-4cc9-b793-b58ef4d42c49	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:11:19.550821	\N	\N	3997	\N	\N	\N
6b5910df-6aa2-4eaf-b49e-7b12df399f5f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:12:19.552352	\N	\N	4057	\N	\N	\N
103c0e3f-665d-43b6-947e-85e45c0df651	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:13:19.539516	\N	\N	4117	\N	\N	\N
bb9433e8-f5d4-4e7f-925a-6f570dae48df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:14:19.544929	\N	\N	4177	\N	\N	\N
221bd465-a881-4ec8-a0f9-ea2d8f9fd357	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:15:19.539316	\N	\N	4237	\N	\N	\N
a3819b67-5b8f-47d8-bf58-55b82ac38a1d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:16:19.877087	\N	\N	4297	\N	\N	\N
7b92eadb-c68c-427e-98c3-a4da721bb721	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:17:19.551101	\N	\N	4357	\N	\N	\N
ffd48bc7-6784-4268-9262-dd648c7027f6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:18:19.540976	\N	\N	4417	\N	\N	\N
b60fe6cf-bc4a-4eea-abd3-7425dd3dbc9f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:19:19.55397	\N	\N	4477	\N	\N	\N
c583438f-bb77-46f2-948d-a75c8beee9be	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:20:19.883827	\N	\N	4537	\N	\N	\N
d9dbd7dd-01ec-42a4-b850-e1449092d206	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:21:19.540446	\N	\N	4597	\N	\N	\N
ded77085-4b92-4220-abd8-b02fb6bf90f4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:22:19.552054	\N	\N	4657	\N	\N	\N
6f27ca87-14a0-4317-83c1-84e394b38a49	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:23:19.55651	\N	\N	4717	\N	\N	\N
948061c5-b319-44ef-a237-ee5c4fcb4e1f	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:24:19.549879	\N	\N	4777	\N	\N	\N
84d52608-b066-48d3-8ea0-7dc0ab7f22df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:25:19.551758	\N	\N	4837	\N	\N	\N
e9178a8e-4ec4-4e84-b558-b83abe9383f3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:26:19.5499	\N	\N	4897	\N	\N	\N
82596649-a744-4cf1-a34c-a644fedcfd47	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:27:19.548997	\N	\N	4957	\N	\N	\N
6564c6d2-e841-4b30-bf89-8a7a2dab36d0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:28:19.548967	\N	\N	5017	\N	\N	\N
8b463b49-f17f-4338-b7d8-4764e05e7194	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:29:19.540063	\N	\N	5077	\N	\N	\N
6f901734-a439-48b9-a873-4bd8dcd14eec	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:30:19.544653	\N	\N	5137	\N	\N	\N
76b62f08-c771-4ff2-a2b1-28f7a0d33914	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:31:19.54028	\N	\N	5197	\N	\N	\N
136f5b91-df4e-40bf-af7c-1d75444ecdd4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:32:19.54796	\N	\N	5257	\N	\N	\N
359f254a-b9dd-4f27-926b-a9f3afb13b4a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:33:19.540896	\N	\N	5317	\N	\N	\N
1ba3a344-1e63-40dd-b0d4-8c09470fcacb	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:34:19.544795	\N	\N	5377	\N	\N	\N
9c50fbed-24b3-4174-81c1-11cd34409d64	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:35:19.548742	\N	\N	5437	\N	\N	\N
209dc994-72b4-40df-a011-3d5836ea37d5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:36:19.542964	\N	\N	5497	\N	\N	\N
a32389dd-6c14-4d17-a64b-7422092e94c7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:37:19.557384	\N	\N	5557	\N	\N	\N
c0b808e8-5504-4dc2-87d6-2c657cb275b9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:38:19.558206	\N	\N	5617	\N	\N	\N
7c38dd3a-f68d-4420-a1f1-4616cc6f4df8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:39:19.554115	\N	\N	5677	\N	\N	\N
64a6a2d4-db8f-4806-afdd-3acf7d4f81da	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:40:19.55482	\N	\N	5737	\N	\N	\N
7d5b2a03-1122-4f0e-8e52-885715cde51a	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:41:19.864664	\N	\N	5797	\N	\N	\N
76222a64-343b-4093-99ea-4a7bca2bc898	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:42:19.54464	\N	\N	5857	\N	\N	\N
6a4ec8bf-530c-4911-ac52-f37a5fac5f39	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:43:19.545748	\N	\N	5917	\N	\N	\N
3c1dcb0a-c8a8-4e6e-9e88-133eab3b9818	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:44:19.553618	\N	\N	5977	\N	\N	\N
b0608793-8967-4198-93a1-09e14ff47acc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:45:19.554185	\N	\N	6037	\N	\N	\N
b5fa1cfd-921a-4d7d-a1a6-e694e4bffbbc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:46:19.871675	\N	\N	6097	\N	\N	\N
7401d5e3-2ba4-4c23-a9c5-ad535afc01dd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:47:19.54076	\N	\N	6157	\N	\N	\N
e39691a5-39a3-4182-9bb0-e7b90a040fd2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:48:19.554436	\N	\N	6217	\N	\N	\N
59825e19-2fcc-418f-b335-14e580d17aba	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:49:19.543524	\N	\N	6277	\N	\N	\N
e4d3aaeb-9a1f-42a3-9987-b56c2b07e437	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:50:19.555717	\N	\N	6337	\N	\N	\N
0e0e2c77-6a80-4f6f-8caf-3dc1190158a1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:51:19.548133	\N	\N	6397	\N	\N	\N
c42335c4-8fd5-444b-be21-e7ae68de3a7e	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:52:19.544036	\N	\N	6457	\N	\N	\N
e5a50048-3f72-4ef4-87a6-820decefd07d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:53:19.540787	\N	\N	6517	\N	\N	\N
d03f96fd-f539-435f-8467-706583ca8606	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:54:19.55429	\N	\N	6577	\N	\N	\N
36f309ed-e5cc-4202-8f21-bb3bc1761c05	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:55:19.543307	\N	\N	6637	\N	\N	\N
c51d71d3-aef9-4a92-b404-75d1504fb63c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:56:19.554431	\N	\N	6697	\N	\N	\N
c2cbd4c0-1b3f-4590-a3ae-7051e50595e2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:57:19.545348	\N	\N	6757	\N	\N	\N
b30547e5-ffe4-4aee-813c-dae762270638	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 11:58:19.559089	\N	\N	6817	\N	\N	\N
6efa42e1-34d5-419c-a53a-35c2700368a4	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:00:19.888244	\N	\N	6937	\N	\N	\N
05df2b58-602d-4197-8890-0cabf1cc1332	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:01:19.553965	\N	\N	6997	\N	\N	\N
4e4487b3-e2d7-4447-b122-a792c50c2cb3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:02:19.549073	\N	\N	7057	\N	\N	\N
c7f5f331-2e42-425d-b66a-1a0c7e6895e2	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:03:19.543966	\N	\N	7117	\N	\N	\N
47866467-1d70-400a-8696-67e05d07b673	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:04:19.548162	\N	\N	7177	\N	\N	\N
f6ea7878-16d7-4d1c-93c5-b4e89d0b4cb9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:05:19.554653	\N	\N	7237	\N	\N	\N
d80b93ba-550a-47d5-8b76-98bf69f19830	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:06:19.56071	\N	\N	7297	\N	\N	\N
2452ebca-4dc6-4a26-a19a-afb5ddf071fc	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:07:19.54942	\N	\N	7357	\N	\N	\N
de7ee57a-7f0b-4b25-918e-c75e88b51c68	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-25 12:08:19.547109	\N	\N	7417	\N	\N	\N
42938544-593a-415a-a077-5bc22bc32ac6	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 12:58:49.35208	\N	\N	41137	\N	\N	\N
92191df7-e016-44e9-a577-87e66411f185	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 12:59:49.334722	\N	\N	41197	\N	\N	\N
9146990d-7540-443b-bb92-18c3338aa542	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:00:49.336015	\N	\N	41257	\N	\N	\N
8b633e84-d95c-49f5-9873-68c6089c10c3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:01:49.341298	\N	\N	41317	\N	\N	\N
4b33b97a-0466-4db2-85ae-131353272ce5	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:02:49.343908	\N	\N	41377	\N	\N	\N
8b9fb99f-e29d-44d4-9d06-1503d5c9cdb8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:03:49.339261	\N	\N	41437	\N	\N	\N
6e6990fd-ad03-4679-923c-54678ee834ff	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:04:49.341856	\N	\N	41497	\N	\N	\N
ae11f248-cc5d-4796-85c3-fd138b6efd0c	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:05:49.330782	\N	\N	41557	\N	\N	\N
431e12f9-a449-4807-ac2f-3fbaa0f41f95	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:06:49.342293	\N	\N	41617	\N	\N	\N
7410edb2-c3e0-4e51-9117-b06aeb341094	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:07:49.340747	\N	\N	41677	\N	\N	\N
53ee73da-9dec-4dd2-b876-16b7c49abd92	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:08:49.338003	\N	\N	41737	\N	\N	\N
7524364b-386c-47a1-ac2a-224dd13d32bd	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:09:49.345922	\N	\N	41797	\N	\N	\N
b6288868-f7a8-4575-a8e1-5b609bd9fe21	b33a6919-df32-4688-8acf-be5ff1575a72	2026-02-26 13:10:49.3315	\N	\N	41857	\N	\N	\N
63096216-2733-49ec-a072-2ae25514e48f	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 18:59:24.434979	\N	\N	56	\N	\N	\N
73604022-64e1-4463-b6cd-762db31aa439	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 18:59:54.441367	\N	\N	86	\N	\N	\N
bb1e9a60-5faa-4f48-9ffd-a6a8c66af30d	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:00:24.432176	\N	\N	116	\N	\N	\N
02efc356-7aa2-4f68-99f9-5e8a63640b4d	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:00:54.432852	\N	\N	146	\N	\N	\N
cbe274c0-759c-4d30-96b7-27bdaadfdbe7	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:01:24.433603	\N	\N	176	\N	\N	\N
53db06a0-3d45-45f4-bc3c-dc1e0dd3c656	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:01:54.439866	\N	\N	206	\N	\N	\N
9c43b170-86d7-450f-a737-93a129fb4e54	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:02:24.564474	\N	\N	236	\N	\N	\N
7b9eb846-3405-45ea-a215-92a05c9c96a2	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:02:54.434218	\N	\N	266	\N	\N	\N
7101b58b-a4e6-421a-a5a8-33d8e20ccc43	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:03:24.441668	\N	\N	296	\N	\N	\N
fac36dfe-d3ca-4671-9d36-b03916949a6e	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:03:54.433378	\N	\N	326	\N	\N	\N
8af1d2e5-3ea6-4f94-a849-89b1160b67e8	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:04:24.433823	\N	\N	356	\N	\N	\N
b57ab5f1-46cd-4f1d-a775-7a57e640c330	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:04:54.435006	\N	\N	386	\N	\N	\N
02aa7413-dafe-4361-864e-46b29998b8b6	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:05:24.433737	\N	\N	416	\N	\N	\N
4506c764-b7bc-464c-a71f-4fdc4d86e629	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:05:54.5615	\N	\N	446	\N	\N	\N
866c6c8c-8ce8-4848-ae5e-a2b445699a31	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:06:51.878999	\N	\N	36	\N	\N	\N
a068ab2a-9fc0-46b9-9dc3-e3e1310fa805	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:07:21.898571	\N	\N	66	\N	\N	\N
de6d062b-5e57-4cb1-9a54-ad4e021250ad	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:07:56.749485	\N	\N	34	\N	\N	\N
dc5ef9ac-5505-4538-9366-6d75835f9381	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:08:26.752218	\N	\N	64	\N	\N	\N
2ad0b3b9-069b-4552-8aff-c7016623fd66	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:10:11.101775	\N	\N	35	\N	\N	\N
2084f222-d340-45ce-aa31-01c38bb6fade	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:10:43.953194	\N	\N	33	\N	\N	\N
af0a4f85-bd86-404b-b0bc-87ac86f42676	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:11:13.955259	\N	\N	63	\N	\N	\N
52ee3321-8afa-4c6d-b6a7-4dc6bfe605ed	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:11:43.955126	\N	\N	93	\N	\N	\N
342d7f73-d05f-4edb-8cd7-70e8c47a0e5d	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:12:13.955315	\N	\N	123	\N	\N	\N
01820406-6bbd-4d79-bd2b-c6e03081b1f8	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:13:08.884377	\N	\N	32	\N	\N	\N
93ed7021-fd4f-4038-9367-efc44ac721d9	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:13:38.881599	\N	\N	62	\N	\N	\N
2f4be170-610e-45a8-81d3-3a55d3fdd2d6	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:14:21.221369	\N	\N	35	\N	\N	\N
7d6e3ca5-b1e3-4ce4-ad37-e3c17c208c43	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:15:01.931092	\N	\N	34	\N	\N	\N
d94242b1-ae70-43f7-bb5b-79347455eb3f	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:15:31.913387	\N	\N	64	\N	\N	\N
3c5ecdac-4126-4d65-a85e-c597c46c9fb1	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:16:01.927866	\N	\N	94	\N	\N	\N
1040ab77-4d93-406a-8ab2-504eba675230	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:16:31.911833	\N	\N	124	\N	\N	\N
0008caa8-2403-4481-b298-5152564c4b73	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:17:01.923415	\N	\N	154	\N	\N	\N
9eda49ab-8f16-4e4a-856b-32b3dc832257	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:17:31.944305	\N	\N	184	\N	\N	\N
897e8a73-471d-4256-bc42-92b65733e549	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:18:01.925105	\N	\N	214	\N	\N	\N
45bc94a9-37b8-46a4-a6aa-6fd5d499e8a0	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:30:26.355262	\N	\N	51	\N	\N	\N
8230d0fb-8005-418c-93a1-c2b9b54ef1e1	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:30:56.314442	\N	\N	81	\N	\N	\N
c1a89841-4a63-4458-8243-d4f5ae64dd7e	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:31:35.407474	\N	\N	35	\N	\N	\N
25d611c0-2b8d-467b-aba4-c1ea03cff463	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:31:35.503184	\N	\N	34	\N	\N	\N
0c3faa4b-2fbf-43e5-9d7a-193a8f08164f	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:32:14.529661	\N	\N	35	\N	\N	\N
27c4aaa5-1427-45f9-a7b2-bdcf229d8b81	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:32:14.595194	\N	\N	35	\N	\N	\N
c155826e-99d6-4993-ad05-45c0edc62106	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:33:21.45452	\N	\N	32	\N	\N	\N
26923b67-f0c1-4bee-b6b8-057317e7e6b7	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:33:22.68949	\N	\N	33	\N	\N	\N
4cdde18f-a527-4194-8962-471a1a4183fc	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:33:51.444166	\N	\N	62	\N	\N	\N
8823ba2a-da41-4733-92e9-89be603702fd	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:33:52.689833	\N	\N	63	\N	\N	\N
721b0527-5c71-44af-a735-d4a44f378630	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:34:38.462571	\N	\N	34	\N	\N	\N
9e95e3d7-30c0-4bf3-83fa-db74fa0f5a39	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:34:38.642075	\N	\N	35	\N	\N	\N
6e052f2a-3031-4ec6-9bcb-df3aaf088bc0	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:35:08.471899	\N	\N	64	\N	\N	\N
59cc97ac-ed50-4a95-b136-6d673fe8dd58	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:35:08.651398	\N	\N	65	\N	\N	\N
cf9cb609-d37c-433c-a449-52ce4a6c2e61	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:35:38.47394	\N	\N	94	\N	\N	\N
d568a543-c8f9-4928-9cdd-85beadb0fd48	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:35:38.635391	\N	\N	95	\N	\N	\N
93b0660c-31c5-4871-b35e-e9dec30da56f	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:36:08.463733	\N	\N	124	\N	\N	\N
f6fae21d-c61f-4263-80e1-1e68aa644b89	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:36:08.658631	\N	\N	125	\N	\N	\N
62d9670f-b09d-4d92-8821-08625acf13a4	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:36:38.468305	\N	\N	154	\N	\N	\N
6e14e64e-3c83-48f7-88ba-04e94e6f7c95	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:36:38.705231	\N	\N	155	\N	\N	\N
121ec3ed-e01f-442a-84c7-15e4f31d96c2	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:37:08.465932	\N	\N	184	\N	\N	\N
190641e7-cc9e-4b3f-9c25-fda775e4f4e8	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:37:08.640193	\N	\N	185	\N	\N	\N
6cd43c27-41d9-4162-a544-24fe3b5a29f6	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:37:38.469226	\N	\N	214	\N	\N	\N
f0a1216a-38e0-4c84-8fa0-78440488cc30	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:37:38.649068	\N	\N	215	\N	\N	\N
2d926246-2c3c-449c-a298-ec35a80df0ce	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:38:08.469907	\N	\N	245	\N	\N	\N
eb8ed743-b51d-4f47-a6d6-202647c658ff	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:38:38.471434	\N	\N	275	\N	\N	\N
f134fbeb-d6dc-4670-954d-c309bd52f1cd	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:38:39.018194	\N	\N	72	\N	\N	\N
a0f91cd9-9023-4a65-9731-964e31adb580	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:39:08.4916	\N	\N	305	\N	\N	\N
4f1a8923-46c5-43d4-b016-7070db32c9d2	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:39:15.526431	\N	\N	34	\N	\N	\N
88340883-79f8-4493-8d84-cc5507c53db9	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:39:38.491618	\N	\N	335	\N	\N	\N
1b65c80d-88b6-4091-ac80-cb5e4b0af306	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:39:45.524874	\N	\N	64	\N	\N	\N
574b940e-cb12-46aa-9400-3641811bd0e4	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:40:08.484143	\N	\N	365	\N	\N	\N
47f83194-5871-4415-8d02-87b4a1a29d32	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:40:15.529804	\N	\N	94	\N	\N	\N
8207f0c1-8830-434d-b7e6-a042ab13c70d	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:40:38.488632	\N	\N	395	\N	\N	\N
7e16087a-1e64-4dcd-a8f0-4c6fc9951e82	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:40:45.526458	\N	\N	124	\N	\N	\N
b7110531-2892-4901-98c2-08790357bb04	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:41:08.49403	\N	\N	425	\N	\N	\N
1f408e51-758f-4639-96da-e43c6f9a0542	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:41:15.522805	\N	\N	154	\N	\N	\N
4f417451-a64d-4ac9-a7cb-a33d8f36fd3e	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:41:38.481605	\N	\N	455	\N	\N	\N
95502820-fb68-42d7-88d3-384f311e8cd0	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:41:45.536456	\N	\N	184	\N	\N	\N
b679a834-5d24-454d-b8fd-b00e44eda216	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:42:08.484801	\N	\N	485	\N	\N	\N
e29af14c-b878-4a7a-aef0-846727de7a30	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:42:51.68849	\N	\N	34	\N	\N	\N
bd1c9cc0-3322-42f7-9e5b-9368b1ef8f7f	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:42:51.75318	\N	\N	34	\N	\N	\N
6ec5e0e5-8ef5-487c-9cf9-e5dbeabbb7be	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:43:21.686198	\N	\N	64	\N	\N	\N
2556c2a7-ad0a-4ca5-843b-96acb6c737b9	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:43:21.759959	\N	\N	64	\N	\N	\N
3b08b0c5-a28d-40cf-9b08-f2fd66f5a2bf	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:43:22.707585	\N	\N	44	\N	\N	\N
c3958320-b3f2-401a-bd1b-7c7d493518f0	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:43:51.687134	\N	\N	94	\N	\N	\N
a1fa7f45-5a0d-4cad-9652-068cdfa21faf	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:43:51.776069	\N	\N	94	\N	\N	\N
466f3776-f41f-420c-82dc-6525c3295b1d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:43:52.709117	\N	\N	74	\N	\N	\N
53ffa081-3d97-4cbb-a8cd-71ff22b42d9e	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:44:21.685496	\N	\N	124	\N	\N	\N
bd5a8348-e393-4f57-bf56-ab44b6f79f8a	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:44:21.766768	\N	\N	124	\N	\N	\N
57624dba-00c5-4d62-b706-b3730cbafab3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:44:22.709981	\N	\N	104	\N	\N	\N
26c4dac2-1212-412e-8d1c-35b816214f59	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:44:51.689276	\N	\N	154	\N	\N	\N
75661be6-f9a7-45e7-962a-0a50d6d02bcb	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:44:51.774615	\N	\N	154	\N	\N	\N
a076f825-ab6c-4ecc-84a5-41e33b15005c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:44:52.711504	\N	\N	134	\N	\N	\N
daf13a71-a852-4bca-a6ec-90813cc2b7ef	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:45:08.556918	\N	\N	108	\N	\N	\N
8c1483ee-a364-465b-9ae9-d031b382c56d	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:45:21.689073	\N	\N	184	\N	\N	\N
68ed70ff-55d3-46f9-b529-2e6075ef197d	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:45:21.717532	\N	\N	184	\N	\N	\N
63735783-a315-4875-94a1-1f163de022a0	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:45:22.710986	\N	\N	164	\N	\N	\N
57eea006-c16c-411a-b6fd-bcdc48fca967	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:45:48.767109	\N	\N	38	\N	\N	\N
c330f2dd-2dbd-4b59-9011-aeb7257db3e5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:45:52.710083	\N	\N	194	\N	\N	\N
3c71c9bb-8fec-4225-a393-c8a4e4ad3b8b	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:46:07.206659	\N	\N	35	\N	\N	\N
e7178e46-2459-4cb1-b90a-27a0cb17ef7d	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:46:07.868152	\N	\N	35	\N	\N	\N
eaaa0a33-4ad5-49f5-b972-ecb6e0904ef3	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:46:43.033409	\N	\N	53	\N	\N	\N
45d88fb1-83ef-4a32-afa3-e49050408467	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:47:06.720195	\N	\N	268	\N	\N	\N
ae32bc70-6329-4104-9482-20efe84bcc33	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:47:11.043479	\N	\N	34	\N	\N	\N
00aa8a23-162c-4869-ac0d-e90d24035ecb	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:47:11.43426	\N	\N	34	\N	\N	\N
a02c0018-fc29-4128-bee0-b7909aef3a31	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:47:41.038193	\N	\N	64	\N	\N	\N
c7bfc8b9-f448-4e9d-b2ba-d374ef4a5310	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:47:41.443248	\N	\N	64	\N	\N	\N
c19960c1-7ec2-4722-bb21-e1aab5cfd137	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:48:06.724091	\N	\N	328	\N	\N	\N
b7f3eeab-1ca8-4e89-a819-e02bf1b40896	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:48:21.983368	\N	\N	34	\N	\N	\N
cb02666e-17d0-4b4e-91e2-529a3ffeca38	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:48:22.568243	\N	\N	34	\N	\N	\N
078b03a8-6803-4408-a849-7c07a903d91f	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:48:51.991887	\N	\N	64	\N	\N	\N
5a3758b4-8ad1-450b-93ff-539c6ac4885e	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:48:52.5837	\N	\N	64	\N	\N	\N
cccd01b9-5485-45c4-b084-a90b53862efb	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:49:06.724579	\N	\N	388	\N	\N	\N
9a24fa52-09c8-49d4-8fb9-d0c9fc83f957	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:49:21.983943	\N	\N	94	\N	\N	\N
7f5c9471-8b1d-467f-9c85-328f672de382	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:49:22.579745	\N	\N	94	\N	\N	\N
d075c3ab-f72b-4747-8fa3-71858e242ed9	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:49:51.985733	\N	\N	124	\N	\N	\N
78534edb-ac22-4795-a579-44f715d79e4c	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:49:52.586801	\N	\N	124	\N	\N	\N
2b4cb112-2959-47df-afa1-0900d63fa33d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:50:06.724993	\N	\N	448	\N	\N	\N
0e6eefe4-0c5b-4621-8537-286172dae51b	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:50:21.98385	\N	\N	154	\N	\N	\N
823e25af-50dd-467d-8c01-628d2d5fe474	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:50:22.577535	\N	\N	154	\N	\N	\N
01043824-9ec2-4171-9069-62ac313bd666	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:50:49.97484	\N	\N	69	\N	\N	\N
625ebda1-d93b-479f-a20d-577810a2d301	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:50:51.981888	\N	\N	184	\N	\N	\N
39cf57e8-275f-4822-aabb-5f57db55e38a	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:50:52.576261	\N	\N	184	\N	\N	\N
0e9695e6-34c1-4baa-8ae2-eb2bf20dcd41	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:51:06.735222	\N	\N	508	\N	\N	\N
b044a3dd-e7d3-4d0c-b80c-c824c96813fe	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:51:21.989838	\N	\N	214	\N	\N	\N
a83acc7f-1109-4432-a6df-f71cb324a7d5	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:51:22.57622	\N	\N	214	\N	\N	\N
01739b23-5b09-4f0e-b77b-8a3433e85244	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:51:51.985203	\N	\N	244	\N	\N	\N
733dc30d-fd88-464d-93c6-44f10b3e7bfe	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:51:52.577651	\N	\N	244	\N	\N	\N
c09f9fad-7d2d-4d39-81aa-96f9be1e60d5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:52:06.735203	\N	\N	568	\N	\N	\N
6c5be447-c063-41b3-9280-285169e205d7	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:52:21.985109	\N	\N	274	\N	\N	\N
0e1fc52f-1588-465c-8a34-65e109740be4	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:52:22.58628	\N	\N	274	\N	\N	\N
6fb3f594-fcbc-4197-b1e0-2a7b738b0300	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:52:51.984083	\N	\N	304	\N	\N	\N
cef0f7f5-efe1-4e88-99c9-f5d523781238	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:52:52.581954	\N	\N	304	\N	\N	\N
bd675ac4-fe65-4a14-9d62-761a499faf1f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:53:06.734929	\N	\N	628	\N	\N	\N
88a171f9-9aee-450d-a77b-98eeed993910	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:53:21.982442	\N	\N	334	\N	\N	\N
65a26f13-5abe-4e63-91de-8434a3944fc2	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:53:22.588503	\N	\N	334	\N	\N	\N
319b8862-71e0-4274-99c5-9c4399ecf3a9	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:53:26.962092	\N	\N	65	\N	\N	\N
1ca64c30-e4c4-47c5-9224-da2cceb8a148	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:53:51.982109	\N	\N	364	\N	\N	\N
6d0796b6-eb42-4489-9f60-9db6120c4eb8	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:53:52.594865	\N	\N	364	\N	\N	\N
43541b28-3fc4-4def-a11a-0b294c5031df	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:54:00.854027	\N	\N	32	\N	\N	\N
1240a6a7-a14f-4048-a237-0602ebae120c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:54:06.799287	\N	\N	688	\N	\N	\N
f51a17a4-6070-41dc-a830-8934a0c4c50a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:55:06.72977	\N	\N	748	\N	\N	\N
51a96070-334d-4ed7-aae7-d0f225306d59	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:55:23.284719	\N	\N	35	\N	\N	\N
e7a4c36f-15e6-4427-9c74-9462c0c2725d	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:55:31.309331	\N	\N	42	\N	\N	\N
0bcc8eaf-e8ee-48de-8317-02a96fb23460	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:55:41.953844	\N	\N	783	\N	\N	\N
882b1a28-9d4f-4fe8-8989-5218d967d11a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:56:23.720996	\N	\N	34	\N	\N	\N
f0f5be2a-b03c-42d6-9e27-efd7f6a3ea35	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:56:23.876132	\N	\N	34	\N	\N	\N
d8d091dc-9f5a-4960-8ee7-9f068c72b1e7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:56:53.718516	\N	\N	64	\N	\N	\N
af2d4d23-5b71-463b-a729-7be5d5efdbed	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:56:56.484278	\N	\N	34	\N	\N	\N
3a574a2a-ddaf-4d94-80f9-dd05ae76b7fd	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:57:05.83908	\N	\N	32	\N	\N	\N
f787e7ad-296d-4cb2-8ffe-47f119ba31f6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:57:23.721284	\N	\N	94	\N	\N	\N
4bb66e0f-6817-46c3-baa9-cfd5c93f0258	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:57:26.492022	\N	\N	64	\N	\N	\N
3a535f06-ac4c-423d-890a-563b407b25a7	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:57:26.723857	\N	\N	97	\N	\N	\N
61b78e70-ea0e-48bc-a470-a2c2d665aaf0	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:57:35.842349	\N	\N	62	\N	\N	\N
5287c072-0726-4706-bed5-ed6d9b60d572	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:57:53.72133	\N	\N	124	\N	\N	\N
ca7d1634-833b-42ba-9a92-62343c32b6d1	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:57:56.725463	\N	\N	127	\N	\N	\N
0b566bb5-6d36-4633-b25d-7ec5caef1148	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:58:05.847277	\N	\N	92	\N	\N	\N
a4785023-da76-4500-8b55-48a867288f54	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:58:23.718402	\N	\N	154	\N	\N	\N
1e3ccb6d-c139-4692-93d6-6c0a441e1aab	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:58:35.850334	\N	\N	122	\N	\N	\N
fb3bbcec-62e8-442a-aeb0-abb34cc1228b	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:58:51.030873	\N	\N	31	\N	\N	\N
233931bf-2bc5-4012-a65c-65edd0dd75bd	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 19:58:53.72608	\N	\N	184	\N	\N	\N
4b5f5f11-11a8-4cf5-94a5-fcd99a32edd9	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:59:05.853473	\N	\N	152	\N	\N	\N
376b3cd1-73cf-4ad8-88ea-8f8068ed35ab	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:59:21.031015	\N	\N	61	\N	\N	\N
87a87d0c-62d1-4ed9-9fdf-5bed411d3bc9	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:59:21.896758	\N	\N	53	\N	\N	\N
8abde8ff-0936-4073-8a05-ffc319a9f83a	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 19:59:35.850384	\N	\N	182	\N	\N	\N
d12bfff8-e6d4-4475-8c86-c8e81647e8af	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 19:59:51.027405	\N	\N	91	\N	\N	\N
38b75b67-cf12-435c-9470-19330d5b32ed	d4187726-e894-4c46-8f20-5987423a141a	2026-03-07 19:59:51.891878	\N	\N	83	\N	\N	\N
d0df7840-4e0a-4ebc-abf8-eeed7b784f0a	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:00:05.848977	\N	\N	212	\N	\N	\N
cf8ecdbf-72c5-4a40-8e33-df3a225da4e0	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:00:06.721974	\N	\N	257	\N	\N	\N
4901ee70-c05d-4a10-9113-354f271fd4f8	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 20:00:21.030048	\N	\N	121	\N	\N	\N
aded5dce-46e5-4840-9a0b-9b9aadce05d0	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:00:35.843822	\N	\N	242	\N	\N	\N
d0077754-7b8a-4f76-8332-22b12848d787	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 20:00:51.175063	\N	\N	151	\N	\N	\N
7bdfad1f-744c-4cbd-8af9-ad77e182b88b	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:01:05.854743	\N	\N	272	\N	\N	\N
04b88755-75eb-4562-8a38-6b95834533c9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:01:06.724383	\N	\N	317	\N	\N	\N
2597d8ac-1cd9-47e9-be2f-14d55fa14c41	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 20:01:21.191668	\N	\N	182	\N	\N	\N
697c9913-7bbf-4039-9996-fdcc91b50637	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:01:35.865123	\N	\N	302	\N	\N	\N
814d19bc-9686-4ced-b460-6d472c20d92f	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:02:05.852451	\N	\N	332	\N	\N	\N
b6b3b242-c96e-4c23-8687-f3c29b187a03	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:02:06.734554	\N	\N	377	\N	\N	\N
5a065976-9774-444f-a8ef-dd52d4627588	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 20:02:34.195189	\N	\N	255	\N	\N	\N
01e57d7f-b7ca-47cf-9fab-4ab7bd4adad0	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:02:35.855879	\N	\N	362	\N	\N	\N
b5b4bed0-9e13-44b1-b0f0-b485e1c3bab3	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:03:05.855937	\N	\N	392	\N	\N	\N
d20f28ac-8d60-49c8-a4b5-8929f92ed1d0	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:03:06.721762	\N	\N	437	\N	\N	\N
ab3525b9-664b-4bcb-815e-af9b136305a0	b33a6919-df32-4688-8acf-be5ff1575a72	2026-03-07 20:03:34.179528	\N	\N	315	\N	\N	\N
17a32071-cf07-4207-a044-47c8f71071bc	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:03:35.879334	\N	\N	422	\N	\N	\N
3e4944cf-6b71-42a4-ad74-7e1f984df1e0	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:04:06.730581	\N	\N	497	\N	\N	\N
085ea3b4-90e3-474e-87d0-5a6bb00f5c16	fdba1c22-f3ae-4574-856a-810bf9525140	2026-03-07 20:04:36.508964	\N	\N	34	\N	\N	\N
34e0dac5-f41a-4ca1-9ed8-a3eb9a13e537	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:05:06.720483	\N	\N	557	\N	\N	\N
4060fe0a-11ba-4311-9829-9dc9d35de4d9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:06:06.727198	\N	\N	617	\N	\N	\N
5dcf6bc8-39e9-4349-b46c-aa1a2e6f1b63	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:07:06.745448	\N	\N	677	\N	\N	\N
9bfb9085-48f0-435e-a044-70c46d5036e3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:08:06.749646	\N	\N	737	\N	\N	\N
699c2001-519c-4960-9f7b-8548b915060b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:09:07.075574	\N	\N	797	\N	\N	\N
b4bc82c0-d094-49cf-aa6c-006b82dc316b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:10:06.739527	\N	\N	857	\N	\N	\N
c9169088-e190-405b-8993-fd114d6cbff5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 20:15:57.401394	\N	\N	918	\N	\N	\N
7e14dea4-5166-4933-bd1d-94d99ffa25b5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 21:21:49.241447	\N	\N	1157	\N	\N	\N
8c1cbf44-489d-4ee0-bc6c-6ce66c748d58	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:04:38.021069	\N	\N	1277	\N	\N	\N
f98fcec2-d28e-4293-9c22-081a80a0fe0f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:05:37.998784	\N	\N	1337	\N	\N	\N
cd2e2e97-74af-49d4-9faa-577dc54e9030	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:06:38.00874	\N	\N	1397	\N	\N	\N
05675e86-f1f4-4039-bb9b-3e62cae1570a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:07:18.619629	\N	\N	1438	\N	\N	\N
31e3709e-c27b-4881-a19b-21516a60a7cc	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:07:52.010709	\N	\N	32	\N	\N	\N
960969b1-1d08-437c-8518-0b575686b9ad	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:08:22.000802	\N	\N	62	\N	\N	\N
829662a3-85b7-4c97-9c67-80d8a468bb11	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:08:52.032105	\N	\N	92	\N	\N	\N
9648c8c9-c51d-4ab8-861e-26a8d13c29ea	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:09:21.996287	\N	\N	122	\N	\N	\N
e9f9d48e-93b2-4a57-973d-e8fdcb9a6d64	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:09:52.035779	\N	\N	152	\N	\N	\N
ac40dbba-f771-460a-9d85-5d687ea4da91	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:10:22.032338	\N	\N	182	\N	\N	\N
6f58793a-abf0-4f20-a4ab-ce7de23da074	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:11:38.023741	\N	\N	258	\N	\N	\N
0f84b796-a11d-45c6-a733-99abe25d79f3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:12:37.999523	\N	\N	318	\N	\N	\N
932ab149-ca36-4097-adc8-cdfee4a26b53	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:13:40.25113	\N	\N	378	\N	\N	\N
fc4c93d7-07d9-450d-9b12-c27b860a9f3b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:14:38.020887	\N	\N	438	\N	\N	\N
7e6404bf-f6df-4eb6-ba8c-7767194761ad	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:15:38.015104	\N	\N	498	\N	\N	\N
0c4b59a2-e688-492d-9b24-6880db6985ea	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:16:38.039113	\N	\N	558	\N	\N	\N
4cd62f6d-223c-4554-b903-e9b20672c982	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:17:38.020107	\N	\N	618	\N	\N	\N
06fdb023-a073-423a-af51-13a372481723	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:18:38.025763	\N	\N	678	\N	\N	\N
55e79053-46b5-49a1-8b95-30a5a2a12c5d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:19:38.023013	\N	\N	738	\N	\N	\N
41c273d3-9267-41fc-97a4-9ea19f8202f4	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:20:38.020446	\N	\N	798	\N	\N	\N
837dd910-1934-412d-a428-adc73ae1a72d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:21:38.003239	\N	\N	858	\N	\N	\N
55bb5c28-508a-49ff-8201-88119e0431f7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:22:38.024484	\N	\N	918	\N	\N	\N
e7d3ed6a-e816-44a7-967d-90cc4b98308f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:23:38.016502	\N	\N	978	\N	\N	\N
0ca298c1-e485-464a-b32d-eae478965a56	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:24:38.022489	\N	\N	1038	\N	\N	\N
da0e6789-52b9-414b-ad98-c9e93787a28e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:25:38.031006	\N	\N	1098	\N	\N	\N
cb7929d0-7d5f-42e4-b9bc-f5ef05c77128	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:26:38.369111	\N	\N	1158	\N	\N	\N
e1eec22b-3c9d-41e2-8623-3a4bcf38aae1	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:27:38.026839	\N	\N	1218	\N	\N	\N
15352bb2-18bc-4904-8e97-faee588cd7bf	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:29:38.028877	\N	\N	1338	\N	\N	\N
7abb67d4-4af1-46c9-9e05-5e7662010b98	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:30:38.036085	\N	\N	1398	\N	\N	\N
582fbca2-be99-43a8-85cf-39a4e41d808b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:31:38.03006	\N	\N	1458	\N	\N	\N
55072f2a-6f4a-411d-b9ec-1c57b99d2ca2	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:32:38.042417	\N	\N	1518	\N	\N	\N
f829d030-bc8f-4b5e-bd2e-7e17eba17e01	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:33:38.030627	\N	\N	1578	\N	\N	\N
1f861bec-1a63-4643-b6cc-be5806749475	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:34:38.046943	\N	\N	1638	\N	\N	\N
9bc40f70-37b7-4513-bd66-598b93736bb3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:35:38.028925	\N	\N	1698	\N	\N	\N
fc2d8597-9a8e-41cf-bebd-57d143ed1009	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:36:38.044474	\N	\N	1758	\N	\N	\N
428d06a2-55da-4991-873e-7c8e221e9588	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:37:38.013297	\N	\N	1818	\N	\N	\N
d9d0b5c5-fcb9-48a1-bcee-3d28eb64f226	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:38:38.031906	\N	\N	1878	\N	\N	\N
abc5b326-6b82-4d27-92d9-7fa70dc22776	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:39:38.016476	\N	\N	1938	\N	\N	\N
2dbc746b-4cc6-44f9-b68e-2c5b2d77f120	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:40:38.03669	\N	\N	1998	\N	\N	\N
be975906-9895-4c03-88f1-7cab627940a9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:41:38.027582	\N	\N	2058	\N	\N	\N
ae8b1408-be37-4442-b01e-88bf57f4dc20	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:42:38.013305	\N	\N	2118	\N	\N	\N
0b3ed539-1a2e-4814-a7a1-08b664d049ef	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:43:38.009928	\N	\N	2178	\N	\N	\N
2125d7c2-2ba7-4a20-ab0a-477a3a3fc3b8	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-07 22:44:38.032839	\N	\N	2238	\N	\N	\N
f1096b8c-802d-47e4-8717-d10748ec8f98	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 16:57:29.532195	\N	\N	2598	\N	\N	\N
27746afe-effe-4b94-ba8f-d6f5f63ab28c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 16:58:29.512345	\N	\N	2658	\N	\N	\N
8f360adc-b110-46db-b00e-a77a737c4e9c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 16:59:29.505325	\N	\N	2718	\N	\N	\N
ecaf545b-0aa9-42f2-b79b-28b556e3a283	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:00:29.506563	\N	\N	2778	\N	\N	\N
14a95794-37d8-4113-8157-7a411ac04a37	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:01:29.509547	\N	\N	2838	\N	\N	\N
0dc98d06-51af-42e4-8f1d-75ee52843f95	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:02:29.507212	\N	\N	2898	\N	\N	\N
86bc1938-8f70-48d6-8c55-ed9a9f1bf0a9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:03:29.81982	\N	\N	2958	\N	\N	\N
fc763e50-4dfa-4159-b7cb-327920c9ea32	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:04:29.522563	\N	\N	3018	\N	\N	\N
5e8765bc-f826-4c39-a700-9f0315008eaa	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:05:29.510628	\N	\N	3078	\N	\N	\N
d0e5cc23-836d-4963-8634-2324d9580165	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:06:29.507825	\N	\N	3138	\N	\N	\N
ac708146-8f6d-4533-b34c-fc69917d9d92	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:07:29.508594	\N	\N	3198	\N	\N	\N
ab8031a3-660a-4cb1-9575-e023a2ee97e3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:08:29.53508	\N	\N	3258	\N	\N	\N
90dff4d0-7998-414b-a8d1-25303520798d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:09:29.539687	\N	\N	3318	\N	\N	\N
9545903b-3c52-4c89-9a46-e06ec1b7820e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:10:29.509348	\N	\N	3378	\N	\N	\N
4de41363-e9ff-4cae-90fc-4a93c396c4af	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:11:29.5132	\N	\N	3438	\N	\N	\N
c3ca16cb-b296-495a-ab41-c5033cb9f021	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:12:29.511501	\N	\N	3498	\N	\N	\N
ba0ee682-191f-4b64-9213-3b944629b856	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:13:29.50633	\N	\N	3558	\N	\N	\N
0e60de0d-0cea-48d4-917b-740b146ba47e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:14:29.51176	\N	\N	3618	\N	\N	\N
733a4b9b-86d4-46bf-91f8-97387292f7e6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:15:29.546902	\N	\N	3678	\N	\N	\N
bf76f2e9-c6f0-4d31-b7f2-8441ca5c69ca	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:16:29.529616	\N	\N	3738	\N	\N	\N
aa98a42e-7c7a-40cb-b624-3d344634857f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:17:29.543685	\N	\N	3798	\N	\N	\N
de257b7b-f2b5-43c7-837e-80a14de6f9e5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:18:29.539339	\N	\N	3858	\N	\N	\N
b6b41806-6829-49d4-aeb8-8321b2e1cde3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:19:29.537581	\N	\N	3918	\N	\N	\N
a6550bd0-71f9-4b2c-95f7-d554de9c81ef	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:20:29.53562	\N	\N	3978	\N	\N	\N
bf598d9b-8a9f-42bf-8c5a-8720b00b580d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:21:29.542515	\N	\N	4038	\N	\N	\N
4c7a1fbe-734a-4e35-b766-9dcf91bf36c8	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:22:29.531056	\N	\N	4098	\N	\N	\N
34e18d62-9742-40e9-ae3f-37b41a66119d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:23:29.540923	\N	\N	4158	\N	\N	\N
20d6fc0e-e0e7-4418-9231-dd5cf546ad8a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:24:29.542034	\N	\N	4218	\N	\N	\N
51ad3022-d0ae-4a7a-b4b4-31014649ae23	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:25:29.534681	\N	\N	4278	\N	\N	\N
e2a5998d-7063-469f-8290-087edea44bcd	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:26:29.542728	\N	\N	4338	\N	\N	\N
4e94a250-2501-4134-a1d5-8bb519488efc	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:27:29.537435	\N	\N	4398	\N	\N	\N
0979f053-0a6f-4b40-89f7-c00ba201d0ee	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:28:29.53071	\N	\N	4458	\N	\N	\N
c5645c39-6915-4854-9f99-901e973d034b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:29:29.548773	\N	\N	4518	\N	\N	\N
acc667fa-a500-40f7-953e-9b5c6c2f03ac	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:30:29.576054	\N	\N	4578	\N	\N	\N
65403955-aa4f-419f-90f4-3999266c5b2f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:31:29.54451	\N	\N	4638	\N	\N	\N
23797117-9c5c-474c-9863-2c9d5e25e661	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:32:29.638497	\N	\N	4698	\N	\N	\N
91e1b24c-63be-468d-97a2-4fc98aa1d92a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:33:29.93068	\N	\N	4758	\N	\N	\N
51fb3b1f-3cb5-4488-a460-2a62f797cf41	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:34:29.692373	\N	\N	4818	\N	\N	\N
59f550c3-e729-47d1-ae88-817fe2eae518	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:35:29.538296	\N	\N	4878	\N	\N	\N
23a60d42-c354-484d-9856-06932b1e4082	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:36:29.545336	\N	\N	4938	\N	\N	\N
ed6c0ed0-f165-4374-9b4e-c4d8941aa955	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:37:29.538362	\N	\N	4998	\N	\N	\N
ae65dd8a-ca57-4293-b2af-b89c8704b355	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:38:29.552461	\N	\N	5058	\N	\N	\N
d33cc6b7-668b-48cb-8e9f-609a2658f84b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:39:29.577018	\N	\N	5118	\N	\N	\N
6f7b4d45-c4bb-433f-9562-de35a04b4c88	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:40:29.542673	\N	\N	5178	\N	\N	\N
b5812c9d-761a-4e8f-92bb-a258292ec249	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:41:29.52011	\N	\N	5238	\N	\N	\N
48ac1982-7788-42be-8907-090e36e90bf4	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:42:29.518547	\N	\N	5298	\N	\N	\N
381818db-b831-424e-b087-07e69b398990	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:43:29.555635	\N	\N	5358	\N	\N	\N
ea66dca5-d314-40ee-b6b4-2e5dcbd4f0c7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:44:29.523551	\N	\N	5418	\N	\N	\N
e5cdb449-f2de-4522-9e33-f93642f72dad	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:45:29.517931	\N	\N	5478	\N	\N	\N
4c31a45d-3cde-46fa-afd0-51520f20dd13	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:46:29.520484	\N	\N	5538	\N	\N	\N
c5d2d238-e999-4fec-b6c3-06ccb66bdfac	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:47:29.531856	\N	\N	5598	\N	\N	\N
b8d6683d-6b9c-4eaa-8b81-d406b2da60ff	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:48:29.540422	\N	\N	5658	\N	\N	\N
d8300046-0373-4b78-a892-846274696d25	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:49:29.546231	\N	\N	5718	\N	\N	\N
a8d036dd-0a08-4e78-b9b3-a1dd75a9ad4d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:50:29.551447	\N	\N	5778	\N	\N	\N
481d698d-0bac-436d-a8e4-ccb78e1a8dc9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:51:29.549121	\N	\N	5838	\N	\N	\N
7ed2036b-b3be-4972-87f1-7c5c9449d19d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:52:29.544721	\N	\N	5898	\N	\N	\N
6a41fbf8-80f6-401e-b8c5-feff0ef996ae	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:53:29.550365	\N	\N	5958	\N	\N	\N
b6dfa618-da68-4f31-b55f-139ce12c89e0	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:54:29.542013	\N	\N	6018	\N	\N	\N
b91debb2-e852-4912-a60f-8613e8421a26	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:55:29.555075	\N	\N	6078	\N	\N	\N
4df36be2-e2cb-4018-a8b8-44830908e1a3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:56:29.563554	\N	\N	6138	\N	\N	\N
60205397-a442-4586-b643-6c3eebc0d24c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:57:29.557389	\N	\N	6198	\N	\N	\N
585e1eee-5fb7-47ef-bf40-0458fa098b4b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:58:29.557161	\N	\N	6258	\N	\N	\N
8ac52bb8-9521-4c71-9e6d-a75b792d4896	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 17:59:29.554094	\N	\N	6318	\N	\N	\N
ecab9ee9-b683-47c7-adda-6469fa61c46f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:00:29.572388	\N	\N	6378	\N	\N	\N
a6d2ee59-dc06-4051-bedd-9ec60804e867	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:01:14.13577	\N	\N	32	\N	\N	\N
0cb9f4d4-7a55-4d79-be6a-71507a486e5b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:01:44.520865	\N	\N	63	\N	\N	\N
200b130a-531a-4db5-98e5-b3775943b970	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:02:14.517468	\N	\N	93	\N	\N	\N
b3b5b3c2-f3ed-401e-984a-a1e036d02f8a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:02:44.839845	\N	\N	123	\N	\N	\N
77324b3d-e762-4442-ab2f-7fc7d7df6ad6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:03:14.523215	\N	\N	153	\N	\N	\N
5ef3d6fa-546b-4fdb-8eb8-581420de5899	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:03:44.524696	\N	\N	183	\N	\N	\N
1aff417a-be2d-4f34-b37f-e3276294bc0c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:04:29.522479	\N	\N	228	\N	\N	\N
14fdd8b6-9a10-4716-948c-7895cce1aef0	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:05:29.528367	\N	\N	288	\N	\N	\N
d335662d-ee3f-4e6a-8f60-86f8dd6b5bf5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:06:29.521758	\N	\N	348	\N	\N	\N
d94443c3-8bbf-43c1-abaf-94f22f5e2630	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:07:29.524289	\N	\N	408	\N	\N	\N
3d7ba38d-091b-482d-a279-00d684709026	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:08:29.548506	\N	\N	468	\N	\N	\N
0bf6b472-9dde-4223-ab71-ae69a5a11193	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:09:29.552226	\N	\N	528	\N	\N	\N
ce0a1b26-f7a8-4546-9b9f-8a5bb1bbe064	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:10:30.22904	\N	\N	588	\N	\N	\N
adb2c8ca-f31d-4dc1-83b0-b5a0179c0532	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:12:11.537247	\N	\N	102	\N	\N	\N
db49651f-ecce-4d92-9f10-cd572d497ff5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:12:41.55715	\N	\N	132	\N	\N	\N
63ec6096-6cd6-4192-bd46-3ea43a1864e7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:13:11.555936	\N	\N	162	\N	\N	\N
da1f8b3a-436a-4543-ad09-f22d63d6f481	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:13:41.536402	\N	\N	192	\N	\N	\N
79f7f75f-2e94-4d25-ab9a-aed567d0cb36	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:14:11.549726	\N	\N	222	\N	\N	\N
42e3e24b-216d-4300-b52c-659e0d78ccfd	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:14:41.644745	\N	\N	252	\N	\N	\N
6922362a-e675-456b-9ba8-43ea4512999b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:15:29.570595	\N	\N	300	\N	\N	\N
2c5b9818-f5e7-49af-ac2d-78d5babe8c0f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:16:29.563673	\N	\N	360	\N	\N	\N
6da136db-15dc-4dd4-a0e6-94f4a7ba59ef	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:17:29.564862	\N	\N	420	\N	\N	\N
e7b5a509-24cd-4191-8965-79c2818115fe	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:18:29.559818	\N	\N	480	\N	\N	\N
5146df76-1de7-4371-8e0e-b67d06d383a9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:19:29.561909	\N	\N	540	\N	\N	\N
fb120f70-0a3a-4875-bcda-a58dfa7bb0eb	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:20:29.566455	\N	\N	600	\N	\N	\N
7eddc30e-1aae-4c46-ac12-40a8d3e2e8dc	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:21:29.565267	\N	\N	660	\N	\N	\N
7ba8f7be-010d-42d8-904b-d693b8e321c6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:22:29.567848	\N	\N	720	\N	\N	\N
930941e7-aac3-4b1c-9cdd-76ab2202337c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:23:29.55861	\N	\N	780	\N	\N	\N
02b1854d-9103-499f-b398-ce02c6e76c60	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:24:29.559709	\N	\N	840	\N	\N	\N
afad5a83-8dff-47b4-9fff-c2f1c2f6fcaa	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:25:29.56415	\N	\N	900	\N	\N	\N
8bd21c63-d67f-403a-83d5-4618d71bf6df	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:26:29.566926	\N	\N	960	\N	\N	\N
a201d0d0-4d41-4af6-ac64-136fca50bf32	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:27:29.561287	\N	\N	1020	\N	\N	\N
72a36187-2d5b-4b84-8ee4-e4f492c88fb8	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:28:29.562778	\N	\N	1080	\N	\N	\N
16262096-69f5-4cbe-b09a-14e852bd3dbe	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:29:29.560468	\N	\N	1140	\N	\N	\N
fc5ef992-d390-45bf-86f7-a484becb9b37	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:30:29.684679	\N	\N	1200	\N	\N	\N
aa8b50fb-1d00-4ebc-85f4-3a19f481247d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:31:29.567928	\N	\N	1260	\N	\N	\N
2f485a77-e999-4bbd-a4eb-b27676359c83	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:32:29.563958	\N	\N	1320	\N	\N	\N
8e4db238-d395-42c0-8444-d353dfab462e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:33:29.892587	\N	\N	1380	\N	\N	\N
dc3e861d-1ad1-41ea-9902-fb52617dc30c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:34:29.687949	\N	\N	1440	\N	\N	\N
95ff05a7-08e1-4f70-bf1a-6db96dc07a60	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:35:29.563754	\N	\N	1500	\N	\N	\N
9a19d9e5-ea16-49e9-83d2-f7cb315f5dbc	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:36:29.559822	\N	\N	1560	\N	\N	\N
c95d8d1b-7511-4506-8855-5c899ebb75b6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:37:29.567516	\N	\N	1620	\N	\N	\N
da1e9054-b6cb-44a2-b554-9fed9d7beb16	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:38:29.563015	\N	\N	1680	\N	\N	\N
cfb1b306-8ed7-4f78-b826-c234cf7e5e11	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:39:29.580603	\N	\N	1740	\N	\N	\N
f55baa25-12e6-4ff6-a009-ef935442d59a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:40:29.55606	\N	\N	1800	\N	\N	\N
56bd6b7b-39aa-4136-8142-7e7e5d60ca15	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:41:29.602255	\N	\N	1860	\N	\N	\N
84e70aba-d27a-4d36-bdc4-e024e2560e90	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:42:29.564366	\N	\N	1920	\N	\N	\N
c2fc3495-d6fe-482c-bd70-1f5691e44356	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:43:29.56318	\N	\N	1980	\N	\N	\N
947a5164-1f8d-43b8-98d8-81c94328400c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:44:29.629724	\N	\N	2040	\N	\N	\N
7bd1fa89-28ab-4fdd-b18b-5516cf21d3cb	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:45:29.565704	\N	\N	2100	\N	\N	\N
d979de60-ffe2-4ac3-967d-4991a0a8e80f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:46:29.566335	\N	\N	2160	\N	\N	\N
765e8a20-180c-4fe0-9f53-e4738d91e8e4	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:47:29.562897	\N	\N	2220	\N	\N	\N
53a7da7a-cbc1-41f9-93c9-fc515149877a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:48:29.565955	\N	\N	2280	\N	\N	\N
00f7b0e2-45ce-45a4-bde5-78f439f5a78e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:49:29.578833	\N	\N	2340	\N	\N	\N
f3665388-3144-4d85-92f3-4ebb522bf23f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:50:29.541454	\N	\N	2400	\N	\N	\N
547d11cd-9b72-4b7b-96d9-53fd5c78ac46	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:51:29.540918	\N	\N	2460	\N	\N	\N
ccd22b54-6b3b-432f-bfec-aa4b3ef852ec	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:52:29.536691	\N	\N	2520	\N	\N	\N
2e1adbb4-a3f7-4292-b958-2a6fe6eb44c6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:53:29.539756	\N	\N	2580	\N	\N	\N
a9196eba-cb8b-49bb-9085-ff081e573d69	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:54:29.537087	\N	\N	2640	\N	\N	\N
c5b24188-5270-4b39-8986-2a285ea187bb	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:55:29.546803	\N	\N	2700	\N	\N	\N
3251c488-804d-4d9d-8d19-200c409536dd	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:56:29.542831	\N	\N	2760	\N	\N	\N
b16a2354-cb72-401f-819a-89d05a8a2424	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:57:29.534597	\N	\N	2820	\N	\N	\N
50d3ab00-8474-4c5d-96dd-c1d9ebb24e88	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:58:29.550456	\N	\N	2880	\N	\N	\N
d4165fed-3545-46c7-acd5-5cb65767d70a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 18:59:29.544824	\N	\N	2940	\N	\N	\N
b209af94-20be-4b93-b49f-6209bce1b66c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:00:29.542071	\N	\N	3000	\N	\N	\N
eb2810a6-5715-4881-88e7-90b606ec1b55	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:01:29.547409	\N	\N	3060	\N	\N	\N
cdf779f1-ef5c-4450-a531-7f739b1eeef9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:02:29.567436	\N	\N	3120	\N	\N	\N
041d83bb-cbed-457e-9304-39c4a2d2e7ce	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:03:30.000183	\N	\N	3180	\N	\N	\N
93737ea6-62a6-46ee-a500-44ed3d8b9482	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:04:29.567853	\N	\N	3240	\N	\N	\N
b4012737-f108-462d-ae32-0c3b93f58940	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:05:29.56626	\N	\N	3300	\N	\N	\N
d1a5cf5c-6f80-4a6c-b253-55e282b55c0b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:06:29.590668	\N	\N	3360	\N	\N	\N
3b302b0a-7497-4fad-a96e-910065582e05	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:07:29.568115	\N	\N	3420	\N	\N	\N
18928581-739d-4e6e-9c2c-9cc3955c4dc1	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:08:29.569868	\N	\N	3480	\N	\N	\N
b415f859-1994-41e3-b07d-8005d92915e2	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:09:29.568415	\N	\N	3540	\N	\N	\N
79147b08-076c-4f1c-af31-3afe19ff0848	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:10:29.568485	\N	\N	3600	\N	\N	\N
e8e65517-6ab1-4947-a8b7-a408438c5dee	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:11:29.567192	\N	\N	3660	\N	\N	\N
3557f69e-70f6-451c-ab00-5762dceb98fb	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:12:29.573775	\N	\N	3720	\N	\N	\N
0058f0a6-15f9-449c-b5ba-39a6f435a107	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:13:29.570885	\N	\N	3780	\N	\N	\N
4bd90629-9869-4495-bad3-7c281eca188c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:14:29.572403	\N	\N	3840	\N	\N	\N
1af22bcb-e366-48f0-8802-8498bb2d3283	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:15:29.573465	\N	\N	3900	\N	\N	\N
7a563fef-bea8-4f0f-a491-68c23aef1f88	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:16:29.572181	\N	\N	3960	\N	\N	\N
2cdd6ed7-558b-4b32-af71-c7429b1e3e11	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:17:14.613458	\N	\N	4006	\N	\N	\N
2c6272c0-8a57-4844-8165-9fd072df6ce3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:17:47.537926	\N	\N	32	\N	\N	\N
78f7f335-0cd9-4baf-bfb5-11df72abcd2f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:18:17.545989	\N	\N	62	\N	\N	\N
5032e646-c6c0-4bb2-9f82-8d818f9fd16d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:18:47.541667	\N	\N	92	\N	\N	\N
04d92460-c8c0-41d0-b4bf-1c26e5fb19f7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:19:17.538501	\N	\N	122	\N	\N	\N
eca871bc-b35f-454d-97ed-543c030cc5b7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:19:47.53776	\N	\N	152	\N	\N	\N
d314d3a0-d600-4a64-933f-17425f65cde3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:20:17.539343	\N	\N	182	\N	\N	\N
88e14eff-0041-490b-9ae5-a2a2fcb1747a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:21:29.538886	\N	\N	254	\N	\N	\N
461314e8-5fc3-4004-b46d-aba26a549fb5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:22:16.646071	\N	\N	37	\N	\N	\N
a292c630-e55b-4fb9-9233-8d1ef1782191	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:22:46.543171	\N	\N	68	\N	\N	\N
96bc6229-481e-4df7-ac2c-55e4e728f39b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:23:16.540672	\N	\N	98	\N	\N	\N
16b0ef53-9ce0-4b5d-bdb7-6517fc01edef	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:23:46.542639	\N	\N	128	\N	\N	\N
212f2d80-94c4-44c7-a84d-1eabcf2a7be5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:24:37.540669	\N	\N	178	\N	\N	\N
6207df64-7598-417f-889a-f8b2d6f06363	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:25:07.541758	\N	\N	209	\N	\N	\N
143615f6-02a4-48ad-a2ab-bdc2f24d2480	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:25:37.555364	\N	\N	239	\N	\N	\N
e9098ac2-eccb-4454-ba55-40ee299f212b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:26:07.541642	\N	\N	268	\N	\N	\N
2c34c96a-efb9-4166-a9bc-c1d4a38403d3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:26:37.542958	\N	\N	299	\N	\N	\N
8a44b12b-a9a6-41b2-920e-599dfe69a44f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:27:29.548302	\N	\N	351	\N	\N	\N
c0cf2442-d570-4000-828a-566f180a1314	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:28:29.557551	\N	\N	411	\N	\N	\N
c2f112ee-2df3-4336-8518-27ca66ba6440	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:29:29.548804	\N	\N	471	\N	\N	\N
8383ba22-a83e-4aa9-9a4b-48238eec6870	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:30:29.54754	\N	\N	531	\N	\N	\N
86b590ac-703e-4f32-9fff-8091d1c9bc0d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:31:29.547481	\N	\N	591	\N	\N	\N
26369d66-4120-4a27-a3a3-1b09ae457fe3	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:32:29.547114	\N	\N	651	\N	\N	\N
048abed5-6f99-4a40-9294-46687702ebf9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:33:29.866681	\N	\N	711	\N	\N	\N
9ad4431d-ea60-4b87-a190-81b5cb7d210e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:34:29.545713	\N	\N	771	\N	\N	\N
c0e9342e-2d81-4286-885e-49b72587ccd1	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:35:29.560275	\N	\N	831	\N	\N	\N
9df259d8-19ad-41d6-8fed-6c1d86daae76	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:36:29.580215	\N	\N	891	\N	\N	\N
edc73f08-f155-4b78-a8bc-a833e6b9bafe	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:37:29.578053	\N	\N	951	\N	\N	\N
a843a00c-9df2-4cd2-81b7-440178f53fdf	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:38:29.580452	\N	\N	1011	\N	\N	\N
ef9994d6-f364-4f7d-a193-2225e537630a	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:39:29.582039	\N	\N	1071	\N	\N	\N
011ebe56-957b-46bc-8030-0fd9883ab5ba	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:40:29.581523	\N	\N	1131	\N	\N	\N
3e22de66-2472-4701-af8d-444020d4cff7	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:41:29.580296	\N	\N	1191	\N	\N	\N
650e7770-be6f-4aa9-a8c9-f69529c1795e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:42:29.577884	\N	\N	1251	\N	\N	\N
7e16cff0-27a0-43ad-9f20-48e820eb6e9f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:43:29.582295	\N	\N	1311	\N	\N	\N
9e8a86fc-5bc1-4cc5-94a2-1872f40b5259	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:44:29.579956	\N	\N	1371	\N	\N	\N
3518d15d-3eab-403c-b871-4bd5ddb84f83	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:45:29.595648	\N	\N	1431	\N	\N	\N
6e6e2d92-5c03-4fce-b440-bba7a32fae8c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:46:29.58089	\N	\N	1491	\N	\N	\N
816eeeba-e3ac-4cf8-a7fd-329cd0afc859	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:47:29.586792	\N	\N	1551	\N	\N	\N
4c5bee59-45ba-4525-a510-770f17fc9fcc	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:48:29.578318	\N	\N	1611	\N	\N	\N
99e0285c-340e-49ff-bfff-978ccb6518cf	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:49:29.568887	\N	\N	1671	\N	\N	\N
0e0cb946-d796-49fe-b971-96dfdd25e5e9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:50:29.581551	\N	\N	1731	\N	\N	\N
fc7b482b-3191-4a9a-9d7f-1bf9c57d26dd	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:51:29.553391	\N	\N	1791	\N	\N	\N
ce243b8d-8a22-4bd7-9395-f488e17d13cf	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:52:29.572107	\N	\N	1851	\N	\N	\N
13d08ae4-5f0c-47eb-9ab1-5e105e9a481c	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:53:29.572658	\N	\N	1911	\N	\N	\N
3c511c2c-1608-4b0f-9320-3fa03b85b433	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:54:29.569502	\N	\N	1971	\N	\N	\N
0b1fdf23-e7bf-4a03-9f6f-fa17eb359670	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:55:29.577726	\N	\N	2031	\N	\N	\N
49bba83e-d2d9-4c2d-9948-6de2fd5ce44e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:56:29.567513	\N	\N	2091	\N	\N	\N
4f5196a6-72d0-489c-aba2-d304b21cd0c9	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:57:29.56714	\N	\N	2151	\N	\N	\N
2085c55b-8f4e-45d4-a901-7415391e82be	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:58:29.55786	\N	\N	2211	\N	\N	\N
a173ff0f-0485-49cb-afd6-56e15c812f68	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 19:59:29.556852	\N	\N	2271	\N	\N	\N
6d7fb677-9629-4f5f-858b-6fb5db1d7759	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:00:29.557249	\N	\N	2331	\N	\N	\N
41f49e32-2411-46a1-b3a7-ad625882799d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:01:29.557028	\N	\N	2391	\N	\N	\N
a23d7aec-2b9b-467d-a31b-2d2e9c933d48	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:02:29.579289	\N	\N	2450	\N	\N	\N
631a62a5-fe60-40b4-9790-9bbed1f45b3d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:03:29.893584	\N	\N	2511	\N	\N	\N
06e500bf-0187-4406-98b3-98dd003d5418	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:04:29.574893	\N	\N	2571	\N	\N	\N
ecdb1198-2096-4ed4-98d4-a3203f312d9b	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:05:29.585211	\N	\N	2631	\N	\N	\N
e316b602-8193-4213-815a-22f8802b01a6	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:06:29.589169	\N	\N	2691	\N	\N	\N
43af7411-c722-4630-855f-8b9e9cef396d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:07:29.580637	\N	\N	2751	\N	\N	\N
ac9b5a30-b56f-4216-9414-9aad8791e1c8	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:08:29.58201	\N	\N	2811	\N	\N	\N
827a2dbc-d6c1-4d46-9aee-c99d6ad0d82e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:09:29.581911	\N	\N	2871	\N	\N	\N
824d852b-4ffa-480b-aed3-80924b3c6427	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:10:29.579596	\N	\N	2931	\N	\N	\N
e957ecf6-b1a9-429f-89a4-10251abe6f60	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:11:29.587121	\N	\N	2991	\N	\N	\N
483a1b4e-cde1-483a-ad24-3fe835d07268	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:12:29.581484	\N	\N	3051	\N	\N	\N
b97d10f3-4fe4-47d3-a350-6bded7cfc991	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:13:29.57965	\N	\N	3111	\N	\N	\N
94dc66e6-7d71-44ca-81ba-0a4e1d99e255	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:14:29.596219	\N	\N	3171	\N	\N	\N
7588ed0c-de0c-4fd8-9ce0-d8bcd8bb5a90	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:15:29.580405	\N	\N	3231	\N	\N	\N
627e8c74-de2e-4e8e-93c9-85527eff5370	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:16:29.597146	\N	\N	3291	\N	\N	\N
4d4f0633-982d-4a5c-93e3-0e83c1cbd343	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:17:29.586871	\N	\N	3351	\N	\N	\N
0bf49342-8b9f-4013-ae3f-b0f982407893	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:18:29.589207	\N	\N	3411	\N	\N	\N
c600374a-df31-4734-ab8d-e7a30da53628	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:19:29.59041	\N	\N	3471	\N	\N	\N
8198e784-2073-4733-bfd8-af66226f7b03	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:20:29.598224	\N	\N	3531	\N	\N	\N
7af5a48a-0f92-4872-9d11-c9c4091fb4d1	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:21:29.584744	\N	\N	3591	\N	\N	\N
3dc40118-cf9a-44d8-a305-b71d89abaac8	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:22:29.600631	\N	\N	3651	\N	\N	\N
44490491-3705-44e6-82aa-d377f8d14156	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:23:29.586679	\N	\N	3711	\N	\N	\N
16c5a36e-00e6-4bd5-ad53-eb20e70ed197	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:24:29.601934	\N	\N	3771	\N	\N	\N
c7a9bc7a-1444-437e-968e-167e70681f52	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:25:29.590412	\N	\N	3831	\N	\N	\N
560e5d71-777f-487f-bed8-98db10084c8d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:26:29.601515	\N	\N	3891	\N	\N	\N
fbc7fdda-546e-4e88-b1fd-6b13496c4396	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:27:29.596411	\N	\N	3951	\N	\N	\N
6f38797c-c5d0-48da-baf7-953705f21358	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:28:29.586684	\N	\N	4011	\N	\N	\N
d6640ea2-3572-4751-848b-ab19971310b2	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:29:29.609957	\N	\N	4071	\N	\N	\N
827144e3-06fd-48ed-83ac-bb5fb5e7f333	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:30:29.60832	\N	\N	4131	\N	\N	\N
70ac0f56-8bf4-490f-a7cc-1cd12326e4de	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:31:29.591299	\N	\N	4191	\N	\N	\N
00ecbf3c-7754-43a5-85d9-a788b1984e57	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:32:29.593227	\N	\N	4251	\N	\N	\N
1158c60d-6a20-42dc-ac23-f0ad577c7bce	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:33:29.916366	\N	\N	4311	\N	\N	\N
f938fe17-1d2a-448f-a989-4223358107ad	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:34:29.604779	\N	\N	4371	\N	\N	\N
e3e4e1b9-90b3-47a6-9096-c8259c6f7f5e	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:35:29.594504	\N	\N	4431	\N	\N	\N
cf6efcd9-5475-4aee-bdd0-b7bc4bff35e5	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:36:29.599946	\N	\N	4491	\N	\N	\N
a181af6a-eb5b-468e-aebc-b8dd3f6d788f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:37:29.604561	\N	\N	4551	\N	\N	\N
c0d3c800-22c8-4d04-ae8e-1e63034b5a48	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:38:29.597537	\N	\N	4611	\N	\N	\N
58c5d75c-8908-4573-9d33-6b990cdc4f92	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:39:29.599513	\N	\N	4671	\N	\N	\N
37562ba8-3bd6-4975-8841-94e5e526b4c8	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:40:29.596037	\N	\N	4731	\N	\N	\N
9cd01d7a-59b8-4148-8549-f0983304c70d	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:41:29.590737	\N	\N	4791	\N	\N	\N
235e2662-23d6-4e27-bc41-57d1687eab3f	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:42:29.596956	\N	\N	4851	\N	\N	\N
833dc624-2be5-4252-ac66-98803af58e93	34d45319-4e22-441f-867e-542c8122bb7b	2026-03-08 20:43:29.588459	\N	\N	4911	\N	\N	\N
\.


--
-- Data for Name: playlist_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.playlist_items (id, playlist_id, media_asset_id, "order", duration) FROM stdin;
\.


--
-- Data for Name: playlists; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.playlists (id, event_id, name, description, created_at, updated_at) FROM stdin;
ca42ef9c-a88d-4077-b551-85eae704db23	\N	Welcome		2026-01-27 14:31:29.188584	2026-03-07 18:55:12.097
\.


--
-- Data for Name: programme_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.programme_versions (id, programme_id, version_number, status, published_at, created_at) FROM stdin;
4d40fafd-c249-4f88-851c-26acad467fe7	d2d03682-c4a7-4d5a-80a3-337ccd1e3081	1	published	2026-02-21 17:39:54.575	2026-01-27 14:31:56.986701
4ec20be5-c50a-4924-8412-680811f75988	b94d661a-b589-43e9-888e-bc57133f70f2	1	published	2026-03-07 19:21:06.859	2026-03-07 19:00:39.842319
\.


--
-- Data for Name: programmes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.programmes (id, event_id, name, description, created_at, updated_at) FROM stdin;
d2d03682-c4a7-4d5a-80a3-337ccd1e3081	8efa891f-4bab-493a-8af2-17c3069aa5bf	Welcome		2026-01-27 14:31:56.981311	2026-02-21 17:39:51.185
b94d661a-b589-43e9-888e-bc57133f70f2	8efa891f-4bab-493a-8af2-17c3069aa5bf	Holding screen		2026-03-07 19:00:39.64128	2026-03-07 19:00:39.64128
\.


--
-- Data for Name: schedule_blocks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schedule_blocks (id, programme_version_id, name, priority, layout_template_id, targets, time_rules, zone_sources, created_at) FROM stdin;
2727dbc9-3e6d-40ce-9a5f-42d01ee47933	4d40fafd-c249-4f88-851c-26acad467fe7	block-rq4RCM	5	\N	\N	\N	\N	2026-01-27 15:07:46.585915
c134e116-d67d-4f86-b126-7da040e38d71	4d40fafd-c249-4f88-851c-26acad467fe7	Welcome	0	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	[]	[{"endTime": "22:00", "startDate": "2026-02-01", "startTime": "01:00"}]	[]	2026-02-04 17:53:44.691033
37d969af-2dc0-446b-9790-b323ee1f5a5a	4d40fafd-c249-4f88-851c-26acad467fe7	Last orders	0	55c58437-1103-4425-a947-47d8b156a760	[]	[{"endTime": "00:00", "startDate": "2026-02-20", "startTime": "22:00"}]	[]	2026-02-21 23:04:50.973484
90c71877-8594-432c-98ea-5545d356cfb7	4d40fafd-c249-4f88-851c-26acad467fe7	Last orders	0	55c58437-1103-4425-a947-47d8b156a760	[]	[{"endTime": "00:00", "startDate": "2026-02-21", "startTime": "22:00"}]	[]	2026-02-21 23:07:29.474213
50e96515-b747-4f51-85fe-8f16e69262fd	4d40fafd-c249-4f88-851c-26acad467fe7	Last orders	0	55c58437-1103-4425-a947-47d8b156a760	[]	[{"endTime": "00:00", "startDate": "2026-02-20", "startTime": "22:00"}]	[]	2026-02-21 23:08:54.379447
b1318aea-f408-48cc-95a1-2261661702c8	4d40fafd-c249-4f88-851c-26acad467fe7	Last orders	0	55c58437-1103-4425-a947-47d8b156a760	[]	[{"endTime": "00:00", "startDate": "2026-02-21", "startTime": "22:00"}]	[]	2026-02-21 23:10:55.682508
50647d76-98d8-4816-a26d-33e2c085e176	4d40fafd-c249-4f88-851c-26acad467fe7	Last orders	0	55c58437-1103-4425-a947-47d8b156a760	[]	[{"endTime": "00:00", "startDate": "2026-02-15", "startTime": "22:00"}]	[]	2026-02-21 23:18:26.932245
f9d03ba1-f567-4ac1-a8d8-236835ba1c18	4ec20be5-c50a-4924-8412-680811f75988	Holding State	100	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	[{"id": "d4187726-e894-4c46-8f20-5987423a141a", "type": "screen"}]	[{"endTime": "20:00", "startTime": "06:00"}]	[]	2026-03-07 19:12:22.952506
\.


--
-- Data for Name: screen_group_memberships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screen_group_memberships (id, screen_id, group_id) FROM stdin;
\.


--
-- Data for Name: screen_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screen_groups (id, name, description, created_at, client_id) FROM stdin;
\.


--
-- Data for Name: screens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.screens (id, name, location, display_profile_id, pairing_code, is_paired, is_online, last_seen, ip_address, hardware_class, current_event_id, created_at, updated_at, device_token, fallback_layout_id, client_id) FROM stdin;
d4187726-e894-4c46-8f20-5987423a141a	4K Landscape Monitor		2dbdd6a6-8e89-4c22-8c5e-079e5d09e84a	0JAJL9	t	f	2026-03-07 19:59:51.895	10.81.14.205	raspberry_pi	\N	2026-03-07 18:50:16.632021	2026-03-07 19:59:51.895	59e5089108c99ac1bb1fed1c6e5219d1fb6399ff0573f65d65a0efcf89f4c6ea	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	\N
34d45319-4e22-441f-867e-542c8122bb7b	Conference room 2	1st Floor	dbeee0e0-37a6-4c5b-972c-e43fb0716dd7	Y09GWF	t	t	2026-03-08 20:43:29.602	10.81.13.160	raspberry_pi	8efa891f-4bab-493a-8af2-17c3069aa5bf	2026-01-27 14:15:04.12527	2026-03-08 20:43:29.602	dd417daeb1dd8cd951dd138b71231fdc4782fd20052a239f723fd45c7996358b	\N	\N
b33a6919-df32-4688-8acf-be5ff1575a72	Conference room 1	1st Floor	4b2bd609-4a85-4417-8fc1-8e3b6f62005e	V6LAL5	t	f	2026-03-07 20:03:34.223	10.81.9.179	raspberry_pi	8efa891f-4bab-493a-8af2-17c3069aa5bf	2026-01-27 14:14:20.171211	2026-03-07 20:03:34.223	11b96bf237eddcbd8e11e7089e3635f1a3be77314c044cbe7dfbfcf3afa952a4	\N	\N
fdba1c22-f3ae-4574-856a-810bf9525140	IPad 1		2dbdd6a6-8e89-4c22-8c5e-079e5d09e84a	BSUK8M	t	f	2026-03-07 20:04:36.513	10.81.17.79	raspberry_pi	\N	2026-03-07 19:11:45.906667	2026-03-07 20:04:36.513	fa8d944c049bbe281fc1a8861f7b81ccf4f5642aa95a03ada25ae612b178e820	57e3c895-c2e1-45ae-962d-62b8f51f1ef7	\N
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (sid, sess, expire) FROM stdin;
7L-crUbTZiGlkjdafL_vXw8G14yiTIHP	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T22:27:40.021Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 22:27:46
Ub1pTQ6n2T-thuNBEjhdiNZ2IheTybI0	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T17:09:10.892Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 17:09:25
lJ3f8gpMkQbzNZqup-BUnrPCNGlIOrsz	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T20:08:19.511Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 20:08:55
psYWyOXnWFT-v0oUFTU_NPZQFo-bit7y	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T17:43:38.917Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 17:44:13
7ITSI8z9uYJj6Ug5Rg6sqweSFgKusYSu	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T19:31:52.906Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 19:32:40
bZXmV60x-hQJhpxRKAl4GjtSPo6eb7v7	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T22:21:01.062Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 22:21:27
GTLAWvf9AyUswcqyN_GO7bYORxWOT4_a	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T14:25:14.962Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 14:25:52
dkTZYRIDQxRZEhE4rxAEtBKfnTLCcZMh	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T19:45:56.686Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 19:46:31
0ByIakUEv8OmmuTAgEqKB79TP4FpJ-wI	{"cookie": {"path": "/", "secure": true, "expires": "2026-03-15T18:50:11.679Z", "httpOnly": true, "originalMaxAge": 604800000}, "userId": "43484205", "passport": {"user": {"claims": {"aud": "9c915969-0959-45f5-af99-4a231bcf9456", "exp": 1772839088, "iat": 1772835488, "iss": "https://replit.com/oidc", "sub": "43484205", "email": "stompkins@4wall.com", "at_hash": "KksDxukIr_j5wFAb8w2R_A", "username": "stompkins1", "auth_time": 1772831885, "last_name": "Tompkins", "first_name": "Scott", "email_verified": true}, "expires_at": 1772839088, "access_token": "o8y467d7C8R_DHx9BYjXxWnoBtIpV_lPd-cIc4-9zHc", "refresh_token": "CERB-PVND58m7o7A37GaUx4U9hU_bciow2GMYg_pdBo"}}}	2026-03-15 20:43:30
9_P1My8vJZWUJvCNKEuvFYGJbGlPORK4	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:01:15.028Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:01:50
4zwCj2TS5s3bz6QMCilztui6Mk7ZOMwx	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:42:04.019Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:43:47
mJBnannKznws5pHv1L9z_sI8C6TcZ3M4	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:24:29.046Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:24:35
zD1N1N1bJMr61ZPHZK6vCEP3Jd4MyxFH	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T16:17:42.459Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 16:18:06
jcfqdA2Q56eM9Lwmt2JDJimn6AoiLtDz	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T22:42:19.453Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 22:44:01
13NwCVKL5GyUhwf3RQsxhwj4-s20Sz9B	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:22:45.942Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:22:46
_0TvW_ph6isnEb0tsgefJ01nYcTdQt3b	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:15:29.268Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:16:04
jrtKTRwL1lxuHFMx2bCa0JVcEH5ihnRD	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:22:50.934Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:23:00
R6BWRPgKTZ8azeHHSYFFKyMPYEwVEI8y	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T19:10:23.634Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 19:12:38
vIWygsuwno1_h-MN5sVwsgbsBpyFZXUd	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:23:33.306Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 18:23:39
uwipwH3VoEjKxxHxfF_O6QY2HDgf4m-V	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T16:49:22.373Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 16:49:48
NoEEz1m_fzf-vZlXBXsDk4JV0G4YNx5h	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T14:11:43.102Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 14:12:11
YgD-QbvKZN80UCdVjhijY2bfqbwO9z4A	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-13T22:28:53.006Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "24adba66-5e72-4856-aeaf-09e7456ceb34"}	2026-03-13 22:29:08
KZYh-w3j7p_hqAQvWeSOZcod8fZuNZR-	{"cookie": {"path": "/", "secure": true, "expires": "2026-03-13T21:41:17.041Z", "httpOnly": true, "originalMaxAge": 604800000}, "replit.com": {"code_verifier": "5Csdm8-TMyZkzJZVlC0-wqQ6mcVajSxXbuM_BiFsOo4"}}	2026-03-13 21:41:33
DtFu0J7PSnvqpLnbT8RjeWGZvZJgMv9Q	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T18:25:08.621Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604799999}, "userId": "43484205"}	2026-03-14 18:25:16
2ka5JocrE9hh6MPREinV_AeN2I_2CQYF	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-14T19:55:03.489Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "43484205"}	2026-03-14 19:55:18
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (key, value, updated_at) FROM stdin;
\.


--
-- Data for Name: user_sites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sites (id, user_id, client_id, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, first_name, last_name, profile_image_url, created_at, updated_at, role, password_hash, must_change_password, is_active, last_login_at, two_factor_secret, two_factor_enabled) FROM stdin;
43484205	stompkins@4wall.com	Scott	Tompkins	\N	2026-01-27 14:02:45.756732	2026-03-08 18:50:11.674	admin	$2b$12$pQxjx1FJhVYDDYuBuThhXu10Yeri71Nkg/iLCdF5egOrGp8t7wfdK	f	t	2026-03-07 22:42:19.443	RPDOOOZTI2ZPF5BWV4TXAO4LKIXR5KDX	t
RA2F8H	RA2F8H@example.com	John	Doe	\N	2026-01-30 02:22:25.524419	2026-01-30 02:22:25.524419	site_user	\N	f	t	\N	\N	f
YFo7oE	YFo7oE@example.com	John	Doe	\N	2026-01-30 02:34:59.044998	2026-01-30 02:34:59.044998	site_user	\N	f	t	\N	\N	f
\.


--
-- Data for Name: weather_cache; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.weather_cache (id, location, data, updated_at) FROM stdin;
\.


--
-- Name: alert_history alert_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);


--
-- Name: alert_settings alert_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_settings
    ADD CONSTRAINT alert_settings_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: brand_packs brand_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_packs
    ADD CONSTRAINT brand_packs_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: display_profiles display_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.display_profiles
    ADD CONSTRAINT display_profiles_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: layout_templates layout_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layout_templates
    ADD CONSTRAINT layout_templates_pkey PRIMARY KEY (id);


--
-- Name: live_overrides live_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_overrides
    ADD CONSTRAINT live_overrides_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: media_shares media_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_shares
    ADD CONSTRAINT media_shares_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_unique UNIQUE (token);


--
-- Name: player_heartbeats player_heartbeats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_heartbeats
    ADD CONSTRAINT player_heartbeats_pkey PRIMARY KEY (id);


--
-- Name: playlist_items playlist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_pkey PRIMARY KEY (id);


--
-- Name: playlists playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);


--
-- Name: programme_versions programme_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programme_versions
    ADD CONSTRAINT programme_versions_pkey PRIMARY KEY (id);


--
-- Name: programmes programmes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_pkey PRIMARY KEY (id);


--
-- Name: schedule_blocks schedule_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_blocks
    ADD CONSTRAINT schedule_blocks_pkey PRIMARY KEY (id);


--
-- Name: screen_group_memberships screen_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_group_memberships
    ADD CONSTRAINT screen_group_memberships_pkey PRIMARY KEY (id);


--
-- Name: screen_groups screen_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_groups
    ADD CONSTRAINT screen_groups_pkey PRIMARY KEY (id);


--
-- Name: screens screens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: user_sites user_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sites
    ADD CONSTRAINT user_sites_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: weather_cache weather_cache_location_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_location_unique UNIQUE (location);


--
-- Name: weather_cache weather_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: audit_logs audit_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: brand_packs brand_packs_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_packs
    ADD CONSTRAINT brand_packs_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: display_profiles display_profiles_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.display_profiles
    ADD CONSTRAINT display_profiles_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: events events_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: layout_templates layout_templates_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layout_templates
    ADD CONSTRAINT layout_templates_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: live_overrides live_overrides_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_overrides
    ADD CONSTRAINT live_overrides_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: live_overrides live_overrides_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_overrides
    ADD CONSTRAINT live_overrides_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: live_overrides live_overrides_layout_template_id_layout_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_overrides
    ADD CONSTRAINT live_overrides_layout_template_id_layout_templates_id_fk FOREIGN KEY (layout_template_id) REFERENCES public.layout_templates(id);


--
-- Name: media_assets media_assets_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: media_shares media_shares_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_shares
    ADD CONSTRAINT media_shares_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: media_shares media_shares_media_asset_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_shares
    ADD CONSTRAINT media_shares_media_asset_id_media_assets_id_fk FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: player_heartbeats player_heartbeats_screen_id_screens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_heartbeats
    ADD CONSTRAINT player_heartbeats_screen_id_screens_id_fk FOREIGN KEY (screen_id) REFERENCES public.screens(id) ON DELETE CASCADE;


--
-- Name: playlist_items playlist_items_media_asset_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_media_asset_id_media_assets_id_fk FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: playlist_items playlist_items_playlist_id_playlists_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_playlist_id_playlists_id_fk FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;


--
-- Name: playlists playlists_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: programme_versions programme_versions_programme_id_programmes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programme_versions
    ADD CONSTRAINT programme_versions_programme_id_programmes_id_fk FOREIGN KEY (programme_id) REFERENCES public.programmes(id) ON DELETE CASCADE;


--
-- Name: programmes programmes_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: schedule_blocks schedule_blocks_layout_template_id_layout_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_blocks
    ADD CONSTRAINT schedule_blocks_layout_template_id_layout_templates_id_fk FOREIGN KEY (layout_template_id) REFERENCES public.layout_templates(id);


--
-- Name: schedule_blocks schedule_blocks_programme_version_id_programme_versions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_blocks
    ADD CONSTRAINT schedule_blocks_programme_version_id_programme_versions_id_fk FOREIGN KEY (programme_version_id) REFERENCES public.programme_versions(id) ON DELETE CASCADE;


--
-- Name: screen_group_memberships screen_group_memberships_group_id_screen_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_group_memberships
    ADD CONSTRAINT screen_group_memberships_group_id_screen_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.screen_groups(id) ON DELETE CASCADE;


--
-- Name: screen_group_memberships screen_group_memberships_screen_id_screens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_group_memberships
    ADD CONSTRAINT screen_group_memberships_screen_id_screens_id_fk FOREIGN KEY (screen_id) REFERENCES public.screens(id) ON DELETE CASCADE;


--
-- Name: screen_groups screen_groups_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_groups
    ADD CONSTRAINT screen_groups_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: screens screens_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: screens screens_current_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_current_event_id_events_id_fk FOREIGN KEY (current_event_id) REFERENCES public.events(id);


--
-- Name: screens screens_display_profile_id_display_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_display_profile_id_display_profiles_id_fk FOREIGN KEY (display_profile_id) REFERENCES public.display_profiles(id);


--
-- Name: screens screens_fallback_layout_id_layout_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_fallback_layout_id_layout_templates_id_fk FOREIGN KEY (fallback_layout_id) REFERENCES public.layout_templates(id) ON DELETE SET NULL;


--
-- Name: user_sites user_sites_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sites
    ADD CONSTRAINT user_sites_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict j8xyhvHLOeiDwoz9BhXQPwgyTrfIyhfOendrReyQ79dE8RvnWFk5LKPpuxMLDg7

