import { useCallback, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { homeFor } from "../lib/types";
import { Alert, PageTitle } from "../components/ui";
import { captchaEnabled, Turnstile } from "../components/Turnstile";

export function Login() {
  const navigate = useNavigate();
  const { session, profile, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  if (session && profile && !busy) return <Navigate to={homeFor(profile.onboarding_status)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaEnabled && !captchaToken) {
      setError("Please complete the check above the button.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    if (signInError) {
      setBusy(false);
      setError("That email and password don't match. Please try again.");
      return;
    }
    const next = await refreshProfile();
    navigate(homeFor(next?.onboarding_status), { replace: true });
  }

  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Log in" />
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" className="input" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Turnstile onToken={onToken} />
        {error && <Alert>{error}</Alert>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
        <p className="text-center text-sm text-gray-600">
          New here? <Link to="/signup" className="text-brand underline">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
