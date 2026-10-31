import { formatSalary, type Match } from "../lib/types";
import { Icon } from "./Icon";
import { ago } from "./ui";

const human = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null);

interface Props {
  match: Match;
  onOpen?: (m: Match) => void;
  showNew?: boolean;
  index?: number;
}

/** A personal match: the primary card style, led by why it fits. */
export function MatchCard({ match, onOpen, showNew, index = 0 }: Props) {
  const salary = formatSalary(match);
  const facts = [
    match.location_display && { icon: "pin" as const, text: match.location_display },
    salary && { icon: "wallet" as const, text: salary },
    (match.contract_type || match.contract_time) && {
      icon: "briefcase" as const,
      text: [human(match.contract_type), human(match.contract_time)].filter(Boolean).join(" · "),
    },
  ].filter(Boolean) as { icon: "pin" | "wallet" | "briefcase"; text: string }[];
  const isNew = showNew && !match.viewed_at;

  return (
    <article
      className="card group animate-rise transition duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:p-6"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-soft">{match.company ?? "Company not stated"}</p>
          <h2 className="mt-0.5 text-[21px] font-semibold leading-snug tracking-tight text-ink">{match.title}</h2>
        </div>
        {isNew && (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/[0.08] px-2.5 py-1 text-xs font-semibold text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            New
          </span>
        )}
      </div>

      {facts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft">
          {facts.map((f) => (
            <li key={f.icon} className="inline-flex items-center gap-1.5">
              <Icon name={f.icon} className="h-4 w-4 text-ink-faint" />
              {f.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand/[0.07] to-brand/[0.02] px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
          <Icon name="sparkles" className="h-4 w-4" />
          Why this fits you
        </p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{match.reason}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-faint">{ago(match.posted_at) && `Posted ${ago(match.posted_at)!.toLowerCase()}`}</span>
        <div className="flex flex-col items-end gap-1">
          <a
            href={match.redirect_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            onClick={() => onOpen?.(match)}
          >
            View and apply
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </a>
          <span className="text-[11px] text-ink-faint">Opens on Adzuna</span>
        </div>
      </div>
    </article>
  );
}
