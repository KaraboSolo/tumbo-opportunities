import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { callFunction, supabase } from "../lib/supabase";

const MESSAGES = [
  "Reading your CV and getting to know your strengths...",
  "Looking through thousands of fresh opportunities across South Africa...",
  "Matching your skills with what employers are really asking for...",
  "Filtering out the roles that aren't right for you...",
  "Checking the details that matter: location, salary and level...",
  "Lining up the ones worth your time...",
  "Almost there. Good things take a moment.",
];

const POLL_MS = 5000;
const GIVE_UP_MS = 4 * 60_000;

export function Matching() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  // Rotate the messages, stopping on the last one.
  useEffect(() => {
    if (failed) return;
    const t = setInterval(() => setIndex((i) => Math.min(i + 1, MESSAGES.length - 1)), 3500);
    return () => clearInterval(t);
  }, [failed]);

  const run = useCallback(async () => {
    if (!session) return;
    setFailed(false);
    setIndex(0);
    const userId = session.user.id;
    const deadline = Date.now() + GIVE_UP_MS;
    let done = false;

    const finish = async (ok: boolean) => {
      if (done) return;
      done = true;
      if (ok) {
        await refreshProfile();
        navigate("/results", { replace: true });
      } else {
        setFailed(true);
      }
    };

    // The request can outlive a slow mobile connection, so also poll the status.
    const poll = async () => {
      while (!done && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const { data } = await supabase.from("profiles").select("onboarding_status").eq("id", userId).single();
        if (data?.onboarding_status === "matched") return finish(true);
        if (data?.onboarding_status === "error") return finish(false);
      }
      finish(false);
    };
    poll();

    try {
      const res = await callFunction<{ status: string }>("match-user");
      if (res.status === "matched") finish(true);
    } catch {
      // Keep polling: the run may still finish on the server.
    }
  }, [session, refreshProfile, navigate]);

  useEffect(() => {
    if (started.current || !profile) return;
    started.current = true;
    if (profile.onboarding_status === "matched") navigate("/results", { replace: true });
    else run();
  }, [profile, run, navigate]);

  if (failed) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold">Finding your best matches</h1>
        <p className="mt-4 text-gray-700">
          Something went wrong on our side while finding your matches. Your profile is saved. Please try again in a
          moment.
        </p>
        <button type="button" className="btn-primary mt-6" onClick={run}>Try again</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mx-auto mb-8 h-14 w-14 animate-spin rounded-full border-4 border-brand-light border-t-brand" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Finding your best matches</h1>
      <p key={index} className="mt-4 min-h-[3rem] animate-[fadein_0.6s_ease] text-gray-700" aria-live="polite">
        {MESSAGES[index]}
      </p>
      <p className="mt-8 text-xs text-gray-500">This usually takes under a minute. Please keep this page open.</p>
      <style>{"@keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}"}</style>
    </div>
  );
}
