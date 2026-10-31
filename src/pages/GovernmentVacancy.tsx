import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSetting } from "../lib/settings";
import {
  annualSalary,
  closingLabel,
  DPSA_CIRCULARS_URL,
  employmentLabel,
  formatDate,
  type GovVacancy,
  monthlySalary,
  qualificationLabel,
  Z83_URL,
} from "../lib/gov";
import { Icon, type IconName } from "../components/Icon";
import { Spinner } from "../components/ui";
import { GovernmentUnavailable } from "./Government";

interface Section {
  department: string;
  applications: string | null;
  note: string | null;
}

interface Circular {
  circular_number: number;
  year: number;
  issued_on: string | null;
}

export function GovernmentVacancy() {
  const enabled = useSetting("gov_vacancies_enabled");
  const { id } = useParams();
  const navigate = useNavigate();
  const [vacancy, setVacancy] = useState<GovVacancy | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [circular, setCircular] = useState<Circular | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const { data } = await supabase.from("gov_vacancies").select("*").eq("id", Number(id)).maybeSingle();
      if (!data) {
        setState("missing");
        return;
      }
      const v = data as GovVacancy;
      setVacancy(v);
      const [s, c] = await Promise.all([
        v.section_id
          ? supabase.from("gov_sections").select("department, applications, note").eq("id", v.section_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("gov_circulars").select("circular_number, year, issued_on").eq("id", v.circular_id).maybeSingle(),
      ]);
      setSection((s.data as Section) ?? null);
      setCircular((c.data as Circular) ?? null);
      setState("ready");
    })();
  }, [id, enabled]);

  if (enabled === false) return <GovernmentUnavailable />;
  if (state === "loading" || enabled === undefined) return <Spinner label="Loading" />;
  if (state === "missing" || !vacancy) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-soft">This vacancy is no longer available.</p>
        <Link to="/government" className="btn-secondary mt-5">Back to government vacancies</Link>
      </div>
    );
  }

  const v = vacancy;
  const closing = closingLabel(v.closing_date);
  const salary = annualSalary(v.salary_min, v.salary_max);
  const references = v.reference_numbers.join(", ");

  return (
    <article className="animate-rise">
      <button
        type="button"
        // Go back to the filtered list when we came from it; otherwise open the list.
        onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/government"))}
        className="-ml-2 mb-4 inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[15px] text-brand hover:bg-brand/[0.06]"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Government vacancies
      </button>

      <p className="text-sm font-medium text-ink-soft">{v.department}</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">{v.title}</h1>
      {v.directorate && <p className="mt-1 text-[15px] text-ink-soft">{v.directorate}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {closing && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            closing.tone === "urgent" ? "bg-red-50 text-red-700" : closing.tone === "soon" ? "bg-amber-50 text-amber-800" : "bg-black/[0.05] text-ink-soft"}`}>
            {closing.text}
          </span>
        )}
        {v.is_readvertisement && <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-ink-soft">Re-advertised</span>}
        <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-ink-soft">
          {v.sector === "national" ? "National department" : `${v.province ?? "Provincial"} provincial government`}
        </span>
      </div>

      {/* Key facts */}
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-hairline shadow-card">
        <Fact icon="wallet" label="Salary" value={salary ?? "Not stated"}
          sub={[v.salary_level ? `Level ${v.salary_level}` : null, v.all_inclusive ? "All-inclusive package" : monthlySalary(v.salary_min, v.salary_max)].filter(Boolean).join(" · ") || undefined} />
        <Fact icon="calendar" label="Closing date"
          value={v.closing_date ? formatDate(v.closing_date, true)! : "See advert"}
          sub={v.closing_time ? `By ${v.closing_time}` : undefined} />
        <Fact icon="pin" label={v.centres.length > 1 ? `Centres (${v.centres.length})` : "Centre"}
          value={v.centres.length ? v.centres.map((c) => c.centre).slice(0, 3).join("; ") + (v.centres.length > 3 ? "…" : "") : v.province ?? "Not stated"} />
        <Fact icon="briefcase" label="Type"
          value={[employmentLabel(v.employment_type), v.contract_duration].filter(Boolean).join(" · ") || "Not stated"}
          sub={v.num_posts > 1 ? `${v.num_posts} posts` : undefined} />
      </dl>

      {/* How to apply */}
      <section className="card mt-6 sm:p-6">
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">How to apply</h2>
        <ol className="mt-4 space-y-5">
          <Step n={1} title="Get your documents ready">
            <ul className="mt-2 space-y-1.5">
              {v.required_documents.map((d) => (
                <li key={d} className="flex items-start gap-2 text-[15px] text-ink">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#34c759]" />{d}
                </li>
              ))}
              {v.required_documents.length === 0 && <li className="text-[15px] text-ink-soft">See the application instructions below.</li>}
            </ul>
            {v.z83_required && (
              <a href={Z83_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3 py-2 text-sm">
                <Icon name="document" className="h-4 w-4" />Download the Z83 form
              </a>
            )}
            {v.certified_copies === "shortlisted_only" && (
              <p className="mt-2 text-sm text-ink-soft">Certified copies of qualifications are only needed if you're shortlisted.</p>
            )}
            {v.certified_copies === "with_application" && (
              <p className="mt-2 text-sm text-ink-soft">Attach certified copies of your qualifications and ID when you apply.</p>
            )}
          </Step>

          <Step n={2} title="Submit your application">
            <div className="mt-2 flex flex-wrap gap-2">
              {v.application_url && (
                <a href={v.application_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  Apply online<Icon name="arrowUpRight" className="h-4 w-4" />
                </a>
              )}
              {v.application_email && (
                <a href={`mailto:${v.application_email}?subject=${encodeURIComponent(`Application: ${v.title}${references ? ` (Ref ${references})` : ""}`)}`}
                  className={v.application_url ? "btn-secondary" : "btn-primary"}>
                  <Icon name="mail" className="h-4 w-4" />Email your application
                </a>
              )}
            </div>
            {v.application_email && (
              <p className="mt-2 break-all text-sm text-ink-soft">
                Email: <span className="font-medium text-ink">{v.application_email}</span>
              </p>
            )}
            {v.application_postal_address && <Address label="Post to" text={v.application_postal_address} />}
            {v.application_physical_address && <Address label="Hand deliver to" text={v.application_physical_address} />}
            {v.for_attention && <p className="mt-2 text-sm text-ink-soft">For attention: {v.for_attention}</p>}
            {!v.application_url && !v.application_email && !v.application_postal_address && !v.application_physical_address && (
              <p className="mt-2 text-[15px] text-ink-soft">Follow the application instructions below.</p>
            )}
          </Step>

          {references && (
            <Step n={3} title="Quote the reference number">
              <CopyRow text={references} />
              {v.centres.length > 1 && (
                <ul className="mt-3 divide-y divide-hairline rounded-2xl bg-black/[0.03] text-sm">
                  {v.centres.map((c) => (
                    <li key={`${c.centre}-${c.reference}`} className="flex justify-between gap-3 px-3 py-2">
                      <span className="text-ink">{c.centre}</span>
                      {c.reference && <span className="shrink-0 font-mono text-xs text-ink-soft">{c.reference}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Step>
          )}
        </ol>
        {(v.application_instructions ?? section?.applications) && (
          <Disclosure title="Full application instructions">{v.application_instructions ?? section?.applications}</Disclosure>
        )}
      </section>

      {/* The advert */}
      <TextSection title="Requirements" text={v.requirements}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {qualificationLabel(v.qualification_level) && <Pill>{qualificationLabel(v.qualification_level)}</Pill>}
          {v.min_years_experience !== null && (
            <Pill>{v.min_years_experience === 0 ? "No experience needed" : `${v.min_years_experience}+ years' experience`}</Pill>
          )}
          {v.drivers_licence_required && <Pill>Driver's licence</Pill>}
        </div>
      </TextSection>
      <TextSection title="Duties" text={v.duties} />
      <TextSection title="Enquiries" text={v.enquiries} />
      <TextSection title="Notes" text={v.notes} />
      {section?.note && (
        <section className="card mt-4 sm:p-6">
          <Disclosure title={`Notes from the ${section.department}`} bare>{section.note}</Disclosure>
        </section>
      )}

      <p className="mt-8 text-xs leading-relaxed text-ink-faint">
        Source: Public Service Vacancy Circular {circular ? `${circular.circular_number} of ${circular.year}` : ""}
        {" "}· Post {v.post_number}{v.source_page ? ` · page ${v.source_page}` : ""}.{" "}
        <a href={DPSA_CIRCULARS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
          View circulars on the DPSA website
        </a>
        . Always confirm the details in the official circular before applying.
      </p>
    </article>
  );
}

