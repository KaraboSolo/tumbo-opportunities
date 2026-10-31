-- Scheduled jobs (pg_cron + pg_net). Times are UTC.
--
-- The jobs read two Vault secrets at run time, so nothing secret is committed:
--   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');
-- Until both exist the jobs fail harmlessly.

create function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base_url is null or secret is null then
    raise exception 'Vault secrets project_url and cron_secret must be set';
  end if;
  return net.http_post(
    url := base_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := p_body,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- Daily: sync Adzuna at 05:30 SAST. It chains embed-jobs -> match-all-users -> send-notifications.
select cron.schedule(
  'adzuna-daily-sync',
  '30 3 * * *',
  $$ select public.invoke_edge_function('adzuna-sync', '{"mode":"daily"}'::jsonb); $$
);

-- Hourly: retry failed notifications (send-notifications caps attempts at 3 per user per day).
select cron.schedule(
  'notifications-retry',
  '15 * * * *',
  $$ select public.invoke_edge_function('send-notifications', '{"retry":true}'::jsonb); $$
);
