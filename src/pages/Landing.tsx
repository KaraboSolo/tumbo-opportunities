import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { homeFor } from "../lib/types";

export function Landing() {
  const { session, profile, loading } = useAuth();
  if (!loading && session && profile) return <Navigate to={homeFor(profile.onboarding_status)} replace />;

  return (
    <section className="py-10 text-center sm:py-16">
      <h1 className="mx-auto max-w-xl text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Jobs that genuinely fit you, sent to you.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-gray-600">
        Upload your CV once. We read it, search thousands of fresh South African jobs every day, and show you only
        the ones worth your time, with a short note on why each one suits you.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to="/signup" className="btn-primary px-8 py-3 text-base">Get started</Link>
        <Link to="/login" className="text-sm text-gray-600 underline">I already have an account</Link>
      </div>
      <ol className="mx-auto mt-14 grid max-w-2xl gap-4 text-left sm:grid-cols-3">
        {[
          ["Upload your CV", "PDF or Word. Takes a minute."],
          ["Check your profile", "Confirm your skills and what you're looking for."],
          ["Get your matches", "Now, and by email whenever new ones come in."],
        ].map(([title, text], i) => (
          <li key={title} className="card">
            <span className="text-sm font-semibold text-brand">Step {i + 1}</span>
            <p className="mt-1 font-semibold">{title}</p>
            <p className="text-sm text-gray-600">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
