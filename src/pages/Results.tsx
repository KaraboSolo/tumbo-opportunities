import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { Match } from "../lib/types";
import { MatchCard } from "../components/MatchCard";
import { Alert, PageTitle, Spinner } from "../components/ui";
import { ExplorePrompt } from "./Matches";

export function Results() {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<Match[] | null>(null);
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

  if (error) return <Alert>We couldn't load your matches. Please refresh the page.</Alert>;
  if (!matches) return <Spinner label="Loading your matches" />;

  const channels = [
    profile?.notify_email && "email",
    profile?.notify_whatsapp && profile.whatsapp_number && "WhatsApp",
  ].filter(Boolean).join(" and ") || "email";
  const n = matches.length;

  const markViewed = (m: Match) => {
    supabase.rpc("mark_match_viewed", { p_match_id: m.id }).then(() => undefined);
  };

  return (
    <div>
      {profile && !profile.contact_email_verified_at && profile.notify_email && (
        <div className="mb-6">
          <Alert kind="info">
            Please confirm your email so we can send you new matches. Check your inbox, or{" "}
            <Link to="/settings" className="font-medium underline">resend the link in Settings</Link>.
          </Alert>
        </div>
      )}

      {n === 0 ? (
        <>
          <PageTitle eyebrow="Your first round" title="Nothing quite fits yet" />
          <div className="card text-[15px] leading-relaxed text-ink-soft">
            Nothing quite fits yet, and that's okay. New jobs arrive every day. We'll message you the moment a good one
            comes in. Meanwhile, you can{" "}
            <Link to="/onboarding?restart=1" className="font-medium text-brand">adjust your preferences</Link> to widen
            the search.
          </div>
        </>
      ) : (
        <>
          <PageTitle
            eyebrow="Your first round"
            title={n >= 3 ? `We found ${n} opportunities that suit you` : `We found ${n} strong match${n === 1 ? "" : "es"} so far`}
            subtitle={
              n >= 3
                ? "Here's why each one stood out."
                : "We only show roles that genuinely fit you, so we'd rather send fewer, better ones. We're still watching for new jobs every day and will message you as soon as something fits."
            }
          />
          <div className="space-y-4">
            {matches.map((m, i) => <MatchCard key={m.id} match={m} onOpen={markViewed} index={i} />)}
          </div>
          {n >= 3 && (
            <p className="mt-8 rounded-3xl bg-white/60 p-5 text-[15px] leading-relaxed text-ink-soft">
              That's your first round. We'll keep searching every day, and we'll message you on {channels} as soon as
              new opportunities that fit you come in. You can also find everything we've matched you with under{" "}
              <Link to="/matches" className="font-medium text-brand">My matches</Link>.
            </p>
          )}
        </>
      )}
      <ExplorePrompt />
    </div>
  );
}
