import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useIsAdmin } from "../lib/admin";
import { Icon, type IconName } from "../components/Icon";
import { Spinner } from "../components/ui";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/admin", label: "Overview", icon: "sparkles", end: true },
  { to: "/admin/users", label: "Users", icon: "users" },
  { to: "/admin/jobs", label: "Jobs & emails", icon: "briefcase" },
  { to: "/admin/government", label: "Government", icon: "building" },
  { to: "/admin/usage", label: "AI usage", icon: "sliders" },
];

/** Admin shell: guards access and shows the section navigation. */
export function AdminLayout() {
  const { session, loading, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading || (session && isAdmin === undefined)) return <Spinner label="Checking access" />;
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-[22px] font-semibold text-ink">This area is for admins</h1>
        <p className="mt-2 text-ink-soft">Your account doesn't have admin access.</p>
        <Link to="/" className="btn-secondary mt-6">Back to Tumbo</Link>
      </div>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-medium transition ${
      isActive ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:bg-black/[0.04] hover:text-ink"
    }`;

  return (
    <div className="min-h-screen">
      <div className="brand-gradient h-[3px]" aria-hidden="true" />
      <header className="glass sticky top-0 z-30 border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/admin" className="flex items-center gap-2">
            <img src="/logo.png" alt="Tumbo" className="h-7 w-auto" width={112} height={28} />
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">Admin</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/" className="btn-ghost py-1.5 text-sm">Open app</Link>
            <button
              type="button"
              className="btn-ghost py-1.5 text-sm"
              onClick={async () => {
                await signOut();
                navigate("/admin/login", { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-16 pt-6">
        <nav className="sticky top-20 hidden h-fit w-52 shrink-0 space-y-1 md:block" aria-label="Admin sections">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              <Icon name={n.icon} className="h-[18px] w-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:hidden" aria-label="Admin sections">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={(s) => `${linkClass(s)} shrink-0`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
