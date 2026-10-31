// Types and helpers for government vacancies (DPSA Public Service Vacancy Circular).

export const Z83_URL =
  "https://www.dpsa.gov.za/dpsa2g/documents/vacancies/editable%20Approved%20New%20Z83%20form%20Gazetted%206%20Nov%202020.pdf";
export const DPSA_CIRCULARS_URL = "https://www.dpsa.gov.za/newsroom/psvc/";

export interface Centre {
  centre: string;
  reference: string | null;
}

export interface GovVacancySummary {
  id: number;
  post_number: string;
  title: string;
  department: string;
  sector: "national" | "provincial";
  province: string | null;
  centres: Centre[];
  num_posts: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_level: number | null;
  all_inclusive: boolean;
  employment_type: string | null;
  closing_date: string | null;
  reference_numbers: string[];
  application_methods: string[];
  total_count: number;
}

export interface GovVacancy extends Omit<GovVacancySummary, "total_count"> {
  circular_id: number;
  section_id: number | null;
  directorate: string | null;
  contract_duration: string | null;
  is_readvertisement: boolean;
  salary_text: string | null;
  qualification_level: string | null;
  min_years_experience: number | null;
  drivers_licence_required: boolean;
  requirements: string | null;
  duties: string | null;
  enquiries: string | null;
  application_url: string | null;
  application_email: string | null;
  application_postal_address: string | null;
  application_physical_address: string | null;
  application_instructions: string | null;
  for_attention: string | null;
  closing_time: string | null;
  required_documents: string[];
  z83_required: boolean;
  certified_copies: "with_application" | "shortlisted_only" | "not_stated";
  notes: string | null;
  source_page: number | null;
}

export const LEVEL_BANDS = [
  { value: "1-5", label: "Entry (levels 1–5)" },
  { value: "6-8", label: "Levels 6–8" },
  { value: "9-10", label: "Levels 9–10" },
  { value: "11-12", label: "Middle management (11–12)" },
  { value: "13-16", label: "Senior management (13–16)" },
];

export const QUALIFICATIONS = [
  { value: "none", label: "No matric needed" },
  { value: "grade_12", label: "Matric / Grade 12" },
  { value: "certificate", label: "Certificate" },
  { value: "diploma", label: "Diploma" },
  { value: "degree", label: "Degree" },
  { value: "postgraduate", label: "Postgraduate" },
];

export const SORTS = [
  { value: "closing_soon", label: "Closing soonest" },
  { value: "salary_high", label: "Highest salary" },
  { value: "salary_low", label: "Lowest salary" },
  { value: "newest", label: "Newest circular" },
  { value: "title", label: "Title A–Z" },
  { value: "relevance", label: "Best match to search" },
];

const EMPLOYMENT: Record<string, string> = {
  permanent: "Permanent",
  contract: "Contract",
  internship: "Internship",
  learnership: "Learnership",
  other: "Other",
};
export const employmentLabel = (t: string | null) => (t ? EMPLOYMENT[t] ?? t : null);

export const qualificationLabel = (q: string | null) => QUALIFICATIONS.find((x) => x.value === q)?.label ?? null;

const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;

/** "R237 453 per year" or a range. */
export function annualSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  const range = min && max && min !== max ? `${rand(min)} – ${rand(max)}` : rand((min ?? max)!);
  return `${range} per year`;
}

/** About-per-month figure for orientation. */
export function monthlySalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  const lo = min ? min / 12 : null;
  const hi = max ? max / 12 : null;
  return lo && hi && Math.round(lo) !== Math.round(hi) ? `≈ ${rand(lo)} – ${rand(hi)} a month` : `≈ ${rand((lo ?? hi)!)} a month`;
}

/** Whole days from today to the closing date (negative when closed). */
export function daysLeft(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

export function formatDate(date: string | null, withYear = false): string | null {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function closingLabel(date: string | null): { text: string; tone: "urgent" | "soon" | "normal" | "closed" } | null {
  const d = daysLeft(date);
  if (d === null) return null;
  if (d < 0) return { text: "Closed", tone: "closed" };
  if (d === 0) return { text: "Closes today", tone: "urgent" };
  if (d === 1) return { text: "Closes tomorrow", tone: "urgent" };
  if (d <= 3) return { text: `Closes in ${d} days`, tone: "urgent" };
  if (d <= 7) return { text: `Closes in ${d} days`, tone: "soon" };
  return { text: `Closes ${formatDate(date)}`, tone: "normal" };
}

export function centreSummary(centres: Centre[], province: string | null): string | null {
  if (centres.length === 0) return province;
  const first = centres[0].centre;
  return centres.length > 1 ? `${first} + ${centres.length - 1} more` : first;
}
