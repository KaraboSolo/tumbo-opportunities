import type { ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-soft" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-brand" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "bg-red-50 text-red-800",
    info: "bg-brand-light text-brand-dark",
    success: "bg-green-50 text-green-800",
  }[kind];
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${styles}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, eyebrow }: { title: string; subtitle?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 animate-rise">
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <h1 className="large-title">{title}</h1>
      {subtitle && <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">{subtitle}</p>}
    </div>
  );
}

/** Relative date like "Today", "2 days ago". */
export function ago(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}