function Fact({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white p-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-faint">
        <Icon name={icon} className="h-4 w-4" />{label}
      </dt>
      <dd className="mt-1 text-[15px] font-semibold leading-snug text-ink">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-ink-soft">{sub}</dd>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Address({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3 rounded-2xl bg-black/[0.03] px-3.5 py-2.5">
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p className="whitespace-pre-line text-[15px] text-ink">{text}</p>
    </div>
  );
}

function CopyRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
      className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2 text-left font-mono text-sm text-ink transition hover:bg-black/[0.07] active:scale-[0.98]"
    >
      <span className="truncate">{text}</span>
      <span className="shrink-0 font-sans text-xs font-medium text-brand">
        {copied ? "Copied" : <Icon name="copy" className="h-4 w-4" />}
      </span>
    </button>
  );
}

function Disclosure({ title, children, bare }: { title: string; children: ReactNode; bare?: boolean }) {
  return (
    <details className={`group ${bare ? "" : "mt-5 border-t border-hairline pt-4"}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium text-brand">
        {title}
        <Icon name="chevronRight" className="h-4 w-4 transition group-open:rotate-90" />
      </summary>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{children}</p>
    </details>
  );
}

function TextSection({ title, text, children }: { title: string; text: string | null; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 600;
  return (
    <section className="card mt-4 sm:p-6">
      <h2 className="mb-3 text-[17px] font-semibold text-ink">{title}</h2>
      {children}
      <p className={`whitespace-pre-line text-[15px] leading-relaxed text-ink-soft ${long && !open ? "line-clamp-[8]" : ""}`}>{text}</p>
      {long && (
        <button type="button" className="mt-2 text-[15px] font-medium text-brand" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </section>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-brand/[0.07] px-2.5 py-1 font-medium text-brand">{children}</span>;
}

