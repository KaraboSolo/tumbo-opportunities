# Tumbo Jobs: AI job matching (South Africa)

Users upload a CV, confirm their profile and preferences, and get South African jobs (from Adzuna) that fit them, each with a short reason. New matches arrive by email every day.

See `PROJECT_SPEC.md` and `GEMINI_PROMPTS.md` for the full design.

## Layout

```
src/                      React + TypeScript + Tailwind front end (Vite)
supabase/migrations/      Schema, RLS, my_matches view, SQL helpers, cron jobs
supabase/functions/       Edge Functions (Deno)
  _shared/                HTTP helpers, Gemini client, prompts, email templates, matching funnel
  adzuna-sync             Daily pull + resumable 30-day backfill (cron)
  embed-jobs              Embeds new jobs (chained after sync)
  parse-cv                CV -> structured profile (browser)
  save-profile            Saves edited profile + preferences, embeds profile (browser)
  match-user              Candidate SQL filter -> Gemini rerank -> matches (browser or cron)
  match-all-users         Daily matching for everyone with new jobs (chained)
  send-notifications      Email digests (chained daily + hourly retry)
  send-verification-email / verify-email   Contact email confirmation
  unsubscribe             Signed one-click pause link from emails
  delete-account          POPIA delete of account, CV and matches
```

The daily chain is: `adzuna-sync` -> `embed-jobs` -> `match-all-users` -> `send-notifications`. Each function stops after about 110 seconds and hands off to a fresh invocation, so long backfills and big user lists are fine.

## Setup

1. **Supabase (development project, no real CVs).**
   ```bash
   npx supabase link --project-ref YOUR_DEV_PROJECT_REF
   npx supabase db push
   ```
2. **Vault secrets for cron** (SQL editor, once):
   ```sql
   select vault.create_secret('https://YOUR_DEV_PROJECT_REF.supabase.co', 'project_url');
   select vault.create_secret('SAME_VALUE_AS_CRON_SECRET', 'cron_secret');
   ```
3. **Function secrets.** Copy `supabase/functions.env.example` to `supabase/functions/.env`, fill it in (Gemini, Adzuna, Zoho CPaaS email), then:
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy
   ```
4. **Auth settings** (dashboard): email confirmation off (per spec), site URL = your Netlify URL, and optionally enable Cloudflare Turnstile CAPTCHA with your secret key.
5. **Front end.** Copy `.env.example` to `.env.local` and fill in the URL and anon key.
   ```bash
   npm install
   npm run dev
   ```
6. **Load jobs** (once): start the backfill. It continues by itself and spreads across days if Adzuna's daily limit is reached.
   ```bash
   curl -X POST "https://YOUR_DEV_PROJECT_REF.supabase.co/functions/v1/adzuna-sync" \
     -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"mode":"backfill"}'
   ```
   Check `ingest_runs` and `select count(*), count(embedding) from jobs;`.

## Admin portal

`/admin` (sign in at `/admin/login`): overview numbers and daily charts, users, Adzuna sync runs and emails, AI usage, and government circulars (upload, progress, publish, retry, delete, and the on/off switch). Admin reads go through `admin_*` SQL functions that check `is_admin()`; actions go through the `admin` Edge Function. Match scores are never shown, even to admins.

Make someone an admin in the SQL editor:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'someone@example.com';
```

## Government vacancies (DPSA circular)

Browse-only section built from the weekly Public Service Vacancy Circular (never matched to users).

1. Upload the PDF to the private `circulars` bucket, e.g. `2026/39.pdf`.
2. Start ingestion (it reads the index, then the annexures in 6-page chunks, and hands off to itself until done):
   ```bash
   curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/ingest-gov-circular" \
     -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"storage_path":"2026/39.pdf"}'
   ```
   Add `"replace": true` to reload a circular. To re-read specific chunks: `{"circular_id": 2, "rerun_pages": [145, 151]}`.
3. `gov_circulars.missing_post_numbers` lists post numbers that could not be found after a targeted retry; check them against the PDF (gaps in the DPSA numbering are normal).

The section is shown while `app_settings.gov_vacancies_enabled` is `true` (the admin portal will switch it).

## Deploy (Netlify)

Connect the GitHub repo. `netlify.toml` sets the build and the SPA redirect. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and optionally `VITE_TURNSTILE_SITE_KEY` in Netlify. Then set `SITE_URL` in the function secrets to the Netlify URL.

## How the score stays private

- `matches.score` and `gaps` have no column grant for `authenticated`; the browser reads only the `my_matches` view (security invoker, own rows via RLS).
- No Edge Function returns a score. Email digests contain only the reason.

## Things to verify against live services

- **Adzuna**: field names (`location.area`, `salary_is_predicted`, `contract_time`) and that salaries are annual. The code converts to monthly (`/12`) in `my_matches`, `candidate_jobs` and emails.
- **Gemini**: model names, the thinking parameter for each model (`GEMINI_THINKING_LEVEL` or `GEMINI_THINKING_BUDGET`), and that `gemini-embedding-2` supports `outputDimensionality: 768`.
- **Zoho CPaaS (email)**: a verified sending domain in your Agent for `EMAIL_FROM_ADDRESS`, the Send Mail Token in `ZOHO_CPAAS_EMAIL_TOKEN`, and `ZOHO_CPAAS_HOST` if your account is on a non-US data centre. WhatsApp through Zoho CPaaS is phase 2.

## Not built yet (phase 2)

Job enrichment, WhatsApp (number verification, template messages, STOP handling), feedback buttons, and the `evals/` test set from `GEMINI_PROMPTS.md` section 5.
