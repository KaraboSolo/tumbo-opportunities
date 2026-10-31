import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { callFunction, supabase } from "../lib/supabase";
import { isValidWhatsApp, normaliseSaNumber } from "../lib/types";
import { Alert, PageTitle, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";
import { useIsAdmin } from "../lib/admin";

export function Settings() {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const emailResult = params.get("email");
  const isAdmin = useIsAdmin();

  const [fullName, setFullName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setContactEmail(profile.contact_email ?? "");
    setWhatsapp(profile.whatsapp_number ?? "");
    setNotifyEmail(profile.notify_email);
    setNotifyWhatsapp(profile.notify_whatsapp);
    setPaused(profile.notifications_paused);
  }, [profile]);

  if (!profile) return <Spinner label="Loading" />;

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const wa = whatsapp.trim() ? normaliseSaNumber(whatsapp) : null;
    if (wa && !isValidWhatsApp(wa)) {
      setMessage({ kind: "error", text: "Please enter your WhatsApp number like +27 82 123 4567." });
      return;
    }
    setBusy(true);
    const emailChanged = contactEmail.trim().toLowerCase() !== (profile!.contact_email ?? "");
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        contact_email: contactEmail.trim().toLowerCase() || null,
        whatsapp_number: wa,
        notify_email: notifyEmail,
        notify_whatsapp: notifyWhatsapp && !!wa,
        notifications_paused: paused,
      })
      .eq("id", profile!.id);
    if (error) {
      setMessage({ kind: "error", text: "We couldn't save your settings. Please try again." });
    } else {
      if (emailChanged && contactEmail.trim()) callFunction("send-verification-email").catch(() => undefined);
      setMessage({
        kind: "success",
        text: emailChanged ? "Saved. We've sent a confirmation link to your new email." : "Saved.",
      });
      await refreshProfile();
    }
    setBusy(false);
  }

  async function resend() {
    setMessage(null);
    try {
      await callFunction("send-verification-email");
      setMessage({ kind: "info", text: "We've sent you a confirmation link. Please check your inbox." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      await callFunction("delete-account");
      await signOut();
      navigate("/", { replace: true });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageTitle title="Settings" />
      {emailResult === "confirmed" && <Alert kind="success">Thanks, your email is confirmed.</Alert>}
      {emailResult === "invalid" && <Alert>That confirmation link has expired or was already used.</Alert>}

      <form onSubmit={save} className="space-y-8">
        <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Contact details</h2>
        <div className="card space-y-4">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="contact" className="label">Email for job alerts</label>
          <input id="contact" type="email" className="input" value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)} />
          {profile.contact_email && (
            <p className="mt-1 text-xs text-ink-faint">
              {profile.contact_email_verified_at ? (
                "Confirmed."
              ) : (
                <>
                  Not confirmed yet. We only email confirmed addresses.{" "}
                  <button type="button" className="text-brand underline" onClick={resend}>Resend link</button>
                </>
              )}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="wa" className="label">WhatsApp number</label>
          <input id="wa" type="tel" inputMode="tel" className="input" placeholder="+27 82 123 4567" value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)} />
        </div>
        </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Notifications</h2>
          <div className="panel divide-y divide-hairline">
            <Toggle label="Email me new matches" checked={notifyEmail} onChange={setNotifyEmail} />
            <Toggle label="WhatsApp me new matches" hint="Coming soon" checked={notifyWhatsapp}
              disabled={!whatsapp.trim()} onChange={setNotifyWhatsapp} />
            <Toggle label="Pause all notifications" checked={paused} onChange={setPaused} />
          </div>
        </section>

        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
          {busy ? "Saving..." : "Save changes"}
        </button>
      </form>

      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Your CV and preferences</h2>
        <Link to="/onboarding?restart=1" className="panel flex items-center justify-between px-5 py-4 transition hover:bg-white/70">
          <span>
            <span className="block text-[15px] font-medium text-ink">Update my CV and preferences</span>
            <span className="block text-sm text-ink-soft">Upload a newer CV or change what you're looking for.</span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 text-ink-faint" />
        </Link>
      </section>

      {isAdmin && (
        <Link to="/admin" className="panel flex items-center justify-between px-5 py-4 transition hover:bg-white/70">
          <span className="text-[15px] font-medium text-ink">Admin portal</span>
          <Icon name="chevronRight" className="h-5 w-5 text-ink-faint" />
        </Link>
      )}

      <section className="panel">
        <button
          type="button"
          className="w-full px-5 py-4 text-left text-[15px] font-medium text-brand transition hover:bg-black/[0.02]"
          onClick={async () => {
            await signOut();
            navigate("/", { replace: true });
          }}
        >
          Sign out
        </button>
      </section>

      <section className="space-y-2 rounded-3xl bg-red-50/60 p-5">
        <h2 className="text-[17px] font-semibold text-red-800">Delete my account</h2>
        <p className="text-sm text-ink-soft">
          This permanently deletes your account, CV, profile and matches. It can't be undone.
        </p>
        {confirmDelete ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy}
              onClick={deleteAccount}>
              Yes, delete everything
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn bg-white text-red-700 shadow-sm hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}>
            Delete my account and data
          </button>
        )}
      </section>
    </div>
  );
}

/** iOS-style switch row. */
function Toggle({ label, hint, checked, disabled, onChange }: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 px-5 py-3.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="text-[15px] text-ink">
        {label}
        {hint && <span className="ml-2 text-xs text-ink-faint">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)} />
        <span className="h-[31px] w-[51px] rounded-full bg-black/[0.12] transition peer-checked:bg-[#34c759] peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25" />
        <span className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
