// Saves the user's reviewed profile and preferences, then embeds the profile.
// Body: { parsed_profile, preferences }
import { adminClient, HttpError, json, requireUser, serve } from "../_shared/http.ts";
import { embedTexts, toVector } from "../_shared/gemini.ts";
import {
  type Education,
  type ParsedProfile,
  type Preferences,
  profileEmbeddingText,
  SENIORITY,
  type Seniority,
} from "../_shared/prompts.ts";

// Clean user-edited input: trim, dedupe, bound sizes.
const text = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const list = (v: unknown, maxItems = 40, maxLen = 80): string[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const s = text(item, maxLen);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.slice(0, maxItems);
};

const seniority = (v: unknown): Seniority | null =>
  (SENIORITY as readonly string[]).includes(v as string) ? (v as Seniority) : null;

const intOrNull = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : null);

function cleanProfile(p: Record<string, unknown>): ParsedProfile {
  const loc = (p.location ?? {}) as Record<string, unknown>;
  const years = Number(p.total_years_experience);
  return {
    is_cv: true,
    full_name: text(p.full_name),
    headline: text(p.headline),
    location: { city: text(loc.city, 80), province: text(loc.province, 80) },
    total_years_experience: Number.isFinite(years) ? Math.min(Math.max(years, 0), 60) : 0,
    experience_confidence: ["high", "medium", "low"].includes(p.experience_confidence as string)
      ? (p.experience_confidence as ParsedProfile["experience_confidence"])
      : "medium",
    seniority_level: seniority(p.seniority_level) ?? "entry",
    skills: list(p.skills),
    tools: list(p.tools),
    soft_skills: list(p.soft_skills),
    job_titles_held: list(p.job_titles_held),
    industries: list(p.industries),
    education: (Array.isArray(p.education) ? p.education : []).slice(0, 15).flatMap((e: Record<string, unknown>) => {
      const qualification = text(e?.qualification);
      return qualification
        ? [{
          qualification,
          institution: text(e.institution),
          year_completed: intOrNull(e.year_completed),
          nqf_level: intOrNull(e.nqf_level),
        } satisfies Education]
        : [];
    }),
    certifications: list(p.certifications),
    licences: list(p.licences, 10),
    languages: list(p.languages, 15),
    suggested_target_roles: list(p.suggested_target_roles, 6),
    profile_text: text(p.profile_text, 1500) ?? "",
  };
}

const JOB_TYPES = ["full_time", "part_time", "permanent", "contract"];

function cleanPreferences(p: Record<string, unknown>): Preferences {
  const salary = Number(p.min_salary_zar);
  return {
    target_roles: list(p.target_roles, 10),
    provinces: list(p.provinces, 9),
    cities: list(p.cities, 10),
    remote_ok: p.remote_ok === true,
    min_salary_zar: Number.isFinite(salary) && salary > 0 ? Math.round(salary) : null,
    job_types: list(p.job_types, 4).filter((t) => JOB_TYPES.includes(t)),
    aiming_seniority: seniority(p.aiming_seniority),
  };
}

serve(async (req) => {
  const userId = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  if (!body.parsed_profile || typeof body.parsed_profile !== "object") {
    throw new HttpError(400, "Your profile is missing. Please upload your CV again.");
  }
  const profile = cleanProfile(body.parsed_profile);
  const preferences = cleanPreferences(body.preferences ?? {});
  if (preferences.target_roles.length === 0) throw new HttpError(400, "Please add at least one role you'd like.");

  const [vector] = await embedTexts([profileEmbeddingText(profile, preferences)], "RETRIEVAL_QUERY", "save-profile", userId);

  const { error } = await adminClient()
    .from("profiles")
    .update({ parsed_profile: profile, preferences, embedding: toVector(vector) })
    .eq("id", userId);
  if (error) throw error;

  return json({ ok: true });
});
