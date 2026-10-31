import type { ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-gray-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-brand/20 bg-brand-light text-brand-dark",
    success: "border-green-200 bg-green-50 text-green-800",
  }[kind];
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${styles}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-gray-600">{subtitle}</p>}
    </div>
  );
}
