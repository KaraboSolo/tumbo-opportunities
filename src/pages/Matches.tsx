import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Match } from "../lib/types";
import { MatchCard } from "../components/MatchCard";
import { Icon } from "../components/Icon";
import { Alert, PageTitle, Spinner } from "../components/ui";

type Filter = "all" | "new" | "viewed";

export function Matches() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase
      .from("my_matches")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (e) setError(true);
        else setMatches((data as Match[]) ?? []);
      });
  }, []);

  const markViewed = (m: Match) => {
    if (m.viewed_at) return;
    const now = new Date().toISOString();
    setMatches((list) => list?.map((x) => (x.id === m.id ? { ...x, viewed_at: now } : x)) ?? null);
    supabase.rpc("mark_match_viewed", { p_match_id: m.id }).then(() => undefined);
  };

  const all = matches ?? [];
  const newCount = all.filter((m) => !m.viewed_at).length;
  const shown = all.filter((m) => (filter === "all" ? true : filter === "new" ? !m.viewed_at : !!m.viewed_at));

  return (
    <div>
      <PageTitle
        eyebrow="For you"
        title="My matches"
        subtitle={
          matches && all.length > 0
            ? `${all.length} role${all.length === 1 ? "" : "s"} picked for your experience. Updated daily.`
            : "Roles picked for your experience. Updated daily."
        }
      />

      {all.length > 0 && (
        <div className="segmented mb-6" role="tablist" aria-label="Filter matches">
          {(["all", "new", "viewed"] as Filter[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "new" ? `New${newCount ? ` · ${newCount}` : ""}` : "Viewed"}
            </button>
          ))}
        </div>
      )}

      {error && <Alert>We couldn't load your matches. Please refresh the page.</Alert>}
      {!matches && !error && <Spinner label="Loading your matches" />}

      {matches && shown.length === 0 && (
        <div className="card py-10 text-center text-ink-soft">
          {filter === "all"
            ? "No matches yet. New jobs arrive every day, and we'll let you know as soon as one fits."
            : filter === "new"
              ? "You're all caught up."
              : "You haven't opened any jobs yet."}
        </div>
      )}

      <div className="space-y-4">
        {shown.map((m, i) => <MatchCard key={m.id} match={m} onOpen={markViewed} showNew index={i} />)}
      </div>

      {matches && <ExplorePrompt />}
    </div>
  );
}

/** A quiet hand-off to Explore, visibly secondary to the matches above. */
export function ExplorePrompt() {
  return (
    <Link
      to="/explore"
      className="group mt-10 flex items-center gap-4 rounded-2xl border border-dashed border-black/15 px-5 py-4 transition hover:border-brand/40 hover:bg-white"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-ink-soft transition group-hover:bg-brand/10 group-hover:text-brand">
        <Icon name="search" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">Looking for something else?</span>
        <span className="block text-sm text-ink-soft">Search every opportunity we have, across South Africa.</span>
      </span>
      <Icon name="chevronRight" className="h-5 w-5 text-ink-faint transition group-hover:translate-x-0.5" />
    </Link>
  );
}
