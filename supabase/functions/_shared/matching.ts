// The matching funnel: SQL candidates -> Gemini rerank -> keep the best -> save.
import { adminClient } from "./http.ts";
import { generateJson, models } from "./gemini.ts";
import { monthlySalary } from "./email.ts";
import { isRerankResponse, rerankSchema, rerankSystem, rerankUserText } from "./prompts.ts";

const MIN_SCORE = Number(Deno.env.get("MATCH_MIN_SCORE") ?? 65);
const MAX_RESULTS = Number(Deno.env.get("MATCH_MAX_RESULTS") ?? 10);
const CANDIDATE_LIMIT = 40;

interface Candidate {
  id: number;
  title: string;
  company: string | null;
  location_display: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_is_predicted: boolean;
  contract_type: string | null;
  contract_time: string | null;
  description: string | null;
  posted_at: string | null;
}

/**
 * Runs the funnel for one user and returns how many matches were saved.
 * source "onboarding" matches are shown on screen and never emailed.
 */
export async function matchUser(userId: string, opts: { onlyNew: boolean; source: "onboarding" | "daily" }) {
  const db = adminClient();
  const startedAt = new Date().toISOString();

  const { data: profile, error } = await db
    .from("profiles")
    .select("parsed_profile, preferences, embedding")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!profile.embedding || !profile.parsed_profile) throw new Error("Profile has no embedding yet");

  const { data: candidates, error: candError } = await db.rpc("candidate_jobs", {
    p_user_id: userId,
    p_limit: CANDIDATE_LIMIT,
    p_only_new: opts.onlyNew,
  });
  if (candError) throw candError;

  let saved = 0;
  const jobs = (candidates ?? []) as Candidate[];
  if (jobs.length > 0) {
    // Short numeric ids for the model, mapped back to real ids below.
    const compact = jobs.map((j, i) => ({
      id: i + 1,
      title: j.title,
      company: j.company ?? "Not stated",
      location: j.location_display ?? "",
      salary: monthlySalary(j.salary_min, j.salary_max, j.salary_is_predicted) ?? "not stated",
      contract: [j.contract_type, j.contract_time].filter(Boolean).join(", ").replace(/_/g, " ") || "not stated",
      posted: j.posted_at?.slice(0, 10) ?? "",
      description: (j.description ?? "").slice(0, 1200),
    }));

    // Never send contact details or the name to the model.
    const { full_name: _name, ...candidate } = profile.parsed_profile;

    const response = await generateJson({
      functionName: "match-user",
      model: models.rerank(),
      system: rerankSystem,
      parts: [{ text: rerankUserText(candidate, profile.preferences, compact) }],
      schema: rerankSchema,
      validate: isRerankResponse,
      temperature: 0.1,
      userId,
    });

    const seen = new Set<number>();
    const rows = response.results
      .filter((r) => r.job_id >= 1 && r.job_id <= jobs.length && !seen.has(r.job_id) && seen.add(r.job_id))
      .filter((r) => r.score >= MIN_SCORE && r.reason.trim() !== "")
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        user_id: userId,
        job_id: jobs[r.job_id - 1].id,
        score: r.score,
        reason: r.reason.trim().slice(0, 220),
        gaps: r.gaps.slice(0, 3),
        source: opts.source,
      }));

    if (rows.length > 0) {
      const { error: insError, count } = await db
        .from("matches")
        .upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true, count: "exact" });
      if (insError) throw insError;
      saved = count ?? rows.length;
    }
  }

  const { error: updError } = await db
    .from("profiles")
    .update({ onboarding_status: "matched", last_matched_at: startedAt })
    .eq("id", userId);
  if (updError) throw updError;

  return saved;
}
