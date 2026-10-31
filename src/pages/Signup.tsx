import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { callFunction, supabase } from "../lib/supabase";
import { isValidWhatsApp, normaliseSaNumber } from "../lib/types";
import { Alert, PageTitle } from "../components/ui";
import { captchaEnabled, Turnstile } from "../components/Turnstile";

export function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const wa = whatsapp.trim() ? normaliseSaNumber(whatsapp) : "";
    if (wa && !isValidWhatsApp(wa)) {
      setError("Please enter your WhatsApp number like +27 82 123 4567, or leave it empty.");
      return;
    }
    if (!consent) {
      setError("Please agree to the privacy policy to continue.");
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError("Please complete the check above the button.");
      return;
    }

    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        captchaToken: captchaToken ?? undefined,
        data: {
          full_name: fullName.trim(),
          contact_email: (contactEmail.trim() || email.trim()).toLowerCase(),
          whatsapp_number: wa || null,
          consent: true,
        },
      },
    });
    if (signUpError || !data.session) {
      setBusy(false);
      setError(signUpError?.message ?? "We couldn't create your account. Please try again.");
      return;
    }
    // Ask the user to confirm their contact email. Failure here should not block onboarding.
    callFunction("send-verification-email").catch(() => undefined);
    navigate("/onboarding", { replace: true });
  }

  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Create your account" subtitle="It's free. You'll upload your CV next." />
      <form onSubmit={onSubmit} className="card space-y-4 sm:p-7" noValidate>
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" className="input" autoComplete="name" required value={fullName}
            onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" className="input" autoComplete="new-password" minLength={8} required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-ink-faint">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="contact" className="label">Email for job alerts</label>
          <input id="contact" type="email" className="input" placeholder={email || "Same as above"} value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)} />
          <p className="mt-1 text-xs text-ink-faint">Leave empty to use your login email. We'll ask you to confirm it.</p>
        </div>
        <div>
          <label htmlFor="whatsapp" className="label">WhatsApp number <span className="font-normal text-ink-faint">(optional)</span></label>
          <input id="whatsapp" type="tel" inputMode="tel" className="input" placeholder="+27 82 123 4567"
            autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          <p className="mt-1 text-xs text-ink-faint">
            Coming soon: a short WhatsApp message when a new job fits you, at most a few a day. We'll verify the
            number first, and you can stop any time.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={consent}
            onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree that Tumbo may process my CV and contact details to match me with jobs, as set out in the{" "}
            <Link to="/privacy" className="text-brand underline" target="_blank">privacy policy</Link>.
          </span>
        </label>
        <Turnstile onToken={onToken} />
        {error && <Alert>{error}</Alert>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating your account..." : "Create account"}
        </button>
        <p className="text-center text-sm text-ink-soft">
          Already have an account? <Link to="/login" className="text-brand underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
