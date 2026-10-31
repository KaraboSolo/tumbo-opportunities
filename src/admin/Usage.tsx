import { useEffect, useState } from "react";
import { adminRpc, fmt } from "../lib/admin";
import { Alert, Spinner } from "../components/ui";
import { AdminTitle, Panel, StatTile, Table } from "./ui";

interface Row {
  function_name: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

const LABELS: Record<string, string> = {
  "parse-cv": "Reading CVs",
  "save-profile": "Profile embeddings",
  "embed-jobs": "Job embeddings",
  "match-user": "Matching and reasons",
  "ingest-gov-circular": "Government circulars",
};

export function Usage() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    adminRpc<Row[]>("admin_llm_usage", { p_days: days }).then(setRows).catch((e) => setError(e.message));
  }, [days]);

  if (error) return <Alert>{error}</Alert>;
  const totals = (rows ?? []).reduce(
    (t, r) => ({ calls: t.calls + r.calls, input: t.input + r.input_tokens, output: t.output + r.output_tokens }),
    { calls: 0, input: 0, output: 0 },
  );

  return (
    <div className="animate-rise space-y-6">
      <AdminTitle
        title="AI usage"
        subtitle="Gemini calls and tokens from llm_usage. Output tokens include thinking. Embedding tokens are estimates."
        action={
          <div className="segmented" role="tablist" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>
        }
      />
      {!rows ? <Spinner /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Calls" value={fmt(totals.calls)} />
            <StatTile label="Input tokens" value={fmt(totals.input)} />
            <StatTile label="Output tokens" value={fmt(totals.output)} />
          </div>
          <Panel title="By feature and model">
            <Table head={["Feature", "Model", "Calls", "Input tokens", "Output tokens", "Avg tokens / call"]} empty={rows.length === 0}>
              {rows.map((r) => (
                <tr key={`${r.function_name}-${r.model}`}>
                  <td className="px-5 py-2.5 font-medium text-ink">{LABELS[r.function_name] ?? r.function_name}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-ink-soft">{r.model}</td>
                  <td className="px-5 py-2.5 tabular-nums">{fmt(r.calls)}</td>
                  <td className="px-5 py-2.5 tabular-nums">{fmt(r.input_tokens)}</td>
                  <td className="px-5 py-2.5 tabular-nums">{fmt(r.output_tokens)}</td>
                  <td className="px-5 py-2.5 tabular-nums text-ink-soft">{fmt(Math.round((r.input_tokens + r.output_tokens) / Math.max(1, r.calls)))}</td>
                </tr>
              ))}
            </Table>
          </Panel>
          <p className="text-xs text-ink-faint">
            Multiply by your model's current price per million tokens (Google AI pricing page) to estimate cost.
          </p>
        </>
      )}
    </div>
  );
}
