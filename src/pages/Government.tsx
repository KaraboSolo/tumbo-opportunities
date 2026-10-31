import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSetting } from "../lib/settings";
import { PROVINCES } from "../lib/types";
import {
  annualSalary,
  centreSummary,
  closingLabel,
  formatDate,
  type GovVacancySummary,
  LEVEL_BANDS,
  QUALIFICATIONS,
  SORTS,
  Z83_URL,
} from "../lib/gov";
import { Icon } from "../components/Icon";
import { Alert, Spinner } from "../components/ui";

const PAGE = 20;

interface Circular {
  circular_number: number;
  year: number;
  issued_on: string | null;
}

export function Government() {
  const enabled = useSetting("gov_vacancies_enabled");
  if (enabled === undefined) return <Spinner />;
  if (!enabled) return <GovernmentUnavailable />;
  return <GovernmentSearch />;
}

export function GovernmentUnavailable() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.05] text-ink-soft">
        <Icon name="building" className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-[22px] font-semibold text-ink">Government vacancies aren't available right now</h1>
      <p className="mt-2 text-ink-soft">Please check back soon.</p>
      <Link to="/explore" className="btn-secondary mt-6">Explore other opportunities</Link>
    </div>
  );
}

function GovernmentSearch() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const [query, setQuery] = useState(get("q"));
  const [filters, setFilters] = useState({
    department: get("department"),
    province: get("province"),
    sector: get("sector"),
    level: get("level"),
    qualification: get("qualification"),
    entry: get("entry") === "1",
    online: get("online") === "1",
    soon: get("soon") === "1",
    sort: get("sort") || "closing_soon",
  });
  const set = <K extends keyof typeof filters>(k: K, v: (typeof filters)[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const [results, setResults] = useState<GovVacancySummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [departments, setDepartments] = useState<{ value: string; n: number }[]>([]);
  const [circular, setCircular] = useState<Circular | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    supabase.rpc("gov_vacancy_facets").then(({ data }) => {
      setDepartments(((data ?? []) as { kind: string; value: string; n: number }[])
        .filter((r) => r.kind === "department")
        .sort((a, b) => a.value.localeCompare(b.value)));
    });
    supabase
      .from("gov_circulars")
      .select("circular_number, year, issued_on")
      .order("issued_on", { ascending: false })
      .limit(1)
      .then(({ data }) => setCircular((data?.[0] as Circular) ?? null));
  }, []);

  async function load(offset: number) {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    const [levelMin, levelMax] = filters.level ? filters.level.split("-").map(Number) : [null, null];
    const { data, error: e } = await supabase.rpc("search_gov_vacancies", {
      p_query: query.trim(),
      p_department: filters.department || null,
      p_province: filters.province || null,
      p_sector: filters.sector || null,
      p_level_min: levelMin,
      p_level_max: levelMax,
      p_qualification: filters.qualification || null,
      p_entry_level: filters.entry,
      p_online_only: filters.online,
      p_closing_within_days: filters.soon ? 7 : null,
      p_sort: filters.sort === "relevance" && !query.trim() ? "closing_soon" : filters.sort,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (id !== requestId.current) return;
    setLoading(false);
    if (e) {
      setError(true);
      return;
    }
    const rows = (data as GovVacancySummary[]) ?? [];
    setResults((prev) => (offset === 0 ? rows : [...(prev ?? []), ...rows]));
    if (offset === 0) setTotal(rows[0]?.total_count ?? 0);
  }

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    for (const [k, v] of Object.entries(filters)) {
      if (k === "sort" ? v !== "closing_soon" : v) next.set(k, v === true ? "1" : String(v));
    }
    setParams(next, { replace: true });
    const t = setTimeout(() => load(0), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  const activeCount = useMemo(
    () => ["department", "province", "sector", "level", "qualification", "entry", "online", "soon"]
      .filter((k) => filters[k as keyof typeof filters]).length,
    [filters],
  );

  return (
    <div>
      <div className="mb-6 animate-rise">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Government</p>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Government vacancies</h1>
        <p className="mt-1 text-[15px] text-ink-soft">
          Every post in the Public Service Vacancy Circular
          {circular && <> {circular.circular_number} of {circular.year}, issued {formatDate(circular.issued_on, true)}</>}.
        </p>
      </div>

      <a
        href={Z83_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-5 flex items-center gap-3 rounded-2xl bg-brand/[0.06] px-4 py-3 transition hover:bg-brand/[0.1]"
      >
        <Icon name="document" className="h-5 w-5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 text-sm text-ink">
          <span className="font-semibold">Most posts need a Z83 form and a CV.</span>{" "}
          <span className="text-ink-soft">Download the official Z83 (2021 version).</span>
        </span>
        <Icon name="arrowUpRight" className="h-4 w-4 shrink-0 text-brand transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </a>

      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          inputMode="search"
          aria-label="Search government vacancies"
          placeholder="Title, department, centre or reference"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input rounded-2xl border-transparent bg-black/[0.05] py-3.5 pl-11 pr-11 focus:bg-white [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <SelectChip label="Department" value={filters.department} onChange={(v) => set("department", v)}
          options={departments.map((d) => ({ value: d.value, label: `${d.value} (${d.n})` }))} />
        <SelectChip label="Province" value={filters.province} onChange={(v) => set("province", v)}
          options={PROVINCES.map((p) => ({ value: p, label: p }))} />
        <SelectChip label="Salary level" value={filters.level} onChange={(v) => set("level", v)} options={LEVEL_BANDS} />
        <SelectChip label="Qualification" value={filters.qualification} onChange={(v) => set("qualification", v)}
          options={QUALIFICATIONS} />
        <SelectChip label="National & provincial" value={filters.sector} onChange={(v) => set("sector", v)}
          options={[{ value: "national", label: "National" }, { value: "provincial", label: "Provincial" }]} />
        <ToggleChip on={filters.entry} onClick={() => set("entry", !filters.entry)}>No experience needed</ToggleChip>
        <ToggleChip on={filters.online} onClick={() => set("online", !filters.online)}>Apply online</ToggleChip>
        <ToggleChip on={filters.soon} onClick={() => set("soon", !filters.soon)}>Closing this week</ToggleChip>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-ink-soft" aria-live="polite">
        <span className="flex items-center gap-2">
          {results === null ? "Searching..." : `${total.toLocaleString("en-ZA")} open ${total === 1 ? "post" : "posts"}`}
          {loading && results !== null && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" aria-hidden="true" />
          )}
          {activeCount > 0 && (
            <button type="button" className="font-medium text-brand"
              onClick={() => setFilters((f) => ({ ...f, department: "", province: "", sector: "", level: "", qualification: "", entry: false, online: false, soon: false }))}>
              Clear filters
            </button>
          )}
        </span>
        <label className="relative inline-flex items-center gap-1 font-medium text-ink">
          <Icon name="sliders" className="h-4 w-4 text-ink-faint" />
          {SORTS.find((s) => s.value === filters.sort)?.label}
          <select aria-label="Sort by" value={filters.sort} onChange={(e) => set("sort", e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0">
            {SORTS.filter((s) => s.value !== "relevance" || query.trim()).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="mt-3"><Alert>Search isn't working right now. Please try again.</Alert></div>}

      {results && results.length > 0 && (
        <ul className="panel mt-3 divide-y divide-hairline overflow-hidden">
          {results.map((v) => <VacancyRow key={v.id} v={v} />)}
        </ul>
      )}
      {results && results.length === 0 && !loading && (
        <div className="mt-3 rounded-2xl bg-white/60 px-5 py-10 text-center text-ink-soft">
          No open posts match that. Try fewer words or clear a filter.
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

function SelectChip({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value)?.label.replace(/ \(\d+\)$/, "");
  return (
    <label className="chip relative shrink-0 pr-8" aria-pressed={!!value}>
      <span className="max-w-[14rem] truncate">{current ?? label}</span>
      <Icon name="chevronRight" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 rotate-90" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip shrink-0" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

const toneClass = {
  urgent: "bg-red-50 text-red-700",
  soon: "bg-amber-50 text-amber-800",
  normal: "bg-black/[0.04] text-ink-soft",
  closed: "bg-black/[0.04] text-ink-faint",
};

function VacancyRow({ v }: { v: GovVacancySummary }) {
  const closing = closingLabel(v.closing_date);
  const where = centreSummary(v.centres, v.province);
  const salary = annualSalary(v.salary_min, v.salary_max);
  return (
    <li>
      <Link to={`/government/${v.id}`}
        className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-black/[0.02] active:bg-black/[0.04]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug text-ink">{v.title}</h2>
          <p className="truncate text-sm text-ink-soft">{[v.department, where].filter(Boolean).join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            {salary && <span>{salary}{v.salary_level ? ` · Level ${v.salary_level}` : ""}</span>}
            {v.num_posts > 1 && (
              <span className="inline-flex items-center gap-1"><Icon name="users" className="h-3.5 w-3.5" />{v.num_posts} posts</span>
            )}
            {closing && <span className={`rounded-full px-2 py-0.5 font-medium ${toneClass[closing.tone]}`}>{closing.text}</span>}
          </div>
        </div>
        <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
