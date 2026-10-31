import { useState, type ReactNode } from "react";

export function AdminTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A headline number with a label and optional context line. */
export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${tone === "warn" ? "text-amber-700" : "text-ink-faint"}`}>{sub}</p>}
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Single-series daily bar chart. One hue (brand), thin bars with rounded tops,
 * 2px gaps, recessive baseline, and a hover tooltip per bar.
 */
export function DailyBars({ title, data }: { title: string; data: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-soft">{title}</span>
        <span className="text-[13px] tabular-nums text-ink-faint">{total.toLocaleString("en-ZA")} in {data.length} days</span>
      </figcaption>
      <div className="relative mt-4 h-28" onMouseLeave={() => setHover(null)}>
        <div className="flex h-full items-end gap-[2px] border-b border-hairline">
          {data.map((d, i) => (
            <div
              key={d.day}
              className="relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              aria-label={`${label(d.day)}: ${d.value}`}
              role="img"
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-brand-dark" : "bg-brand"}`}
                style={{ height: d.value ? `${Math.max(4, (d.value / max) * 100)}%` : "0%" }}
              />
            </div>
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-xs text-white shadow"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <span className="tabular-nums">{data[hover].value.toLocaleString("en-ZA")}</span> · {label(data[hover].day)}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
        <span>{data[0] && label(data[0].day)}</span>
        <span>{data.length > 0 && label(data[data.length - 1].day)}</span>
      </div>
    </figure>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs uppercase tracking-wider text-ink-faint">
            {head.map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">{children}</tbody>
      </table>
      {empty && <p className="px-5 py-8 text-center text-sm text-ink-faint">Nothing here yet.</p>}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  matched: "bg-green-50 text-green-800",
  ready: "bg-green-50 text-green-800",
  sent: "bg-green-50 text-green-800",
  processing: "bg-brand/[0.08] text-brand",
  matching: "bg-brand/[0.08] text-brand",
  pending: "bg-black/[0.05] text-ink-soft",
  error: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
};

/** Status label with text, never colour alone. */
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? "bg-black/[0.05] text-ink-soft"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** iOS-style switch. */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className={`relative inline-flex shrink-0 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" role="switch" aria-label={label} className="peer sr-only" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="h-[31px] w-[51px] rounded-full bg-black/[0.12] transition peer-checked:bg-[#34c759] peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25" />
      <span className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </label>
  );
}
