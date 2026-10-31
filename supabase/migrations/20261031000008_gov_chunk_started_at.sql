-- Lets the ingester retry a chunk whose worker was stopped mid-call.
alter table public.gov_ingest_chunks add column started_at timestamptz;
