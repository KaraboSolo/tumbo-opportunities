import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { callFunction, supabase } from "../lib/supabase";
import {
  JOB_TYPES,
  PROVINCES,
  SENIORITY,
  type ParsedProfile,
  type Preferences,
  type Seniority,
} from "../lib/types";
import { TagInput } from "../components/TagInput";
import { Alert, PageTitle, Spinner } from "../components/ui";

type Step = 1 | 2 | 3;

const MAX_BYTES = 5 * 1024 * 1024;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const emptyPrefs: Preferences = {
  target_roles: [],
  provinces: [],
  cities: [],
  remote_ok: false,
  min_salary_zar: null,
  job_types: [],
  aiming_seniority: null,
};

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Onboarding() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const restart = params.get("restart") === "1";

  const [step, setStep] = useState<Step>(1);
  const [parsed, setParsed] = useState<ParsedProfile | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(emptyPrefs);
  const [ready, setReady] = useState(false);

  // Resume where the user left off.
  useEffect(() => {
    if (ready || !profile) return;
    if (profile.onboarding_status === "matched" && !restart) {
      navigate("/matches", { replace: true });
      return;
    }
    if (profile.parsed_profile && profile.onboarding_status === "profile_ready" && !restart) {
      setParsed(profile.parsed_profile);
      setStep(2);
    }
    setPrefs({
      ...emptyPrefs,
      ...profile.preferences,
      target_roles: profile.preferences?.target_roles?.length
        ? profile.preferences.target_roles
        : (profile.parsed_profile?.suggested_target_roles ?? []),
    });
    setReady(true);
  }, [profile, ready, restart, navigate]);

  if (!ready) return <Spinner label="Loading" />;

  return (
    <div className="mx-auto max-w-xl">
      <ol className="mb-6 flex gap-2" aria-label="Progress">
        {["Your CV", "Your profile", "What you want"].map((name, i) => (
          <li key={name} className="flex-1">
            <div className={`h-1.5 rounded-full ${i + 1 <= step ? "bg-brand" : "bg-black/[0.08]"}`} />
            <span className={`mt-1 block text-xs ${i + 1 === step ? "font-semibold text-brand" : "text-ink-faint"}`}>
              {name}
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <UploadStep
          userId={session!.user.id}
          onParsed={(p) => {
            setParsed(p);
            setPrefs((cur) => ({
              ...cur,
              target_roles: cur.target_roles.length ? cur.target_roles : p.suggested_target_roles,
              provinces: cur.provinces.length || !p.location.province
                ? cur.provinces
                : PROVINCES.filter((x) => x.toLowerCase() === p.location.province!.toLowerCase()),
            }));
            setStep(2);
          }}
        />
      )}
      {step === 2 && parsed && (
        <ReviewStep profile={parsed} onChange={setParsed} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && parsed && (
        <PreferencesStep
          prefs={prefs}
          onChange={setPrefs}
          onBack={() => setStep(2)}
          onSubmit={async () => {
            await callFunction("save-profile", { parsed_profile: parsed, preferences: prefs });
            await refreshProfile();
            navigate(restart && profile?.onboarding_status === "matched" ? "/matches" : "/matching", { replace: true });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: upload or paste
// ---------------------------------------------------------------------------

function UploadStep({ userId, onParsed }: { userId: string; onParsed: (p: ParsedProfile) => void }) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "file") {
        if (!file) throw new Error("Please choose your CV file.");
        const ext = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : file.name.toLowerCase().endsWith(".docx") ? "docx" : null;
        if (!ext) throw new Error("Please upload a PDF or Word (.docx) file.");
        if (file.size > MAX_BYTES) throw new Error("Your CV must be smaller than 5 MB.");
        setBusy("Uploading your CV...");
        const path = `${userId}/cv-${Date.now()}.${ext}`;
        const { error: upError } = await supabase.storage.from("cvs").upload(path, file, {
          contentType: ext === "pdf" ? "application/pdf" : DOCX,
          upsert: false,
        });
        if (upError) throw new Error("The upload didn't work. Please check your connection and try again.");
        body = { cv_path: path };
      } else {
        if (text.trim().length < 100) throw new Error("Please paste the full text of your CV.");
        body = { text };
      }
      setBusy("Reading your CV. This takes about 20 seconds...");
      const { parsed_profile } = await callFunction<{ parsed_profile: ParsedProfile }>("parse-cv", body);
      onParsed(parsed_profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <PageTitle title="Upload your CV" subtitle="We'll read it and build your profile. You can fix anything we get wrong." />
      {mode === "file" ? (
        <label className="block cursor-pointer rounded-3xl border-2 border-dashed border-black/15 bg-white/60 p-8 text-center transition hover:border-brand/40 hover:bg-white">
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="block font-semibold text-brand">{file ? file.name : "Choose your CV"}</span>
          <span className="mt-1 block text-sm text-ink-faint">PDF or Word (.docx), up to 5 MB</span>
        </label>
      ) : (
        <div>
          <label htmlFor="cvtext" className="label">Paste your CV</label>
          <textarea id="cvtext" rows={12} className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      <button
        type="button"
        className="text-sm text-brand underline"
        onClick={() => setMode(mode === "file" ? "text" : "file")}
      >
        {mode === "file" ? "No file? Paste your CV text instead" : "Upload a file instead"}
      </button>
      {error && <Alert>{error}</Alert>}
      {busy ? (
        <Spinner label={busy} />
      ) : (
        <button type="submit" className="btn-primary w-full">Continue</button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2: review the parsed profile
// ---------------------------------------------------------------------------

function ReviewStep({
  profile,
  onChange,
  onBack,
  onNext,
}: {
  profile: ParsedProfile;
  onChange: (p: ParsedProfile) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const set = <K extends keyof ParsedProfile>(key: K, value: ParsedProfile[K]) => onChange({ ...profile, [key]: value });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <PageTitle title="Check your profile" subtitle="This is what we understood from your CV. Change anything that's wrong." />
      <div>
        <label htmlFor="headline" className="label">Headline</label>
        <input id="headline" className="input" value={profile.headline ?? ""}
          onChange={(e) => set("headline", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="years" className="label">Years of experience</label>
          <input id="years" type="number" min={0} max={60} step={0.5} className="input"
            value={profile.total_years_experience}
            onChange={(e) => set("total_years_experience", Number(e.target.value))} />
        </div>
        <div>
          <label htmlFor="level" className="label">Level</label>
          <select id="level" className="input" value={profile.seniority_level}
            onChange={(e) => set("seniority_level", e.target.value as Seniority)}>
            {SENIORITY.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="city" className="label">City</label>
          <input id="city" className="input" value={profile.location.city ?? ""}
            onChange={(e) => set("location", { ...profile.location, city: e.target.value || null })} />
        </div>
        <div>
          <label htmlFor="province" className="label">Province</label>
          <select id="province" className="input" value={profile.location.province ?? ""}
            onChange={(e) => set("location", { ...profile.location, province: e.target.value || null })}>
            <option value="">Not set</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <TagInput id="titles" label="Job titles you've held" values={profile.job_titles_held}
        onChange={(v) => set("job_titles_held", v)} />
      <TagInput id="skills" label="Skills" values={profile.skills} onChange={(v) => set("skills", v)}
        hint="Press Enter after each one." />
      <TagInput id="tools" label="Tools and software" values={profile.tools} onChange={(v) => set("tools", v)} />
      <TagInput id="industries" label="Industries" values={profile.industries} onChange={(v) => set("industries", v)} />
      <TagInput id="certs" label="Certifications and registrations" values={profile.certifications}
        onChange={(v) => set("certifications", v)} />
      <TagInput id="licences" label="Driver's licences" values={profile.licences} onChange={(v) => set("licences", v)}
        placeholder="e.g. Code B" />
      {profile.education.length > 0 && (
        <div>
          <span className="label">Education</span>
          <ul className="space-y-1.5">
            {profile.education.map((ed, i) => (
              <li key={`${ed.qualification}-${i}`} className="flex items-start justify-between gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-sm">
                <span>
                  {ed.qualification}
                  {ed.institution && <span className="text-ink-faint"> · {ed.institution}</span>}
                  {ed.year_completed && <span className="text-ink-faint"> · {ed.year_completed}</span>}
                </span>
                <button type="button" className="text-ink-faint hover:text-ink-soft" aria-label={`Remove ${ed.qualification}`}
                  onClick={() => set("education", profile.education.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <label htmlFor="summary" className="label">Summary</label>
        <textarea id="summary" rows={5} className="input" value={profile.profile_text}
          onChange={(e) => set("profile_text", e.target.value)} />
        <p className="mt-1 text-xs text-ink-faint">We use this to find jobs like your experience.</p>
      </div>
      <div className="flex gap-3">
        <button type="button" className="btn-secondary" onClick={onBack}>Upload a different CV</button>
        <button type="submit" className="btn-primary flex-1">Looks good</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3: preferences
// ---------------------------------------------------------------------------

function PreferencesStep({
  prefs,
  onChange,
  onBack,
  onSubmit,
}: {
  prefs: Preferences;
  onChange: (p: Preferences) => void;
  onBack: () => void;
  onSubmit: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => onChange({ ...prefs, [key]: value });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (prefs.target_roles.length === 0) {
      setError("Please add at least one role you'd like.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <PageTitle title="What are you looking for?" subtitle="We'll only show you jobs that fit these." />
      <TagInput id="roles" label="Roles you'd like" values={prefs.target_roles} onChange={(v) => set("target_roles", v)}
        hint="We've suggested some from your CV. Add or remove as you like." placeholder="e.g. Data Analyst" />
      <fieldset>
        <legend className="label">Provinces</legend>
        <p className="-mt-0.5 mb-1.5 text-xs text-ink-faint">Leave all unticked to search the whole country.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PROVINCES.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={prefs.provinces.includes(p)}
                onChange={() => set("provinces", toggle(prefs.provinces, p))} />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      <TagInput id="cities" label="Specific cities (optional)" values={prefs.cities} onChange={(v) => set("cities", v)}
        placeholder="e.g. Durban" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-brand" checked={prefs.remote_ok}
          onChange={(e) => set("remote_ok", e.target.checked)} />
        I'm open to remote jobs anywhere
      </label>
      <div>
        <label htmlFor="salary" className="label">Minimum monthly salary (ZAR, optional)</label>
        <div className="flex items-center gap-2">
          <span className="text-ink-faint">R</span>
          <input id="salary" type="number" inputMode="numeric" min={0} step={500} className="input"
            value={prefs.min_salary_zar ?? ""}
            onChange={(e) => set("min_salary_zar", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <p className="mt-1 text-xs text-ink-faint">Jobs that don't state a salary are still included.</p>
      </div>
      <fieldset>
        <legend className="label">Job types</legend>
        <div className="flex flex-wrap gap-3">
          {JOB_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={prefs.job_types.includes(t.value)}
                onChange={() => set("job_types", toggle(prefs.job_types, t.value))} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="aim" className="label">Level you're aiming for</label>
        <select id="aim" className="input" value={prefs.aiming_seniority ?? ""}
          onChange={(e) => set("aiming_seniority", (e.target.value || null) as Seniority | null)}>
          <option value="">Same as now</option>
          {SENIORITY.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-3">
        <button type="button" className="btn-secondary" onClick={onBack} disabled={busy}>Back</button>
        <button type="submit" className="btn-primary flex-1" disabled={busy}>
          {busy ? "Saving..." : "Find my matches"}
        </button>
      </div>
    </form>
  );
}
