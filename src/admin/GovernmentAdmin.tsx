import { useEffect, useRef, useState } from "react";
import { adminAction, adminRpc, fmt, when } from "../lib/admin";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/gov";
import { Icon } from "../components/Icon";
import { Alert, Spinner } from "../components/ui";
import { AdminTitle, Panel, StatusPill, Switch } from "./ui";

interface Circular {
  id: number;
  circular_number: number | null;
  year: number | null;
  issued_on: string | null;
  storage_path: string;
  page_count: number | null;
  status: string;
  published: boolean;
  missing_post_numbers: number[];
  error: string | null;
  created_at: string;
  processed_at: string | null;
  posts: number;
  open_posts: number;
  chunks_total: number;
  chunks_done: number;
  chunks_failed: number;
}

const MAX_MB = 50;

export function GovernmentAdmin() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [circulars, setCirculars] = useState<Circular[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "success" | "error"; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [waitingFor, setWaitingFor] = useState<{ path: string; since: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [rows, setting] = await Promise.all([
        adminRpc<Circular[]>("admin_circulars"),
        supabase.from("app_settings").select("value").eq("key", "gov_vacancies_enabled").maybeSingle(),
      ]);
      setCirculars(rows);
      setEnabled(setting.data?.value === true);
      return rows;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Refresh while something is being read, or while we wait for a new upload to appear.
  const busy = !!waitingFor || (circulars ?? []).some((c) => c.status === "processing" || c.status === "pending");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const rows = await load();
      if (waitingFor) {
        if (rows.some((c) => c.storage_path === waitingFor.path)) {
          setWaitingFor(null);
          setNotice({ kind: "info", text: "Reading the circular. Progress updates below; a full circular takes about 15 minutes." });
        } else if (Date.now() - waitingFor.since > 120_000) {
          setWaitingFor(null);
          setNotice({
            kind: "error",
            text: "The circular didn't start. It may not be a DPSA vacancy circular, or it's already loaded (tick \"Replace\" to load it again).",
          });
        }
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, waitingFor]);

  async function toggle(value: boolean) {
    setEnabled(value);
    try {
      await adminAction("set_setting", { key: "gov_vacancies_enabled", value });
      setNotice({ kind: "success", text: value ? "Government vacancies are now visible to users." : "Government vacancies are now hidden from users." });
    } catch (e) {
      setEnabled(!value);
      setNotice({ kind: "error", text: (e as Error).message });
    }
  }

  async function upload() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setNotice({ kind: "error", text: "Please choose a PDF." });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setNotice({ kind: "error", text: `The PDF must be smaller than ${MAX_MB} MB.` });
      return;
    }
    setUploading(true);
    setNotice(null);
    try {
      const { path, token } = await adminAction<{ path: string; token: string }>("upload_url", { filename: file.name });
      const { error: upError } = await supabase.storage.from("circulars").uploadToSignedUrl(path, token, file, {
        contentType: "application/pdf",
      });
      if (upError) throw new Error("The upload didn't work. Please try again.");
      await adminAction("ingest_circular", { storage_path: path, replace });
      setWaitingFor({ path, since: Date.now() });
      setNotice({ kind: "info", text: "Uploaded. Reading the index pages..." });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    }
    setUploading(false);
  }

  async function act(action: string, payload: Record<string, unknown>, done: string) {
    try {
      await adminAction(action, payload);
      setNotice({ kind: "success", text: done });
      await load();
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!circulars || enabled === null) return <Spinner label="Loading" />;

  return (
    <div className="animate-rise space-y-6">
      <AdminTitle title="Government vacancies" subtitle="DPSA Public Service Vacancy Circulars. Browse-only for users; never matched." />
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <section className="flex items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-card">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Show Government vacancies to users</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {enabled ? "The Government tab is visible in the app." : "The Government tab is hidden and no posts are returned."}
          </p>
        </div>
        <Switch label="Show Government vacancies" checked={enabled} onChange={toggle} />
      </section>

      <Panel title="Add a circular">
        <p className="mb-4 text-sm text-ink-soft">
          Upload the weekly circular PDF from the DPSA website. It's read automatically and published when done.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer">
            <Icon name="document" className="h-4 w-4" />
            {file ? file.name : "Choose PDF"}
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace if already loaded
          </label>
          <button type="button" className="btn-primary" disabled={!file || uploading || !!waitingFor} onClick={upload}>
            {uploading ? "Uploading..." : waitingFor ? "Starting..." : "Upload and read"}
          </button>
        </div>
      </Panel>

      <section className="space-y-3">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Circulars</h2>
        {circulars.length === 0 && <p className="rounded-2xl bg-white/60 px-5 py-8 text-center text-ink-soft">No circulars yet.</p>}
        {circulars.map((c) => <CircularCard key={c.id} c={c} act={act} />)}
      </section>
    </div>
  );
}

function CircularCard({ c, act }: {
  c: Circular;
  act: (action: string, payload: Record<string, unknown>, done: string) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pct = c.chunks_total ? Math.round((c.chunks_done / c.chunks_total) * 100) : 0;
  const name = c.circular_number ? `Circular ${c.circular_number} of ${c.year}` : "Reading index...";

  return (
    <article className="rounded-3xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[17px] font-semibold text-ink">{name}</h3>
            <StatusPill status={c.status} />
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">
            {[c.issued_on && `Issued ${formatDate(c.issued_on, true)}`, c.page_count && `${c.page_count} pages`, `added ${when(c.created_at)}`]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        {c.status === "ready" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-soft">{c.published ? "Published" : "Hidden"}</span>
            <Switch label={`Publish ${name}`} checked={c.published}
              onChange={(v) => act("publish_circular", { circular_id: c.id, published: v }, v ? `${name} published.` : `${name} hidden.`)} />
          </div>
        )}
      </div>

      {c.status === "processing" && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">
            {fmt(c.chunks_done)} of {fmt(c.chunks_total)} sections read · {fmt(c.posts)} posts so far
            {c.chunks_failed > 0 && ` · ${c.chunks_failed} retrying`}
          </p>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Posts" value={fmt(c.posts)} />
        <Fact label="Still open" value={fmt(c.open_posts)} />
        <Fact label="Sections read" value={`${fmt(c.chunks_done)} / ${fmt(c.chunks_total)}`} />
        <Fact label="Finished" value={when(c.processed_at)} />
      </dl>

      {c.missing_post_numbers.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Post numbers not found: {c.missing_post_numbers.map((n) => `${c.circular_number}/${String(n).padStart(2, "0")}`).join(", ")}.
          Check them in the PDF; gaps in the DPSA numbering are normal.
        </p>
      )}
      {c.error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{c.error}</p>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
        {c.status !== "processing" && (
          <button type="button" className="btn-secondary py-2 text-sm"
            onClick={() => act("rerun_circular", { circular_id: c.id }, "Re-checking this circular. Failed sections and missing posts are retried.")}>
            Retry failed and missing
          </button>
        )}
        {confirmDelete ? (
          <>
            <button type="button" className="btn bg-red-600 py-2 text-sm text-white hover:bg-red-700"
              onClick={() => act("delete_circular", { circular_id: c.id }, `${name} deleted.`)}>
              Delete circular and its posts
            </button>
            <button type="button" className="btn-secondary py-2 text-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn-ghost py-2 text-sm text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.03] px-3 py-2.5">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
