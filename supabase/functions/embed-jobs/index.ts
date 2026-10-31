// Embeds jobs that have no embedding yet, in batches.
// Body: { then?: "match" }  - when all jobs are embedded, trigger match-all-users.
import { adminClient, json, requireCron, serve, TIME_BUDGET_MS, triggerFunction } from "../_shared/http.ts";
import { embedTexts, toVector } from "../_shared/gemini.ts";
import { jobEmbeddingText, type JobRow } from "../_shared/prompts.ts";

const BATCH = 50;

serve(async (req) => {
  requireCron(req);
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const db = adminClient();
  let embedded = 0;
  let remaining = true;

  while (Date.now() - started < TIME_BUDGET_MS - 20_000) {
    const { data: jobs, error } = await db
      .from("jobs")
      .select("id, title, company, city, province, contract_time, contract_type, category_label, description, enrichment")
      .is("embedding", null)
      .order("id")
      .limit(BATCH);
    if (error) throw error;
    if (!jobs || jobs.length === 0) {
      remaining = false;
      break;
    }

    const vectors = await embedTexts(jobs.map((j) => jobEmbeddingText(j as JobRow)), "RETRIEVAL_DOCUMENT", "embed-jobs");
    const results = await Promise.all(
      jobs.map((j, i) => db.from("jobs").update({ embedding: toVector(vectors[i]) }).eq("id", j.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    embedded += jobs.length;
  }

  if (remaining) {
    triggerFunction("embed-jobs", body);
  } else if (body.then === "match") {
    triggerFunction("match-all-users", {});
  }

  return json({ embedded, remaining });
});
