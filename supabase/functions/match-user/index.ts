// Finds matches for one user.
// Browser (user JWT): first onboarding run or a manual re-run (max once per hour).
// Cron (x-cron-secret): body { user_id } - only jobs first seen since the last run.
// The response never contains scores.
import { adminClient, HttpError, isCronCall, json, rateLimit, requireUser, serve } from "../_shared/http.ts";
import { matchUser } from "../_shared/matching.ts";

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  if (isCronCall(req)) {
    if (typeof body.user_id !== "string") throw new HttpError(400, "user_id is required");
    const count = await matchUser(body.user_id, { onlyNew: true, source: "daily" });
    return json({ count });
  }

  const userId = await requireUser(req);
  const { data: profile, error } = await db
    .from("profiles")
    .select("onboarding_status, embedding, updated_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!profile.embedding) throw new HttpError(400, "Please finish your profile first.");
  const stale = Date.now() - new Date(profile.updated_at).getTime() > 5 * 60_000;
  if (profile.onboarding_status === "matching" && !stale) {
    // A run is already in progress (for example after a page refresh). The browser polls status.
    return json({ status: "matching" });
  }
  // A retry after an error does not count against the hourly limit.
  if (profile.onboarding_status !== "error") {
    await rateLimit(userId, "match-user", 1, 3600_000, "You can refresh your matches once an hour. Please try again later.");
  }

  await db.from("profiles").update({ onboarding_status: "matching" }).eq("id", userId);
  try {
    const count = await matchUser(userId, { onlyNew: false, source: "onboarding" });
    return json({ status: "matched", count });
  } catch (err) {
    await db.from("profiles").update({ onboarding_status: "error" }).eq("id", userId);
    throw err;
  }
});
