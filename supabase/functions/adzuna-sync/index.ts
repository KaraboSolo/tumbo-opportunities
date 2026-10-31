// Pulls South African jobs from Adzuna into the jobs table.
//
// Body: { mode: "daily" | "backfill" }
//   daily    - newest jobs from the last 2 days (overlap on purpose), then continues
//              an unfinished backfill with whatever API budget is left.
//   backfill - starts (or restarts) a walk over every category for the last 30 days.
//              Progress is saved in ingest_state, so it spreads over several days if
//              the Adzuna daily call limit is reached.
// Each invocation stops before the time budget and hands off to a fresh one.
// When everything is done for the day it triggers embed-jobs.
import { adminClient, env, json, requireCron, serve, sleep, TIME_BUDGET_MS, triggerFunction } from "../_shared/http.ts";

const API = "https://api.adzuna.com/v1/api/jobs/za";
const PER_PAGE = 50; // Adzuna's maximum
const DAILY_LIMIT = Number(Deno.env.get("ADZUNA_DAILY_CALL_LIMIT") ?? 80);
const INTERVAL_MS = Number(Deno.env.get("ADZUNA_CALL_INTERVAL_MS") ?? 2600);
const BACKFILL_DAYS = 30; // jobs older than this are not "active" anyway

interface DailyCursor { page: number; done: boolean; date: string }
interface BackfillCursor { categories: string[]; index: number; page: number; done: boolean }

// deno-lint-ignore no-explicit-any
type AdzunaJob = any;

let lastCall = 0;
// Pauses before retrying a 429 or 5xx from Adzuna. These are usually brief.
const RETRY_DELAYS_MS = [10_000, 30_000];

async function adzuna(path: string, params: Record<string, string | number>) {
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("app_id", env("ADZUNA_APP_ID"));
  url.searchParams.set("app_key", env("ADZUNA_APP_KEY"));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw new Error(`Adzuna ${res.status} on ${path}`);
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function normalise(j: AdzunaJob) {
  // location.area looks like ["South Africa", "Western Cape", "Cape Town Region", "Cape Town City Centre", ...]
  const area: string[] = Array.isArray(j.location?.area) ? j.location.area : [];
  const title = String(j.title ?? "").replace(/<[^>]+>/g, "").trim();
  const company = j.company?.display_name ?? null;
  const locationDisplay = j.location?.display_name ?? null;
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  return {
    adzuna_id: String(j.id),
    title,
    company,
    description: String(j.description ?? "").replace(/<[^>]+>/g, "").trim(),
    location_display: locationDisplay,
    province: area[1] ?? null,
    // area[2] is a metro or district, e.g. "Cape Town Region" or "Mopani".
    city: area[2]?.replace(/\s+Region$/i, "") ?? null,
    area_path: area.slice(1).join(" > ") || null,
    salary_min: num(j.salary_min),
    salary_max: num(j.salary_max),
    salary_is_predicted: String(j.salary_is_predicted) === "1" || j.salary_is_predicted === true,
    contract_type: j.contract_type ?? null,
    contract_time: j.contract_time ?? null,
    category_tag: j.category?.tag ?? null,
    category_label: j.category?.label ?? null,
    redirect_url: j.redirect_url,
    posted_at: j.created ?? null,
    content_hash: await sha256(
      [title, company ?? "", locationDisplay ?? ""].map((s) => s.toLowerCase().replace(/\s+/g, " ").trim()).join("|"),
    ),
  };
}

async function getState<T>(key: string): Promise<T | null> {
  const { data } = await adminClient().from("ingest_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

async function setState(key: string, value: unknown) {
  const { error } = await adminClient()
    .from("ingest_state")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function callsUsedToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await adminClient().from("ingest_runs").select("api_calls").gte("started_at", today);
  return (data ?? []).reduce((n, r) => n + (r.api_calls ?? 0), 0);
}

serve(async (req) => {
  requireCron(req);
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const mode: "daily" | "backfill" = body.mode === "backfill" ? "backfill" : "daily";
  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  if (mode === "backfill" && !body.continue) {
    await setState("backfill", { categories: [], index: 0, page: 1, done: false } satisfies BackfillCursor);
  }

  const { data: run, error: runError } = await db.from("ingest_runs").insert({ mode }).select("id").single();
  if (runError) throw runError;

  let budget = DAILY_LIMIT - (await callsUsedToday());
  let apiCalls = 0, fetched = 0, inserted = 0;
  let finished = false;
  let failure: string | null = null;
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - started) > INTERVAL_MS + 5000;

  async function ingestPage(params: Record<string, string | number>, page: number): Promise<number> {
    const data = await adzuna(`search/${page}`, { results_per_page: PER_PAGE, sort_by: "date", ...params });
    apiCalls++;
    budget--;
    const results: AdzunaJob[] = (data.results ?? []).filter((j: AdzunaJob) => j.id && j.redirect_url);
    fetched += results.length;
    if (results.length > 0) {
      const rows = await Promise.all(results.map(normalise));
      const { data: count, error } = await db.rpc("ingest_jobs", { p_jobs: rows });
      if (error) throw error;
      inserted += count ?? 0;
    }
    return results.length;
  }

  try {
    // 1. Daily delta.
    let daily = (await getState<DailyCursor>("daily")) ?? { page: 1, done: false, date: today };
    if (daily.date !== today) daily = { page: 1, done: false, date: today };
    while (!daily.done && budget > 0 && timeLeft()) {
      const n = await ingestPage({ max_days_old: 2 }, daily.page);
      daily = n < PER_PAGE ? { ...daily, done: true } : { ...daily, page: daily.page + 1 };
      await setState("daily", daily);
    }

    // 2. Backfill, if one is in progress.
    let backfill: BackfillCursor | null = await getState<BackfillCursor>("backfill");
    if (daily.done && backfill && !backfill.done) {
      if (backfill.categories.length === 0 && budget > 0 && timeLeft()) {
        const cats = await adzuna("categories", {});
        apiCalls++;
        budget--;
        backfill = { ...backfill, categories: (cats.results ?? []).map((c: { tag: string }) => c.tag) };
        await setState("backfill", backfill);
      }
      while (backfill.categories.length > 0 && !backfill.done && budget > 0 && timeLeft()) {
        const category = backfill.categories[backfill.index];
        const n = await ingestPage({ max_days_old: BACKFILL_DAYS, category }, backfill.page);
        if (n < PER_PAGE) {
          const next: number = backfill.index + 1;
          backfill = { ...backfill, index: next, page: 1, done: next >= backfill.categories.length };
        } else {
          backfill = { ...backfill, page: backfill.page + 1 };
        }
        await setState("backfill", backfill);
      }
    }

    const moreWork = !daily.done || (backfill !== null && !backfill.done);
    finished = !moreWork || budget <= 0;
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
    finished = true; // do not loop on errors; tomorrow's run picks up from the saved cursor
  }

  await db.from("ingest_runs").update({
    finished_at: new Date().toISOString(),
    api_calls: apiCalls,
    fetched,
    inserted,
    error: failure,
  }).eq("id", run.id);

  if (finished) {
    triggerFunction("embed-jobs", { then: "match" });
  } else {
    triggerFunction("adzuna-sync", { mode, continue: true });
  }

  return json({ mode, api_calls: apiCalls, fetched, inserted, finished, error: failure });
});
