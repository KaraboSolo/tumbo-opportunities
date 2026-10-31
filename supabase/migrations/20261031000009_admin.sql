-- Admin portal: an admins table, an is_admin() check, and read-only RPCs that
-- return aggregated data to admins only. Writes go through the "admin" Edge Function.
-- Match scores stay internal: no admin RPC returns them.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- No policies: only the service role and the definer functions below read it.

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Overview numbers
-- ---------------------------------------------------------------------------
create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'matched', (select count(*) from public.profiles where onboarding_status = 'matched'),
      'onboarding', (select count(*) from public.profiles where onboarding_status in ('new', 'cv_uploaded', 'profile_ready')),
      'errors', (select count(*) from public.profiles where onboarding_status = 'error'),
      'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'email_confirmed', (select count(*) from public.profiles where contact_email_verified_at is not null),
      'paused', (select count(*) from public.profiles where notifications_paused)
    ),
    'jobs', jsonb_build_object(
      'total', (select count(*) from public.jobs),
      'active', (select count(*) from public.jobs where posted_at > now() - interval '30 days'),
      'added_24h', (select count(*) from public.jobs where first_seen_at > now() - interval '24 hours'),
      'unembedded', (select count(*) from public.jobs where embedding is null),
      'last_sync', (select max(started_at) from public.ingest_runs),
      'api_calls_today', (select coalesce(sum(api_calls), 0) from public.ingest_runs where started_at >= current_date)
    ),
    'matches', jsonb_build_object(
      'total', (select count(*) from public.matches),
      'last_7d', (select count(*) from public.matches where created_at > now() - interval '7 days'),
      'viewed', (select count(*) from public.matches where viewed_at is not null)
    ),
    'emails', jsonb_build_object(
      'sent_7d', (select count(*) from public.notification_log where status = 'sent' and created_at > now() - interval '7 days'),
      'failed_7d', (select count(*) from public.notification_log where status = 'failed' and created_at > now() - interval '7 days')
    ),
    'llm', jsonb_build_object(
      'calls_7d', (select count(*) from public.llm_usage where created_at > now() - interval '7 days'),
      'input_tokens_7d', (select coalesce(sum(input_tokens), 0) from public.llm_usage where created_at > now() - interval '7 days'),
      'output_tokens_7d', (select coalesce(sum(output_tokens), 0) from public.llm_usage where created_at > now() - interval '7 days')
    ),
    'government', jsonb_build_object(
      'enabled', public.setting_enabled('gov_vacancies_enabled'),
      'open_posts', (select count(*) from public.gov_vacancies v join public.gov_circulars c on c.id = v.circular_id
                     where c.status = 'ready' and c.published and (v.closing_date is null or v.closing_date >= current_date))
    )
  ) into result;
  return result;
end;
$$;

-- Daily signups and matches for the last 14 days, for the overview chart.
create function public.admin_daily(p_days int default 14)
returns table (day date, signups bigint, matches bigint, jobs bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select d::date,
    (select count(*) from public.profiles p where p.created_at::date = d::date),
    (select count(*) from public.matches m where m.created_at::date = d::date),
    (select count(*) from public.jobs j where j.first_seen_at::date = d::date)
  from generate_series(current_date - (p_days - 1), current_date, interval '1 day') d
  order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create function public.admin_users(p_search text default '', p_status text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid,
  full_name text,
  login_email text,
  contact_email text,
  email_confirmed boolean,
  whatsapp_number text,
  onboarding_status text,
  notify_email boolean,
  notifications_paused boolean,
  headline text,
  target_roles text,
  matches bigint,
  new_matches bigint,
  created_at timestamptz,
  last_matched_at timestamptz,
  is_admin boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select p.id, p.full_name, u.email::text, p.contact_email, p.contact_email_verified_at is not null, p.whatsapp_number,
    p.onboarding_status, p.notify_email, p.notifications_paused,
    p.parsed_profile ->> 'headline',
    (select string_agg(r, ', ') from jsonb_array_elements_text(coalesce(p.preferences -> 'target_roles', '[]')) r),
    (select count(*) from public.matches m where m.user_id = p.id),
    (select count(*) from public.matches m where m.user_id = p.id and m.viewed_at is null),
    p.created_at, p.last_matched_at,
    exists (select 1 from public.admins a where a.user_id = p.id),
    count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  where (coalesce(p_search, '') = ''
         or p.full_name ilike '%' || p_search || '%'
         or p.contact_email ilike '%' || p_search || '%'
         or u.email ilike '%' || p_search || '%')
    and (p_status is null or p.onboarding_status = p_status)
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pipeline, usage and notifications
-- ---------------------------------------------------------------------------
create function public.admin_ingest_runs(p_limit int default 30)
returns setof public.ingest_runs
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query select * from public.ingest_runs order by started_at desc limit least(p_limit, 200);
end;
$$;

create function public.admin_llm_usage(p_days int default 30)
returns table (function_name text, model text, calls bigint, input_tokens bigint, output_tokens bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select l.function_name, l.model, count(*), sum(l.input_tokens)::bigint, sum(l.output_tokens)::bigint
  from public.llm_usage l
  where l.created_at > now() - make_interval(days => p_days)
  group by 1, 2
  order by 4 desc;
end;
$$;

create function public.admin_notifications(p_limit int default 50)
returns table (id bigint, created_at timestamptz, channel text, kind text, status text, error text, recipient text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select n.id, n.created_at, n.channel, n.kind, n.status, n.error, p.full_name
  from public.notification_log n
  left join public.profiles p on p.id = n.user_id
  order by n.created_at desc
  limit least(p_limit, 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Government circulars with progress
-- ---------------------------------------------------------------------------
create function public.admin_circulars()
returns table (
  id bigint,
  circular_number int,
  year int,
  issued_on date,
  storage_path text,
  page_count int,
  status text,
  published boolean,
  missing_post_numbers int[],
  error text,
  created_at timestamptz,
  processed_at timestamptz,
  posts bigint,
  open_posts bigint,
  chunks_total bigint,
  chunks_done bigint,
  chunks_failed bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select c.id, c.circular_number, c.year, c.issued_on, c.storage_path, c.page_count, c.status, c.published,
    c.missing_post_numbers, c.error, c.created_at, c.processed_at,
    (select count(*) from public.gov_vacancies v where v.circular_id = c.id),
    (select count(*) from public.gov_vacancies v where v.circular_id = c.id and (v.closing_date is null or v.closing_date >= current_date)),
    (select count(*) from public.gov_ingest_chunks k where k.circular_id = c.id),
    (select count(*) from public.gov_ingest_chunks k where k.circular_id = c.id and k.status = 'done'),
    (select count(*) from public.gov_ingest_chunks k where k.circular_id = c.id and k.status = 'failed')
  from public.gov_circulars c
  order by c.created_at desc;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_overview()', 'admin_daily(int)', 'admin_users(text, text, int, int)', 'admin_ingest_runs(int)',
    'admin_llm_usage(int)', 'admin_notifications(int)', 'admin_circulars()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
