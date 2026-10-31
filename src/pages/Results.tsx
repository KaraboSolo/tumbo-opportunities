import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { Match } from "../lib/types";
import { MatchCard } from "../components/MatchCard";
import { Alert, Spinner } from "../components/ui";

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
    <div className="space-y-6">
      {n === 0 ? (
        <div className="card text-gray-700">
          Nothing quite fits yet, and that's okay. New jobs arrive every day. We'll message you the moment a good one
          comes in. Meanwhile, you can{" "}
          <Link to="/onboarding?restart=1" className="text-brand underline">adjust your preferences</Link> to widen the
          search.
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {n >= 3 ? `We found ${n} opportunities that suit you` : `We found ${n} strong match${n === 1 ? "" : "es"} so far`}
            </h1>
            {n >= 3 ? (
              <p className="mt-1 text-gray-600">Here's why each one stood out.</p>
            ) : (
              <p className="mt-1 text-gray-600">
                We only show roles that genuinely fit you, so we'd rather send fewer, better ones. We're still watching
                for new jobs every day and will message you as soon as something fits.
              </p>
            )}
          </div>
          <div className="space-y-4">
            {matches.map((m) => <MatchCard key={m.id} match={m} onOpen={markViewed} />)}
          </div>
          {n >= 3 && (
            <p className="rounded-xl bg-brand-light p-4 text-sm text-brand-dark">
              That's your first round. We'll keep searching every day, and we'll message you on {channels} as soon as
              new opportunities that fit you come in. You can also find everything we've matched you with under{" "}
              <Link to="/matches" className="font-semibold underline">My matches</Link>.
            </p>
          )}
        </>
      )}
      {profile && !profile.contact_email_verified_at && profile.notify_email && (
        <Alert kind="info">
          Please confirm your email so we can send you new matches. Check your inbox, or{" "}
          <Link to="/settings" className="underline">resend the link in Settings</Link>.
        </Alert>
      )}
    </div>
  );
}
