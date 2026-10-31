import { useEffect, useState } from "react";
import { adminAction, adminRpc, fmt, when } from "../lib/admin";
import { Alert, Spinner } from "../components/ui";
import { AdminTitle, Panel, StatusPill, Table } from "./ui";

interface Run {
  id: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  api_calls: number;
  fetched: number;
  inserted: number;
  error: string | null;
}

interface Notification {
  id: number;
  created_at: string;
  channel: string;
  kind: string;
  status: string;
  error: string | null;
  recipient: string | null;
}

export function Jobs() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [notes, setNotes] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([adminRpc<Run[]>("admin_ingest_runs", { p_limit: 30 }), adminRpc<Notification[]>("admin_notifications", { p_limit: 50 })])
      .then(([r, n]) => {
        setRuns(r);
        setNotes(n);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function runSync() {
    setBusy(true);
    setMessage(null);
    try {
      await adminAction("run_sync");
      setMessage("Sync started. New jobs are embedded, matched and emailed automatically when it finishes. Refresh in a few minutes.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (error) return <Alert>{error}</Alert>;
  if (!runs || !notes) return <Spinner label="Loading" />;

  return (
    <div className="animate-rise space-y-6">
      <AdminTitle
        title="Jobs & emails"
        subtitle="Adzuna syncs run daily at 05:30 SAST and stay under 80 API calls a day."
        action={<button type="button" className="btn-primary" disabled={busy} onClick={runSync}>Run sync now</button>}
      />
      {message && <Alert kind="info">{message}</Alert>}

      <Panel title="Adzuna sync runs" action={<button type="button" className="btn-ghost py-1 text-sm" onClick={load}>Refresh</button>}>
        <Table head={["Started", "Mode", "API calls", "Fetched", "New jobs", "Result"]} empty={runs.length === 0}>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-5 py-2.5 text-ink">{when(r.started_at)}</td>
              <td className="px-5 py-2.5 text-ink-soft">{r.mode}</td>
              <td className="px-5 py-2.5 tabular-nums">{fmt(r.api_calls)}</td>
              <td className="px-5 py-2.5 tabular-nums">{fmt(r.fetched)}</td>
              <td className="px-5 py-2.5 tabular-nums">{fmt(r.inserted)}</td>
              <td className="px-5 py-2.5">
                {r.error ? <span className="text-xs text-red-700">{r.error}</span> : r.finished_at ? <StatusPill status="ready" /> : <StatusPill status="processing" />}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Recent emails">
        <Table head={["Time", "Recipient", "Type", "Status", "Error"]} empty={notes.length === 0}>
          {notes.map((n) => (
            <tr key={n.id}>
              <td className="whitespace-nowrap px-5 py-2.5 text-ink">{when(n.created_at)}</td>
              <td className="px-5 py-2.5 text-ink-soft">{n.recipient ?? "Deleted user"}</td>
              <td className="px-5 py-2.5 text-ink-soft">{n.kind}</td>
              <td className="px-5 py-2.5"><StatusPill status={n.status} /></td>
              <td className="px-5 py-2.5 text-xs text-red-700">{n.error}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
