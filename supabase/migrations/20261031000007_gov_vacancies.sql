-- Government vacancies from the weekly DPSA Public Service Vacancy Circular.
-- These are for browsing only; they are never matched to users.

-- ---------------------------------------------------------------------------
-- App settings (feature toggles). Readable by everyone, written by admins
-- through Edge Functions (service role) only.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
grant select on public.app_settings to anon, authenticated;
create policy "app_settings: read" on public.app_settings for select to anon, authenticated using (true);

insert into public.app_settings (key, value) values ('gov_vacancies_enabled', 'true'::jsonb);

create function public.setting_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value)::text = 'true' from public.app_settings where key = p_key), false);
$$;
grant execute on function public.setting_enabled(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Circulars, their department sections, and posts
-- ---------------------------------------------------------------------------
create table public.gov_circulars (
  id bigint generated always as identity primary key,
  circular_number int,
  year int,
  issued_on date,
  storage_path text not null,
  page_count int,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  published boolean not null default false,
  amendments text,
  missing_post_numbers int[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (year, circular_number)
);

-- Work queue: one row per page chunk, processed in order within an annexure.
create table public.gov_ingest_chunks (
  id bigint generated always as identity primary key,
  circular_id bigint not null references public.gov_circulars (id) on delete cascade,
  seq int not null,
  annexure text not null,
  annexure_name text,
  sector text,
  first_page int not null,
  last_page int not null,
  extract_last_page int not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  start_department text,
  last_department text,
  attempts int not null default 0,
  error text,
  unique (circular_id, seq)
);

create table public.gov_sections (
  id bigint generated always as identity primary key,
  circular_id bigint not null references public.gov_circulars (id) on delete cascade,
  annexure text not null,
  sector text not null check (sector in ('national', 'provincial')),
  province text,
  department text not null,
  applications text,
  application_url text,
  application_email text,
  for_attention text,
  closing_date date,
  closing_time text,
  note text,
  required_documents text[] not null default '{}',
  start_page int,
  unique (circular_id, annexure, department)
);

-- array_to_string is only "stable", which generated columns don't allow.
create function public.text_array_join(p text[])
returns text
language sql
immutable
set search_path = ''
as $$ select array_to_string(p, ' ') $$;

create table public.gov_vacancies (
  id bigint generated always as identity primary key,
  circular_id bigint not null references public.gov_circulars (id) on delete cascade,
  section_id bigint references public.gov_sections (id) on delete set null,
  post_number text not null,          -- e.g. "39/01"
  post_seq int not null,              -- 1, used to check nothing was missed
  title text not null,
  reference_numbers text[] not null default '{}',
  department text not null,
  sector text not null check (sector in ('national', 'provincial')),
  province text,
  directorate text,
  centres jsonb not null default '[]', -- [{ "centre": "...", "reference": "..." }]
  num_posts int not null default 1,
  employment_type text,               -- permanent, contract, internship, learnership, other
  contract_duration text,
  is_readvertisement boolean not null default false,
  salary_text text,
  salary_min numeric,                 -- rand per year
  salary_max numeric,
  salary_level int,
  all_inclusive boolean not null default false,
  qualification_level text,           -- none, grade_12, certificate, diploma, degree, postgraduate
  min_years_experience numeric,
  drivers_licence_required boolean not null default false,
  requirements text,
  duties text,
  enquiries text,
  application_methods text[] not null default '{}', -- online, email, post, hand_delivery
  application_url text,
  application_email text,
  application_postal_address text,
  application_physical_address text,
  application_instructions text,
  for_attention text,
  closing_date date,
  closing_time text,
  required_documents text[] not null default '{}',
  z83_required boolean not null default true,
  certified_copies text not null default 'not_stated', -- with_application, shortlisted_only, not_stated
  notes text,
  source_page int,
  created_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(department, '') || ' ' || coalesce(directorate, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(post_number, '') || ' ' || public.text_array_join(reference_numbers)), 'B') ||
    setweight(to_tsvector('english', coalesce(province, '') || ' ' || coalesce(centres::text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(requirements, '')), 'D')
  ) stored,
  unique (circular_id, post_number)
);

create index gov_vacancies_search_idx on public.gov_vacancies using gin (search);
create index gov_vacancies_closing_idx on public.gov_vacancies (closing_date);
create index gov_vacancies_department_idx on public.gov_vacancies (department);
create index gov_vacancies_province_idx on public.gov_vacancies (province);

alter table public.gov_circulars enable row level security;
alter table public.gov_ingest_chunks enable row level security;
alter table public.gov_sections enable row level security;
alter table public.gov_vacancies enable row level security;

-- Signed-in users can read published circulars, while the feature is switched on.
grant select (id, circular_number, year, issued_on, status, published, amendments, processed_at)
  on public.gov_circulars to authenticated;
create policy "gov_circulars: read published" on public.gov_circulars for select to authenticated
  using (status = 'ready' and published and public.setting_enabled('gov_vacancies_enabled'));

grant select on public.gov_sections to authenticated;
create policy "gov_sections: read published" on public.gov_sections for select to authenticated
  using (exists (select 1 from public.gov_circulars c where c.id = circular_id));

grant select on public.gov_vacancies to authenticated;
create policy "gov_vacancies: read published" on public.gov_vacancies for select to authenticated
  using (exists (select 1 from public.gov_circulars c where c.id = circular_id));

-- ---------------------------------------------------------------------------
-- Search with filters and sorting. Security invoker: RLS above applies.
-- ---------------------------------------------------------------------------
create function public.search_gov_vacancies(
  p_query text default '',
  p_department text default null,
  p_province text default null,
  p_sector text default null,
  p_level_min int default null,
  p_level_max int default null,
  p_qualification text default null,
  p_entry_level boolean default false,
  p_online_only boolean default false,
  p_closing_within_days int default null,
  p_include_closed boolean default false,
  p_sort text default 'closing_soon',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id bigint,
  post_number text,
  title text,
  department text,
  sector text,
  province text,
  centres jsonb,
  num_posts int,
  salary_min numeric,
  salary_max numeric,
  salary_level int,
  all_inclusive boolean,
  employment_type text,
  closing_date date,
  reference_numbers text[],
  application_methods text[],
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  words text;
  tsq tsquery;
begin
  select string_agg(w || ':*', ' & ')
  into words
  from unnest(regexp_split_to_array(
    lower(regexp_replace(coalesce(p_query, ''), '[^[:alnum:][:space:]/]', ' ', 'g')), '\s+'
  )) as w
  where length(w) > 0;
  if words is not null then
    tsq := to_tsquery('english', replace(words, '/', ' & '));
  end if;

  return query
  select
    v.id, v.post_number, v.title, v.department, v.sector, v.province, v.centres, v.num_posts,
    v.salary_min, v.salary_max, v.salary_level, v.all_inclusive, v.employment_type, v.closing_date,
    v.reference_numbers, v.application_methods,
    count(*) over ()
  from public.gov_vacancies v
  where (tsq is null or v.search @@ tsq)
    and (p_include_closed or v.closing_date is null or v.closing_date >= current_date)
    and (p_department is null or v.department = p_department)
    and (p_province is null or v.province = p_province)
    and (p_sector is null or v.sector = p_sector)
    and (p_level_min is null or v.salary_level >= p_level_min)
    and (p_level_max is null or v.salary_level <= p_level_max)
    and (p_qualification is null or v.qualification_level = p_qualification)
    and (not p_entry_level or coalesce(v.min_years_experience, 99) = 0)
    and (not p_online_only or 'online' = any (v.application_methods))
    and (p_closing_within_days is null or v.closing_date <= current_date + p_closing_within_days)
  order by
    case when p_sort = 'relevance' and tsq is not null then ts_rank(v.search, tsq) end desc nulls last,
    case when p_sort = 'closing_soon' then v.closing_date end asc nulls last,
    case when p_sort = 'salary_high' then v.salary_max end desc nulls last,
    case when p_sort = 'salary_low' then v.salary_min end asc nulls last,
    case when p_sort = 'title' then v.title end asc,
    case when p_sort = 'newest' then v.circular_id end desc,
    v.post_seq asc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
end;
$$;
revoke all on function public.search_gov_vacancies(text, text, text, text, int, int, text, boolean, boolean, int, boolean, text, int, int) from public, anon;
grant execute on function public.search_gov_vacancies(text, text, text, text, int, int, text, boolean, boolean, int, boolean, text, int, int) to authenticated;

-- Filter options with counts (open posts only).
create function public.gov_vacancy_facets()
returns table (kind text, value text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'department', department, count(*) from public.gov_vacancies
  where closing_date is null or closing_date >= current_date group by department
  union all
  select 'province', province, count(*) from public.gov_vacancies
  where (closing_date is null or closing_date >= current_date) and province is not null group by province
  order by 1, 2;
$$;
revoke all on function public.gov_vacancy_facets() from public, anon;
grant execute on function public.gov_vacancy_facets() to authenticated;

-- ---------------------------------------------------------------------------
-- Private bucket for the uploaded circular PDFs (admin/service role only).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('circulars', 'circulars', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
