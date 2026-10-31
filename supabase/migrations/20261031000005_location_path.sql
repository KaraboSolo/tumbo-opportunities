-- Adzuna's location.area is deeper than first assumed, for example
-- ["South Africa", "Western Cape", "Cape Town Region", "Cape Town City Centre", "Durbanville"].
-- Keep the full path so a preferred city matches at any level.

alter table public.jobs add column area_path text;

create or replace function public.ingest_jobs(p_jobs jsonb)
returns int
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.jobs (
      adzuna_id, title, company, description, location_display, province, city, area_path,
      salary_min, salary_max, salary_is_predicted, contract_type, contract_time,
      category_tag, category_label, redirect_url, posted_at, content_hash
    )
    select
      r.adzuna_id, r.title, r.company, r.description, r.location_display, r.province, r.city, r.area_path,
      r.salary_min, r.salary_max, coalesce(r.salary_is_predicted, false), r.contract_type, r.contract_time,
      r.category_tag, r.category_label, r.redirect_url, r.posted_at, r.content_hash
    from jsonb_to_recordset(p_jobs) as r (
      adzuna_id text, title text, company text, description text, location_display text,
      province text, city text, area_path text, salary_min numeric, salary_max numeric, salary_is_predicted boolean,
      contract_type text, contract_time text, category_tag text, category_label text,
      redirect_url text, posted_at timestamptz, content_hash text
    )
    on conflict do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;

create or replace function public.candidate_jobs(p_user_id uuid, p_limit int default 40, p_only_new boolean default false)
returns table (
  id bigint,
  title text,
  company text,
  location_display text,
  province text,
  city text,
  salary_min numeric,
  salary_max numeric,
  salary_is_predicted boolean,
  contract_type text,
  contract_time text,
  category_label text,
  description text,
  posted_at timestamptz,
  distance double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  prefs jsonb;
  provinces text[];
  cities text[];
  remote_ok boolean;
  min_salary numeric;
  types text[];
  time_types text[];
  contract_types text[];
begin
  select * into p from public.profiles where profiles.id = p_user_id;
  if p.id is null or p.embedding is null then
    return;
  end if;

  prefs := coalesce(p.preferences, '{}'::jsonb);
  provinces := array(select lower(jsonb_array_elements_text(coalesce(prefs -> 'provinces', '[]'))));
  cities := array(select lower(jsonb_array_elements_text(coalesce(prefs -> 'cities', '[]'))));
  remote_ok := coalesce((prefs ->> 'remote_ok')::boolean, false);
  min_salary := nullif(prefs ->> 'min_salary_zar', '')::numeric;
  types := array(select jsonb_array_elements_text(coalesce(prefs -> 'job_types', '[]')));
  time_types := array(select t from unnest(types) t where t in ('full_time', 'part_time'));
  contract_types := array(select t from unnest(types) t where t in ('permanent', 'contract'));

  return query
  select
    j.id, j.title, j.company, j.location_display, j.province, j.city,
    j.salary_min, j.salary_max, j.salary_is_predicted, j.contract_type, j.contract_time,
    j.category_label, j.description, j.posted_at,
    (j.embedding operator(extensions.<=>) p.embedding)::double precision as distance
  from public.jobs j
  where j.embedding is not null
    and j.posted_at > now() - interval '30 days'
    and (not p_only_new or j.first_seen_at > coalesce(p.last_matched_at, '-infinity'::timestamptz))
    -- location: a province, or a city anywhere in the area path, or remote
    and (
      (cardinality(provinces) = 0 and cardinality(cities) = 0)
      or lower(j.province) = any (provinces)
      or exists (
        select 1 from unnest(cities) c
        where lower(coalesce(j.area_path, j.city, '')) like '%' || c || '%'
      )
      or (remote_ok and (
        j.enrichment ->> 'work_mode' = 'remote'
        or j.title ~* '\m(remote|work from home|wfh)\M'
        or j.location_display ~* 'remote'
      ))
    )
    -- salary floor: only a stated (not estimated) salary can exclude a job. Adzuna is annual.
    and (
      min_salary is null
      or j.salary_max is null
      or j.salary_is_predicted
      or j.salary_max >= min_salary * 12
    )
    -- job type
    and (cardinality(time_types) = 0 or j.contract_time is null or j.contract_time = any (time_types))
    and (cardinality(contract_types) = 0 or j.contract_type is null or j.contract_type = any (contract_types))
    -- not already matched
    and not exists (select 1 from public.matches m where m.user_id = p_user_id and m.job_id = j.id)
  order by j.embedding operator(extensions.<=>) p.embedding
  limit p_limit;
end;
$$;

revoke all on function public.ingest_jobs(jsonb) from public, anon, authenticated;
revoke all on function public.candidate_jobs(uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.ingest_jobs(jsonb) to service_role;
grant execute on function public.candidate_jobs(uuid, int, boolean) to service_role;
