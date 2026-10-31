import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatSalary, JOB_TYPES, PROVINCES } from "../lib/types";
import { Icon } from "../components/Icon";
import { Alert, ago } from "../components/ui";

const PAGE = 20;

interface JobResult {
  id: number;
  title: string;
  company: string | null;
  location_display: string | null;
  salary_min_monthly: number | null;
  salary_max_monthly: number | null;
  salary_is_predicted: boolean;
  contract_type: string | null;
  contract_time: string | null;
  category_label: string | null;
  redirect_url: string;
  posted_at: string | null;
  snippet: string | null;
  is_match: boolean;
  total_count: number;
}

export function Explore() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [province, setProvince] = useState(params.get("province") ?? "");
  const [jobType, setJobType] = useState(params.get("type") ?? "");
  const [remote, setRemote] = useState(params.get("remote") === "1");

  const [results, setResults] = useState<JobResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  async function load(offset: number) {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    const { data, error: e } = await supabase.rpc("search_jobs", {
      p_query: query.trim(),
      p_province: province || null,
      p_job_type: jobType || null,
      p_remote: remote,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (id !== requestId.current) return; // a newer search has started
    setLoading(false);
    if (e) {
      setError(true);
      return;
    }
    const rows = (data as JobResult[]) ?? [];
    setResults((prev) => (offset === 0 ? rows : [...(prev ?? []), ...rows]));
    if (offset === 0) setTotal(rows[0]?.total_count ?? 0);
  }

  // Search as the user types (debounced) and whenever a filter changes.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (province) next.set("province", province);
    if (jobType) next.set("type", jobType);
    if (remote) next.set("remote", "1");
    setParams(next, { replace: true });

    const t = setTimeout(() => load(0), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, province, jobType, remote]);

  const filtered = !!(query.trim() || province || jobType || remote);

  return (
    <div>
      <div className="mb-6 animate-rise">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Explore</p>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">All opportunities</h1>
        <p className="mt-1 text-[15px] text-ink-soft">
          Browse every job we have. For roles chosen for you, see{" "}
          <Link to="/matches" className="font-medium text-brand">My matches</Link>.
        </p>
      </div>

      {/* Search field */}
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          inputMode="search"
          aria-label="Search jobs"
          placeholder="Job title, skill or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input rounded-2xl border-transparent bg-black/[0.05] py-3.5 pl-11 pr-11 focus:bg-white [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <label className="chip relative shrink-0 pr-8" aria-pressed={!!province}>
          <span>{province || "All provinces"}</span>
          <Icon name="chevronRight" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 rotate-90" />
          <select
            aria-label="Province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">All provinces</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <button type="button" className="chip shrink-0" aria-pressed={remote} onClick={() => setRemote(!remote)}>
          Remote
        </button>
        {JOB_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className="chip shrink-0"
            aria-pressed={jobType === t.value}
            onClick={() => setJobType(jobType === t.value ? "" : t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mt-5 flex items-center justify-between text-sm text-ink-soft" aria-live="polite">
        <span>
          {results === null
            ? "Searching..."
            : `${total.toLocaleString("en-ZA")} ${total === 1 ? "opportunity" : "opportunities"}${filtered ? "" : " in the last 30 days"}`}
        </span>
        {loading && results !== null && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" aria-hidden="true" />
        )}
      </div>

      {error && <div className="mt-3"><Alert>Search isn't working right now. Please try again.</Alert></div>}

      {results && results.length > 0 && (
        <ul className="panel mt-3 divide-y divide-hairline overflow-hidden">
          {results.map((job) => <JobRow key={job.id} job={job} />)}
        </ul>
      )}

      {results && results.length === 0 && !loading && (
        <div className="mt-3 rounded-2xl bg-white/60 px-5 py-10 text-center text-ink-soft">
          No opportunities match that. Try fewer words or clear a filter.
        </div>
      )}

      {results && results.length < total && (
        <div className="mt-5 text-center">
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => load(results.length)}>
            {loading ? "Loading..." : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

/** A compact row: deliberately quieter than a match card. */
function JobRow({ job }: { job: JobResult }) {
  const salary = formatSalary(job);
  const meta = [job.company, job.location_display].filter(Boolean).join(" · ");
  const posted = ago(job.posted_at);

  return (
    <li>
      <a
        href={job.redirect_url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-black/[0.02] active:bg-black/[0.04]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-ink">{job.title}</h2>
            {job.is_match && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/[0.08] px-2 py-0.5 text-[11px] font-semibold text-brand">
                <Icon name="sparkles" className="h-3 w-3" />
                Your match
              </span>
            )}
          </div>
          {meta && <p className="truncate text-sm text-ink-soft">{meta}</p>}
          {job.snippet && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-faint">{job.snippet}</p>}
          {(salary || posted) && (
            <p className="mt-1.5 text-xs text-ink-faint">{[salary, posted].filter(Boolean).join("  ·  ")}</p>
          )}
        </div>
        <Icon
          name="arrowUpRight"
          className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
        />
      </a>
    </li>
  );
}
