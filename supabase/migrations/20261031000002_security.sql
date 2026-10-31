-- Row level security, column grants, the my_matches view, RPCs and the CV bucket.
-- See PROJECT_SPEC.md section 4 ("RLS summary" and "Hiding the score").

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.matches enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.ingest_state enable row level security;
alter table public.notification_log enable row level security;
alter table public.llm_usage enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.email_verifications enable row level security;

-- Start from nothing for browser roles, then grant exactly what is needed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- profiles: own row only. Status, parsed profile, embedding and verification
-- fields are written by Edge Functions (service role), never by the browser.
-- ---------------------------------------------------------------------------
grant select (
  id, full_name, contact_email, contact_email_verified_at, whatsapp_number, whatsapp_verified_at,
  notify_email, notify_whatsapp, cv_path, parsed_profile, preferences, onboarding_status,
  last_matched_at, notifications_paused, consent_at, created_at, updated_at
) on public.profiles to authenticated;

grant update (
  full_name, contact_email, whatsapp_number, notify_email, notify_whatsapp, notifications_paused
) on public.profiles to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- matches + jobs: readable only through my_matches. The view is security
-- invoker, so the browser gets column grants that exclude score, gaps and
-- embeddings, and RLS limits rows to the caller's own matches.
-- ---------------------------------------------------------------------------
grant select (id, user_id, job_id, reason, viewed_at, created_at) on public.matches to authenticated;

create policy "matches: read own" on public.matches
  for select to authenticated using (user_id = (select auth.uid()));

grant select (
  id, title, company, location_display, salary_min, salary_max, salary_is_predicted,
  contract_type, contract_time, redirect_url, posted_at
) on public.jobs to authenticated;

create policy "jobs: read matched" on public.jobs
  for select to authenticated using (
    exists (
      select 1 from public.matches m
      where m.job_id = jobs.id and m.user_id = (select auth.uid())
    )
  );

create view public.my_matches
with (security_invoker = true)
as
select
  m.id,
  m.reason,
  m.viewed_at,
  m.created_at,
  j.title,
  j.company,
  j.location_display,
  -- Adzuna salaries are annual; show monthly ZAR.
  round(j.salary_min / 12) as salary_min_monthly,
  round(j.salary_max / 12) as salary_max_monthly,
  j.salary_is_predicted,
  j.contract_type,
  j.contract_time,
  j.redirect_url,
  j.posted_at
from public.matches m
join public.jobs j on j.id = m.job_id
where m.user_id = (select auth.uid());

grant select on public.my_matches to authenticated;

-- Mark a match as viewed (the only write the browser makes on matches).
create function public.mark_match_viewed(p_match_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.matches
  set viewed_at = coalesce(viewed_at, now())
  where id = p_match_id and user_id = auth.uid();
$$;

revoke all on function public.mark_match_viewed(bigint) from public, anon;
grant execute on function public.mark_match_viewed(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private "cvs" bucket, one folder per user, PDF or DOCX, max 5 MB.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "cvs: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cvs: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
