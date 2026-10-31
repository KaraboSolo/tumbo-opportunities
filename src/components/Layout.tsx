import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const onboarded = profile?.onboarding_status === "matched";

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-1 text-sm ${isActive ? "font-semibold text-brand" : "text-gray-600 hover:text-gray-900"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="brand-gradient h-1" aria-hidden="true" />
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link to={session ? "/matches" : "/"} aria-label="Tumbo home">
            <img src="/logo.png" alt="Tumbo" className="h-8 w-auto" width={128} height={32} />
          </Link>
          {session ? (
            <nav className="flex items-center gap-1">
              {onboarded && <NavLink to="/matches" className={navClass}>My matches</NavLink>}
              <NavLink to="/settings" className={navClass}>Settings</NavLink>
              <button
                type="button"
                className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </nav>
          ) : (
            <nav className="flex items-center gap-1">
              <NavLink to="/login" className={navClass}>Log in</NavLink>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-gray-500">
          <span>
            Jobs powered by{" "}
            <a href="https://www.adzuna.co.za" target="_blank" rel="noopener noreferrer" className="underline">
              Adzuna
            </a>
          </span>
          <Link to="/privacy" className="underline">Privacy policy</Link>
        </div>
      </footer>
    </div>
  );
}
