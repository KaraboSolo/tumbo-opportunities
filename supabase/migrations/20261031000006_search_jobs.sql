-- Explore: lets signed-in users search every active job.
-- The jobs table stays closed to the browser; this function returns only
-- display columns (no embeddings, enrichment or match scores).

alter table public.jobs add column search tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(category_label, '') || ' ' || coalesce(area_path, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'D')
) stored;

create index jobs_search_idx on public.jobs using gin (search);

create function public.search_jobs(
  p_query text default '',
  p_province text default null,
  p_job_type text default null,
  p_remote boolean default false,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id bigint,
  title text,
  company text,
  location_display text,
  salary_min_monthly numeric,
  salary_max_monthly numeric,
  salary_is_predicted boolean,
  contract_type text,
  contract_time text,
  category_label text,
  redirect_url text,
  posted_at timestamptz,
  snippet text,
  is_match boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  words text;
  tsq tsquery;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Prefix-match every word so results update while the user types.
  select string_agg(w || ':*', ' & ')
  into words
  from unnest(regexp_split_to_array(
    lower(regexp_replace(coalesce(p_query, ''), '[^[:alnum:][:space:]]', ' ', 'g')), '\s+'
  )) as w
  where length(w) > 0;
  if words is not null then
    tsq := to_tsquery('english', words);
  end if;

  return query
  select
    j.id, j.title, j.company, j.location_display,
    round(j.salary_min / 12), round(j.salary_max / 12), j.salary_is_predicted,
    j.contract_type, j.contract_time, j.category_label, j.redirect_url, j.posted_at,
    left(j.description, 220),
    exists (select 1 from public.matches m where m.user_id = uid and m.job_id = j.id),
    count(*) over ()
  from public.jobs j
  where j.posted_at > now() - interval '30 days'
    and (tsq is null or j.search @@ tsq)
    and (p_province is null or j.province = p_province)
    and (
      p_job_type is null
      or (p_job_type in ('full_time', 'part_time') and j.contract_time = p_job_type)
      or (p_job_type in ('permanent', 'contract') and j.contract_type = p_job_type)
    )
    and (not p_remote or j.title ~* '\m(remote|work from home|wfh)\M' or j.location_display ~* 'remote')
  order by
    case when tsq is null then 0 else ts_rank(j.search, tsq) end desc,
    j.posted_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.search_jobs(text, text, text, boolean, int, int) from public, anon;
grant execute on function public.search_jobs(text, text, text, boolean, int, int) to authenticated;
