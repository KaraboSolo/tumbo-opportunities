import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { homeFor } from "../lib/types";
import { Icon, type IconName } from "../components/Icon";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "briefcase", title: "Upload your CV", text: "PDF or Word. It takes a minute." },
  { icon: "check", title: "Check your profile", text: "Confirm your skills and what you're after." },
  { icon: "sparkles", title: "Get your matches", text: "Now, and whenever new ones come in." },
];

export function Landing() {
  const { session, profile, loading } = useAuth();
  if (!loading && session && profile) return <Navigate to={homeFor(profile.onboarding_status)} replace />;

  return (
    <section className="pb-6 pt-8 text-center sm:pt-16">
      <p className="eyebrow animate-rise">Tumbo Opportunities</p>
      <h1
        className="mx-auto mt-3 max-w-2xl animate-rise text-[40px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[56px]"
        style={{ animationDelay: "60ms" }}
      >
        Jobs that genuinely fit you.
      </h1>
      <p
        className="mx-auto mt-5 max-w-md animate-rise text-[19px] leading-relaxed text-ink-soft"
        style={{ animationDelay: "120ms" }}
      >
        Upload your CV once. We search thousands of fresh South African jobs every day and show you only the ones
        worth your time, with a note on why each one suits you.
      </p>
      <div className="mt-9 flex animate-rise flex-col items-center gap-3" style={{ animationDelay: "180ms" }}>
        <Link to="/signup" className="btn-primary px-8 py-3.5 text-[17px]">Get started</Link>
        <Link to="/login" className="btn-ghost text-[15px]">
          I already have an account
          <Icon name="chevronRight" className="h-4 w-4" />
        </Link>
      </div>

      <ol className="mx-auto mt-16 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card animate-rise" style={{ animationDelay: `${260 + i * 70}ms` }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/[0.08] text-brand">
              <Icon name={s.icon} />
            </span>
            <p className="mt-4 text-[17px] font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
