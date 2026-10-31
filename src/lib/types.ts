export type Seniority = "entry" | "junior" | "mid" | "senior" | "lead" | "executive";
export const SENIORITY: Seniority[] = ["entry", "junior", "mid", "senior", "lead", "executive"];

export type OnboardingStatus = "new" | "cv_uploaded" | "profile_ready" | "matching" | "matched" | "error";

export interface Education {
  qualification: string;
  institution: string | null;
  year_completed: number | null;
  nqf_level: number | null;
}

export interface ParsedProfile {
  is_cv: boolean;
  full_name: string | null;
  headline: string | null;
  location: { city: string | null; province: string | null };
  total_years_experience: number;
  experience_confidence: "high" | "medium" | "low";
  seniority_level: Seniority;
  skills: string[];
  tools: string[];
  soft_skills: string[];
  job_titles_held: string[];
  industries: string[];
  education: Education[];
  certifications: string[];
  licences: string[];
  languages: string[];
  suggested_target_roles: string[];
  profile_text: string;
}

export interface Preferences {
  target_roles: string[];
  provinces: string[];
  cities: string[];
  remote_ok: boolean;
  min_salary_zar: number | null;
  job_types: string[];
  aiming_seniority: Seniority | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  contact_email: string | null;
  contact_email_verified_at: string | null;
  whatsapp_number: string | null;
  notify_email: boolean;
  notify_whatsapp: boolean;
  cv_path: string | null;
  parsed_profile: ParsedProfile | null;
  preferences: Partial<Preferences>;
  onboarding_status: OnboardingStatus;
  last_matched_at: string | null;
  notifications_paused: boolean;
}

/** A row of the my_matches view. There is deliberately no score. */
export interface Match {
  id: number;
  reason: string;
  viewed_at: string | null;
  created_at: string;
  title: string;
  company: string | null;
  location_display: string | null;
  salary_min_monthly: number | null;
  salary_max_monthly: number | null;
  salary_is_predicted: boolean;
  contract_type: string | null;
  contract_time: string | null;
  redirect_url: string;
  posted_at: string | null;
}

export const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

export const JOB_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
];

export const PROFILE_FIELDS =
  "id, full_name, contact_email, contact_email_verified_at, whatsapp_number, notify_email, notify_whatsapp, cv_path, parsed_profile, preferences, onboarding_status, last_matched_at, notifications_paused";

/** Where a signed-in user belongs, based on onboarding progress. */
export function homeFor(status: OnboardingStatus | undefined): string {
  switch (status) {
    case "matched":
      return "/matches";
    case "matching":
    case "error":
      return "/matching";
    default:
      return "/onboarding";
  }
}

export const isValidWhatsApp = (n: string) => /^\+[1-9][0-9]{7,14}$/.test(n);

/** Accepts 082 123 4567 or +27 82 123 4567 and returns +27821234567. */
export function normaliseSaNumber(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`;
  return digits;
}

export function formatSalary(m: Pick<Match, "salary_min_monthly" | "salary_max_monthly" | "salary_is_predicted">) {
  const fmt = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
  const { salary_min_monthly: lo, salary_max_monthly: hi } = m;
  if (!lo && !hi) return null;
  const range = lo && hi && lo !== hi ? `${fmt(lo)} – ${fmt(hi)}` : fmt((lo ?? hi)!);
  return `${range} per month${m.salary_is_predicted ? " (estimate)" : ""}`;
}
