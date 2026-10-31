-- Core schema for the job matching platform.
-- See PROJECT_SPEC.md section 4.

create extension if not exists vector with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  contact_email text,
  contact_email_verified_at timestamptz,
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_verified_at timestamptz,
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default false,
  cv_path text,
  parsed_profile jsonb,
  preferences jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768),
  onboarding_status text not null default 'new'
    check (onboarding_status in ('new', 'cv_uploaded', 'profile_ready', 'matching', 'matched', 'error')),
  last_matched_at timestamptz,
  notifications_paused boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id bigint generated always as identity primary key,
  adzuna_id text not null unique,
  title text not null,
  company text,
  description text,
  location_display text,
  province text,
  city text,
  -- Adzuna reports salaries per year. The my_matches view converts to monthly.
  salary_min numeric,
  salary_max numeric,
  salary_is_predicted boolean not null default false,
  contract_type text,
  contract_time text,
  category_tag text,
  category_label text,
  redirect_url text not null,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  enrichment jsonb,
  embedding extensions.vector(768),
  content_hash text not null
);

-- Near-duplicate guard: the same title + company + location is stored once.
create unique index jobs_content_hash_key on public.jobs (content_hash);
create index jobs_embedding_idx on public.jobs using hnsw (embedding extensions.vector_cosine_ops);
create index jobs_posted_at_idx on public.jobs (posted_at);
create index jobs_province_idx on public.jobs (province);
create index jobs_city_idx on public.jobs (city);
create index jobs_first_seen_at_idx on public.jobs (first_seen_at);
create index jobs_needs_embedding_idx on public.jobs (id) where embedding is null;

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table public.matches (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id bigint not null references public.jobs (id) on delete cascade,
  score smallint not null,           -- INTERNAL ONLY
  reason text not null,
  gaps text[] not null default '{}', -- internal
  -- 'onboarding' = shown on screen right away (never emailed); 'daily' = found by the daily run.
  source text not null default 'daily' check (source in ('onboarding', 'daily')),
  viewed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index matches_user_created_idx on public.matches (user_id, created_at desc);
create index matches_unnotified_idx on public.matches (user_id) where notified_at is null;

-- ---------------------------------------------------------------------------
-- operational tables (service role only)
-- ---------------------------------------------------------------------------
create table public.ingest_runs (
  id bigint generated always as identity primary key,
  mode text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  api_calls int not null default 0,
  fetched int not null default 0,
  inserted int not null default 0,
  error text
);

-- Key/value state, e.g. the backfill cursor.
create table public.ingest_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  channel text not null,
  kind text not null default 'digest',
  status text not null,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create table public.llm_usage (
  id bigint generated always as identity primary key,
  function_name text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Simple per-user rate limiting (CV parses, match re-runs, verification emails).
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on public.rate_limit_events (user_id, action, created_at);

create table public.email_verifications (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

-- Create the profile row from signup metadata.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wa text := nullif(trim(meta ->> 'whatsapp_number'), '');
begin
  if wa is not null and wa !~ '^\+[1-9][0-9]{7,14}$' then
    wa := null;
  end if;
  insert into public.profiles (id, full_name, contact_email, whatsapp_number, consent_at)
  values (
    new.id,
    nullif(trim(meta ->> 'full_name'), ''),
    coalesce(nullif(trim(meta ->> 'contact_email'), ''), new.email),
    wa,
    case when (meta ->> 'consent') = 'true' then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh and reset verification when a contact detail changes.
create function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.contact_email is distinct from old.contact_email then
    new.contact_email_verified_at := null;
  end if;
  if new.whatsapp_number is distinct from old.whatsapp_number then
    new.whatsapp_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();
