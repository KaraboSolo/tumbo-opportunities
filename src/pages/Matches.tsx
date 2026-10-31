import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Match } from "../lib/types";
import { MatchCard } from "../components/MatchCard";
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

  const shown = (matches ?? []).filter((m) =>
    filter === "all" ? true : filter === "new" ? !m.viewed_at : !!m.viewed_at
  );
  const newCount = (matches ?? []).filter((m) => !m.viewed_at).length;

  return (
    <div>
      <PageTitle title="My matches" subtitle="Every job we've matched you with, newest first. Updated daily." />
      <div className="mb-4 flex gap-2" role="tablist">
        {(["all", "new", "viewed"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === f ? "bg-brand text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f === "all" ? "All" : f === "new" ? `New${newCount ? ` (${newCount})` : ""}` : "Viewed"}
          </button>
        ))}
      </div>
      {error && <Alert>We couldn't load your matches. Please refresh the page.</Alert>}
      {!matches && !error && <Spinner label="Loading your matches" />}
      {matches && shown.length === 0 && (
        <p className="card text-gray-600">
          {filter === "all"
            ? "No matches yet. New jobs arrive every day, and we'll let you know as soon as one fits."
            : filter === "new"
              ? "You're all caught up."
              : "You haven't opened any jobs yet."}
        </p>
      )}
      <div className="space-y-4">
        {shown.map((m) => <MatchCard key={m.id} match={m} onOpen={markViewed} showNew />)}
      </div>
    </div>
  );
}
