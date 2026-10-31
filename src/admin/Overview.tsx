import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminRpc, fmt, when } from "../lib/admin";
import { Alert, Spinner } from "../components/ui";
import { AdminTitle, DailyBars, StatTile } from "./ui";

interface OverviewData {
  users: { total: number; matched: number; onboarding: number; errors: number; new_7d: number; email_confirmed: number; paused: number };
  jobs: { total: number; active: number; added_24h: number; unembedded: number; last_sync: string | null; api_calls_today: number };
  matches: { total: number; last_7d: number; viewed: number };
  emails: { sent_7d: number; failed_7d: number };
  llm: { calls_7d: number; input_tokens_7d: number; output_tokens_7d: number };
  government: { enabled: boolean; open_posts: number };
}

interface Daily {
  day: string;
  signups: number;
  matches: number;
  jobs: number;
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : fmt(n));

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([adminRpc<OverviewData>("admin_overview"), adminRpc<Daily[]>("admin_daily", { p_days: 14 })])
      .then(([o, d]) => {
        setData(o);
        setDaily(d);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner label="Loading" />;
  const { users, jobs, matches, emails, llm, government } = data;
  const viewedPct = matches.total ? Math.round((matches.viewed / matches.total) * 100) : 0;

  return (
    <div className="animate-rise space-y-8">
      <AdminTitle title="Overview" subtitle={`Last job sync ${when(jobs.last_sync)}`} />

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">People</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Users" value={fmt(users.total)} sub={`${fmt(users.new_7d)} new this week`} />
          <StatTile label="Matched" value={fmt(users.matched)} sub={`${fmt(users.onboarding)} still onboarding`} />
          <StatTile label="Email confirmed" value={fmt(users.email_confirmed)} sub={`${fmt(users.paused)} paused alerts`} />
          <StatTile label="Matching errors" value={fmt(users.errors)} sub={users.errors ? "Users stuck on an error" : "None"}
            tone={users.errors ? "warn" : undefined} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Jobs and matching</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Active jobs (30 days)" value={fmt(jobs.active)} sub={`${fmt(jobs.added_24h)} added in 24 hours`} />
          <StatTile label="Matches" value={fmt(matches.total)} sub={`${fmt(matches.last_7d)} this week · ${viewedPct}% opened`} />
          <StatTile label="Emails sent (7 days)" value={fmt(emails.sent_7d)} sub={emails.failed_7d ? `${fmt(emails.failed_7d)} failed` : "No failures"}
            tone={emails.failed_7d ? "warn" : undefined} />
          <StatTile label="Adzuna calls today" value={fmt(jobs.api_calls_today)} sub={jobs.unembedded ? `${fmt(jobs.unembedded)} jobs waiting to embed` : "All jobs embedded"}
            tone={jobs.unembedded > 500 ? "warn" : undefined} />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <DailyBars title="Signups per day" data={daily.map((d) => ({ day: d.day, value: d.signups }))} />
        <DailyBars title="New matches per day" data={daily.map((d) => ({ day: d.day, value: d.matches }))} />
        <DailyBars title="Jobs added per day" data={daily.map((d) => ({ day: d.day, value: d.jobs }))} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/admin/government" className="rounded-2xl bg-white p-4 shadow-card transition hover:shadow-lift">
          <p className="text-[13px] font-medium text-ink-soft">Government vacancies</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight text-ink">{fmt(government.open_posts)} open posts</p>
          <p className="mt-0.5 text-xs text-ink-faint">Section is {government.enabled ? "visible to users" : "hidden from users"}</p>
        </Link>
        <Link to="/admin/usage" className="rounded-2xl bg-white p-4 shadow-card transition hover:shadow-lift">
          <p className="text-[13px] font-medium text-ink-soft">Gemini (7 days)</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight text-ink">{fmt(llm.calls_7d)} calls</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {compact(llm.input_tokens_7d)} input · {compact(llm.output_tokens_7d)} output tokens
          </p>
        </Link>
      </section>
    </div>
  );
}
