// Runs matching for every matched user who has new jobs, 5 at a time.
// A failure for one user is logged and skipped. When done, triggers send-notifications.
// Body: { skip?: string[] } - users that already failed in this chain.
import { adminClient, json, requireCron, serve, TIME_BUDGET_MS, triggerFunction } from "../_shared/http.ts";
import { matchUser } from "../_shared/matching.ts";

const CONCURRENCY = 5;

serve(async (req) => {
  requireCron(req);
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const skip: string[] = Array.isArray(body.skip) ? body.skip : [];
  const db = adminClient();

  const { data, error } = await db.rpc("users_due_for_matching", { p_exclude: skip });
  if (error) throw error;
  const queue: string[] = (data ?? []).map((r: { user_id: string }) => r.user_id);

  let processed = 0, failed = 0;
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS - 45_000;

  async function worker() {
    while (queue.length > 0 && !outOfTime()) {
      const userId = queue.shift()!;
      try {
        await matchUser(userId, { onlyNew: true, source: "daily" });
        processed++;
      } catch (err) {
        failed++;
        skip.push(userId);
        console.error(`match failed for a user: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (queue.length > 0) {
    triggerFunction("match-all-users", { skip });
  } else {
    triggerFunction("send-notifications", {});
  }

  return json({ processed, failed, remaining: queue.length });
});
