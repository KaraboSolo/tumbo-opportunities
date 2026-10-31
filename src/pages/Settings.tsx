import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { callFunction, supabase } from "../lib/supabase";
import { isValidWhatsApp, normaliseSaNumber } from "../lib/types";
import { Alert, PageTitle, Spinner } from "../components/ui";

export function Settings() {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const emailResult = params.get("email");

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

      <form onSubmit={save} className="space-y-4">
        <h2 className="text-lg font-semibold">Contact details</h2>
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="contact" className="label">Email for job alerts</label>
          <input id="contact" type="email" className="input" value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)} />
          {profile.contact_email && (
            <p className="mt-1 text-xs text-gray-500">
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

        <h2 className="pt-2 text-lg font-semibold">Notifications</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.checked)} />
          Email me new matches
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={notifyWhatsapp} disabled={!whatsapp.trim()}
            onChange={(e) => setNotifyWhatsapp(e.target.checked)} />
          WhatsApp me new matches <span className="text-gray-500">(coming soon)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={paused}
            onChange={(e) => setPaused(e.target.checked)} />
          Pause all notifications
        </label>

        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your CV and preferences</h2>
        <p className="text-sm text-gray-600">Upload a newer CV or change what you're looking for.</p>
        <Link to="/onboarding?restart=1" className="btn-secondary">Update my CV and preferences</Link>
      </section>

      <section className="space-y-2 rounded-xl border border-red-200 p-4">
        <h2 className="text-lg font-semibold text-red-800">Delete my account</h2>
        <p className="text-sm text-gray-600">
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
          <button type="button" className="btn border border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}>
            Delete my account and data
          </button>
        )}
      </section>
    </div>
  );
}
