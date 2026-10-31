import { Link, useSearchParams } from "react-router-dom";

export function Paused() {
  const [params] = useSearchParams();
  const invalid = params.get("status") === "invalid";

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="text-xl font-semibold">{invalid ? "That link didn't work" : "Notifications paused"}</h1>
      <p className="mt-3 text-gray-600">
        {invalid
          ? "You can pause notifications from Settings instead."
          : "We won't send you any more job alerts. Your matches are still saved, and you can turn alerts back on in Settings."}
      </p>
      <Link to="/settings" className="btn-primary mt-6">Go to Settings</Link>
    </div>
  );
}
