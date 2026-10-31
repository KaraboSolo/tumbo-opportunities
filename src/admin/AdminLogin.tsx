import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useIsAdmin } from "../lib/admin";
import { Alert } from "../components/ui";
import { captchaEnabled, Turnstile } from "../components/Turnstile";

export function AdminLogin() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const isAdmin = useIsAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  useEffect(() => {
    if (session && isAdmin) navigate("/admin", { replace: true });
  }, [session, isAdmin, navigate]);

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
      setError("That email and password don't match.");
      return;
    }
    const { data } = await supabase.rpc("is_admin");
    setBusy(false);
    if (data !== true) {
      setError("This account doesn't have admin access.");
      return;
    }
    navigate("/admin", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="Tumbo" className="mx-auto h-9 w-auto" width={144} height={36} />
          <h1 className="mt-6 text-[28px] font-bold tracking-tight text-ink">Admin sign in</h1>
          <p className="mt-1 text-ink-soft">Tumbo Opportunities</p>
        </div>
        {session && isAdmin === false && (
          <div className="mb-4">
            <Alert>You're signed in with an account that isn't an admin. Sign in with an admin account below.</Alert>
          </div>
        )}
        <form onSubmit={onSubmit} className="card space-y-4 sm:p-7">
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
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-faint">
          <Link to="/" className="hover:text-ink">Back to Tumbo</Link>
        </p>
      </div>
    </div>
  );
}
