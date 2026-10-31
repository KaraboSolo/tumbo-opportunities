import { formatSalary, type Match } from "../lib/types";

const human = (s: string | null) => (s ? s.replace(/_/g, " ") : null);

export function MatchCard({ match, onOpen, showNew }: { match: Match; onOpen?: (m: Match) => void; showNew?: boolean }) {
  const salary = formatSalary(match);
  const contract = [human(match.contract_type), human(match.contract_time)].filter(Boolean).join(", ");

  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-snug text-gray-900">{match.title}</h2>
          <p className="text-sm text-gray-600">
            {[match.company, match.location_display].filter(Boolean).join(" · ")}
          </p>
        </div>
        {showNew && !match.viewed_at && (
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">New</span>
        )}
      </div>
      {(salary || contract) && (
        <p className="mt-1 text-sm text-gray-600">{[salary, contract].filter(Boolean).join(" · ")}</p>
      )}
      <div className="mt-3 rounded-lg bg-brand-light px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Why this fits you</p>
        <p className="mt-0.5 text-sm text-gray-800">{match.reason}</p>
      </div>
      <a
        href={match.redirect_url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary mt-3 w-full sm:w-auto"
        onClick={() => onOpen?.(match)}
      >
        View and apply
      </a>
    </article>
  );
}
