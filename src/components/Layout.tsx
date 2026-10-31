import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Icon, type IconName } from "./Icon";

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "/matches", label: "My matches", icon: "sparkles" },
  { to: "/explore", label: "Explore", icon: "search" },
  { to: "/settings", label: "Settings", icon: "gear" },
];

export function Layout() {
  const { session, profile } = useAuth();
  const { pathname } = useLocation();
  const onboarded = profile?.onboarding_status === "matched";
  const showTabs = !!session && onboarded;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="brand-gradient h-[3px]" aria-hidden="true" />
      <header className="glass sticky top-0 z-30 border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link to={session ? (onboarded ? "/matches" : "/onboarding") : "/"} aria-label="Tumbo home" className="shrink-0">
            <img src="/logo.png" alt="Tumbo" className="h-7 w-auto" width={112} height={28} />
          </Link>

          {showTabs && (
            <nav className="segmented hidden sm:inline-flex" aria-label="Sections">
              {TABS.slice(0, 2).map((t) => (
                <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? "active" : "hover:text-ink")}>
                  {t.label}
                </NavLink>
              ))}
            </nav>
          )}

          {session ? (
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                `hidden h-9 w-9 items-center justify-center rounded-full transition sm:flex ${
                  isActive ? "bg-black/[0.06] text-ink" : "text-ink-soft hover:bg-black/[0.04] hover:text-ink"
                } ${showTabs ? "" : "!flex"}`}
            >
              <Icon name="gear" />
            </NavLink>
          ) : (
            pathname !== "/login" && <Link to="/login" className="btn-ghost py-1.5 text-sm">Log in</Link>
          )}
        </div>
      </header>

      <main className={`mx-auto w-full max-w-3xl flex-1 px-4 pt-8 ${showTabs ? "pb-28 sm:pb-12" : "pb-12"}`}>
        <Outlet />
      </main>

      <footer className={`border-t border-hairline ${showTabs ? "mb-20 sm:mb-0" : ""}`}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-ink-faint">
          <span>
            Jobs powered by{" "}
            <a href="https://www.adzuna.co.za" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
              Adzuna
            </a>
          </span>
          <Link to="/privacy" className="hover:text-ink">Privacy policy</Link>
        </div>
      </footer>

      {showTabs && (
        <nav
          className="glass fixed inset-x-0 bottom-0 z-30 border-t border-hairline pb-[env(safe-area-inset-bottom)] sm:hidden"
          aria-label="Sections"
        >
          <div className="mx-auto grid max-w-md grid-cols-3">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                    isActive ? "text-brand" : "text-ink-faint"
                  }`}
              >
                <Icon name={t.icon} className="h-6 w-6" />
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
