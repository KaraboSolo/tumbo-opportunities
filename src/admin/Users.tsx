import { useEffect, useRef, useState } from "react";
import { adminRpc, fmt, when } from "../lib/admin";
import { Icon } from "../components/Icon";
import { Alert, Spinner } from "../components/ui";
import { AdminTitle, Panel, StatusPill, Table } from "./ui";

interface AdminUser {
  id: string;
  full_name: string | null;
  login_email: string;
  contact_email: string | null;
  email_confirmed: boolean;
  whatsapp_number: string | null;
  onboarding_status: string;
  notify_email: boolean;
  notifications_paused: boolean;
  headline: string | null;
  target_roles: string | null;
  matches: number;
  new_matches: number;
  created_at: string;
  last_matched_at: string | null;
  is_admin: boolean;
  total_count: number;
}

const STATUSES = ["new", "cv_uploaded", "profile_ready", "matching", "matched", "error"];
const PAGE = 50;

export function Users() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  async function load(offset: number) {
    const id = ++req.current;
    try {
      const data = await adminRpc<AdminUser[]>("admin_users", {
        p_search: search.trim(),
        p_status: status || null,
        p_limit: PAGE,
        p_offset: offset,
      });
      if (id !== req.current) return;
      setRows((prev) => (offset === 0 ? data : [...(prev ?? []), ...data]));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(0), search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const total = rows?.[0]?.total_count ?? 0;

  return (
    <div className="animate-rise">
      <AdminTitle title="Users" subtitle={rows ? `${fmt(total)} ${total === 1 ? "person" : "people"}` : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input type="search" placeholder="Name or email" aria-label="Search users" value={search}
            onChange={(e) => setSearch(e.target.value)} className="input rounded-xl py-2.5 pl-10" />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto rounded-xl py-2.5">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}
      {!rows && !error && <Spinner />}
      {rows && (
        <Panel title="People">
          <Table head={["Person", "Looking for", "Status", "Matches", "Alerts", "Joined", "Last matched"]} empty={rows.length === 0}>
            {rows.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-5 py-3">
                  <p className="font-medium text-ink">
                    {u.full_name ?? "No name"}
                    {u.is_admin && <span className="ml-2 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Admin</span>}
                  </p>
                  <p className="text-ink-soft">{u.login_email}</p>
                  {u.contact_email && u.contact_email !== u.login_email && <p className="text-xs text-ink-faint">Alerts to {u.contact_email}</p>}
                  {u.whatsapp_number && <p className="text-xs text-ink-faint">{u.whatsapp_number}</p>}
                </td>
                <td className="max-w-[16rem] px-5 py-3 text-ink-soft">
                  {u.headline && <p className="text-ink">{u.headline}</p>}
                  <p className="text-xs">{u.target_roles ?? "—"}</p>
                </td>
                <td className="px-5 py-3"><StatusPill status={u.onboarding_status} /></td>
                <td className="px-5 py-3 tabular-nums">
                  {fmt(u.matches)}
                  {u.new_matches > 0 && <span className="text-xs text-ink-faint"> · {fmt(u.new_matches)} unopened</span>}
                </td>
                <td className="px-5 py-3 text-xs text-ink-soft">
                  {u.notifications_paused ? "Paused" : u.notify_email ? (u.email_confirmed ? "Email" : "Email (unconfirmed)") : "Off"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{when(u.created_at)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{when(u.last_matched_at)}</td>
              </tr>
            ))}
          </Table>
          {rows.length < total && (
            <div className="mt-4 text-center">
              <button type="button" className="btn-secondary" onClick={() => load(rows.length)}>Show more</button>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
