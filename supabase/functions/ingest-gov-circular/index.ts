// Reads a DPSA Public Service Vacancy Circular PDF into gov_sections and gov_vacancies.
//
// Body: { storage_path: "2026/39.pdf", replace?: true }  start a new circular (file in the "circulars" bucket)
//       { circular_id: 1 }                               continue processing (used by the self-chain)
//
// Step 1 reads the index pages. Step 2 reads each annexure in chunks of
// CHUNK_PAGES pages (plus OVERLAP pages so long posts can be finished), in
// order within an annexure and several annexures at a time. Each invocation
// stops before the time budget and hands off to a fresh one.
import { Buffer } from "node:buffer";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "npm:pdf-lib@1.17.1";
import { adminClient, HttpError, json, requireCron, serve, triggerFunction } from "../_shared/http.ts";
import { generateJson, models } from "../_shared/gemini.ts";
import {
  type ChunkPost,
  chunkSchema,
  type ChunkSection,
  chunkSystem,
  chunkUserText,
  indexSchema,
  indexSystem,
  isChunkResult,
  isCircularIndex,
  PROVINCES,
} from "../_shared/gov-prompts.ts";

const CHUNK_PAGES = 6;
const OVERLAP = 3;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const START_ROUND_BEFORE_MS = 45_000; // a round of Gemini calls can take ~60s
const STALE_RUNNING_MS = 5 * 60_000;

const model = () => Deno.env.get("GEMINI_MODEL_GOV") || models.parse();

interface Chunk {
  id: number;
  seq: number;
  annexure: string;
  annexure_name: string | null;
  sector: string | null;
  first_page: number;
  last_page: number;
  extract_last_page: number;
  status: string;
  attempts: number;
  started_at: string | null;
  last_department: string | null;
}

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

async function loadPdf(path: string): Promise<PDFDocument> {
  const { data, error } = await adminClient().storage.from("circulars").download(path);
  if (error || !data) throw new HttpError(404, `Circular PDF not found at ${path}`);
  return PDFDocument.load(new Uint8Array(await data.arrayBuffer()), { ignoreEncryption: true });
}

/** A new PDF holding printed pages first..last (printed numbers match PDF page numbers). */
async function subPdf(src: PDFDocument, first: number, last: number): Promise<string> {
  const out = await PDFDocument.create();
  const indices = Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i)
    .filter((i) => i < src.getPageCount());
  for (const page of await out.copyPages(src, indices)) out.addPage(page);
  return Buffer.from(await out.save()).toString("base64");
}

/** Link targets per printed page, in the order they appear in the page's annotations. */
function pageLinks(src: PDFDocument, first: number, last: number): Record<number, string[]> {
  const result: Record<number, string[]> = {};
  const pages = src.getPages();
  for (let n = first; n <= last && n <= pages.length; n++) {
    const annots = pages[n - 1].node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) continue;
    for (const ref of annots.asArray()) {
      const annot = src.context.lookup(ref);
      if (!(annot instanceof PDFDict)) continue;
      const action = annot.lookup(PDFName.of("A"));
      const uri = action instanceof PDFDict ? action.lookup(PDFName.of("URI")) : null;
      if (uri instanceof PDFString || uri instanceof PDFHexString) {
        const url = uri.decodeText().trim();
        if (url && !(result[n] ?? []).includes(url)) (result[n] ??= []).push(url);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function normaliseProvince(value: string | null | undefined): string | null {
  if (!value) return null;
  return PROVINCES.find((p) => squash(p) === squash(value)) ?? null;
}

const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.map((s) => s.trim()).filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const validDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

// Titles are printed in capitals. Convert to title case, keeping acronyms.
// "a" is left out on purpose: titles use it as a grade ("Artisan Grade A"), not an article.
const SMALL_WORDS = new Set(["of", "and", "the", "for", "in", "on", "to", "at", "by", "with", "or", "as"]);
const ACRONYMS = new Set([
  "ICT", "IT", "HR", "HRM", "HRD", "SMS", "OHS", "ECD", "SCM", "GIS", "HOD", "DDG", "DG", "CFO", "CEO", "COO", "CIO",
  "PMDS", "IQMS", "EPWP", "SAPS", "NPA", "DPSA", "PA", "HIV", "AIDS", "TB", "EAP", "EHW", "ERP", "SAP", "PERSAL",
  "LOGIS", "BAS", "MEC", "NQF", "IOD", "SITA", "GITO", "PFMA", "SHERQ", "SHE", "QA", "UIF", "ABET", "AET", "TVET",
  "CET", "SETA", "CCTV", "EMS", "PHC", "ICU", "ENT", "MRI", "OSD", "PHP", "SQL", "GRAP", "IFRS", "SA", "RSA", "II",
  "III", "IV", "VIP", "DCS", "DHA", "DEL", "WCED", "GCIS", "GPW", "GTAC", "OCJ", "NSG", "ID", "CRU", "NSF", "NCV",
]);

function titleCase(text: string, force = false): string {
  const letters = text.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8;
  if (!shouting && !force) return text;
  let first = true;
  return text.replace(/[A-Za-z][A-Za-z'’.&]*/g, (word) => {
    const bare = word.replace(/[^A-Za-z&]/g, "");
    const upper = bare.toUpperCase();
    const lower = word.toLowerCase();
    let out: string;
    if (ACRONYMS.has(upper) || (shouting && !/[AEIOUY]/i.test(bare) && bare.length <= 5)) out = word.toUpperCase();
    else if (!first && SMALL_WORDS.has(lower)) out = lower;
    else if (shouting || force) out = lower.charAt(0).toUpperCase() + lower.slice(1);
    else out = word;
    first = false;
    return out;
  });
}

/** "Department Of Home Affairs" -> "Department of Home Affairs". */
const departmentCase = (name: string) =>
  titleCase(name).replace(/\b(Of|And|The|For|In)\b/g, (w, _m, offset) => (offset === 0 ? w : w.toLowerCase()));

/** Tidies titles and department names across a finished circular. */
async function normaliseNames(circularId: number) {
  const db = adminClient();
  const { data: posts } = await db.from("gov_vacancies").select("id, title, department").eq("circular_id", circularId);
  await Promise.all((posts ?? []).map((p) => {
    const title = titleCase(p.title);
    const department = departmentCase(p.department);
    return title !== p.title || department !== p.department
      ? db.from("gov_vacancies").update({ title, department }).eq("id", p.id)
      : null;
  }));
  const { data: sections } = await db.from("gov_sections").select("id, department").eq("circular_id", circularId);
  await Promise.all((sections ?? []).map((s) => {
    const department = departmentCase(s.department);
    return department !== s.department ? db.from("gov_sections").update({ department }).eq("id", s.id) : null;
  }));
}

// ---------------------------------------------------------------------------
// Step 1: index and work plan
// ---------------------------------------------------------------------------

async function startCircular(storagePath: string, replace: boolean): Promise<number> {
  const db = adminClient();
  const pdf = await loadPdf(storagePath);

  const index = await generateJson({
    functionName: "ingest-gov-circular",
    model: model(),
    system: indexSystem,
    parts: [
      { text: "Read the cover and index pages of this circular." },
      { inlineData: { mimeType: "application/pdf", data: await subPdf(pdf, 1, 2) } },
    ],
    schema: indexSchema,
    validate: isCircularIndex,
    temperature: 0,
  });

  const { data: existing } = await db
    .from("gov_circulars")
    .select("id")
    .eq("year", index.year)
    .eq("circular_number", index.circular_number)
    .maybeSingle();
  if (existing) {
    if (!replace) throw new HttpError(409, `Circular ${index.circular_number} of ${index.year} is already loaded.`);
    await db.from("gov_circulars").delete().eq("id", existing.id);
  }

  const { data: circular, error } = await db
    .from("gov_circulars")
    .insert({
      circular_number: index.circular_number,
      year: index.year,
      issued_on: validDate(index.issued_on),
      storage_path: storagePath,
      page_count: pdf.getPageCount(),
      status: "processing",
      amendments: index.amendments.join("\n\n") || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const chunks = [];
  let seq = 0;
  for (const a of index.annexures) {
    const end = Math.min(a.end_page, pdf.getPageCount());
    for (let first = a.start_page; first <= end; first += CHUNK_PAGES) {
      const last = Math.min(first + CHUNK_PAGES - 1, end);
      chunks.push({
        circular_id: circular.id,
        seq: seq++,
        annexure: a.annexure,
        annexure_name: a.name,
        sector: a.sector,
        first_page: first,
        last_page: last,
        extract_last_page: Math.min(last + OVERLAP, end),
      });
    }
  }
  const { error: chunkError } = await db.from("gov_ingest_chunks").insert(chunks);
  if (chunkError) throw chunkError;
  return circular.id;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Inserts a section, or fills only the blank fields of one already saved (never overwrites). */
async function saveSection(circularId: number, annexure: string, sector: string, annexureProvince: string | null, s: ChunkSection) {
  const db = adminClient();
  const row = {
    circular_id: circularId,
    annexure,
    sector,
    province: annexureProvince ?? normaliseProvince(s.province),
    department: s.department,
    applications: clean(s.application_instructions),
    application_url: clean(s.application_url),
    application_email: clean(s.application_email),
    for_attention: clean(s.for_attention),
    closing_date: validDate(s.closing_date),
    closing_time: clean(s.closing_time),
    note: clean(s.note),
    required_documents: dedupe(s.required_documents ?? []),
    start_page: s.start_page,
  };
  const { data: existing } = await db
    .from("gov_sections")
    .select("*")
    .eq("circular_id", circularId)
    .eq("annexure", annexure)
    .eq("department", s.department)
    .maybeSingle();
  if (!existing) {
    const { error } = await db.from("gov_sections").insert(row);
    if (error && error.code !== "23505") throw error;
    return;
  }
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const empty = existing[k] === null || (Array.isArray(existing[k]) && existing[k].length === 0);
    if (empty && v !== null && !(Array.isArray(v) && v.length === 0)) patch[k] = v;
  }
  if (Object.keys(patch).length > 0) await db.from("gov_sections").update(patch).eq("id", existing.id);
}

/**
 * After all chunks: give every post the closing date and application route of its
 * department section (or of a section of the same department in the annexure).
 */
async function inheritFromSections(circularId: number) {
  const db = adminClient();
  const [{ data: sections }, { data: posts }] = await Promise.all([
    db.from("gov_sections").select("*").eq("circular_id", circularId),
    db.from("gov_vacancies")
      .select("id, section_id, department, closing_date, closing_time, application_methods, application_url, application_email, application_instructions, for_attention, required_documents, z83_required")
      .eq("circular_id", circularId),
  ]);
  const byId = new Map((sections ?? []).map((s) => [s.id, s]));
  await Promise.all((posts ?? []).map((p) => {
    const own = p.section_id ? byId.get(p.section_id) : null;
    const siblings = (sections ?? []).filter((s) => own && s.annexure === own.annexure && squash(s.department) === squash(p.department));
    const pick = <K extends string>(k: K) => [own, ...siblings].find((s) => s && s[k] !== null && s[k] !== undefined)?.[k] ?? null;
    const patch: Record<string, unknown> = {};
    if (!p.closing_date && pick("closing_date")) {
      patch.closing_date = pick("closing_date");
      if (!p.closing_time && pick("closing_time")) patch.closing_time = pick("closing_time");
    }
    if (!p.application_url && pick("application_url")) patch.application_url = pick("application_url");
    if (!p.application_email && pick("application_email")) patch.application_email = pick("application_email");
    if (!p.application_instructions && pick("applications")) patch.application_instructions = pick("applications");
    if (!p.for_attention && pick("for_attention")) patch.for_attention = pick("for_attention");
    const documents = dedupe([...(p.required_documents ?? []), ...((pick("required_documents") as string[] | null) ?? [])]);
    if (documents.length !== (p.required_documents ?? []).length) patch.required_documents = documents;
    if (p.application_methods.length === 0) {
      const url = (patch.application_url ?? p.application_url) as string | null;
      const email = (patch.application_email ?? p.application_email) as string | null;
      patch.application_methods = [...(url ? ["online"] : []), ...(email ? ["email"] : [])];
    }
    const text = [patch.application_instructions, p.application_instructions, ...documents].join(" ").toLowerCase();
    if (!p.z83_required && text.includes("z83")) patch.z83_required = true;
    return Object.keys(patch).length ? db.from("gov_vacancies").update(patch).eq("id", p.id) : null;
  }));
}

// ---------------------------------------------------------------------------
// Step 2: one chunk
// ---------------------------------------------------------------------------

function mergeApplication(post: ChunkPost, section: ChunkSection | Record<string, never> | null) {
  const s = (section ?? {}) as Partial<ChunkSection>;
  const methods = post.application_methods?.length ? post.application_methods : (s.application_methods ?? []);
  const documents = dedupe([...(post.required_documents ?? []), ...(s.required_documents ?? [])]);
  const text = [post.application_instructions, post.notes, s.application_instructions, s.note, ...documents]
    .filter(Boolean).join(" ").toLowerCase();
  return {
    application_methods: dedupe(methods),
    application_url: clean(post.application_url) ?? clean(s.application_url),
    application_email: clean(post.application_email) ?? clean(s.application_email),
    application_postal_address: clean(post.application_postal_address) ?? clean(s.application_postal_address),
    application_physical_address: clean(post.application_physical_address) ?? clean(s.application_physical_address),
    application_instructions: clean(post.application_instructions) ?? clean(s.application_instructions),
    for_attention: clean(post.for_attention) ?? clean(s.for_attention),
    closing_date: validDate(post.closing_date) ?? validDate(s.closing_date ?? null),
    closing_time: clean(post.closing_time) ?? clean(s.closing_time),
    required_documents: documents,
    z83_required: text.includes("z83"),
    certified_copies: post.certified_copies !== "not_stated" ? post.certified_copies : (s.certified_copies ?? "not_stated"),
  };
}

async function processChunk(
  pdf: PDFDocument,
  circular: { id: number; circular_number: number; issued_on: string | null },
  chunk: Chunk,
  startDepartment: string | null,
  onlyPosts?: string[], // targeted retry for missing post numbers
) {
  const db = adminClient();
  const result = await generateJson({
    functionName: "ingest-gov-circular",
    model: model(),
    system: chunkSystem,
    parts: [
      {
        text: chunkUserText({
          circularNumber: circular.circular_number,
          issuedOn: circular.issued_on,
          annexure: chunk.annexure,
          annexureName: chunk.annexure_name ?? "",
          sector: chunk.sector ?? "national",
          ownPages: [chunk.first_page, chunk.last_page],
          extractPages: [chunk.first_page, chunk.extract_last_page],
          startDepartment,
          links: pageLinks(pdf, chunk.first_page, chunk.extract_last_page),
        }) + (onlyPosts
          ? `

Only extract these posts: ${onlyPosts.map((n) => `POST ${n}`).join(", ")}. A heading may be the last line of a page. Leave out any of them that are not in these pages.`
          : ""),
      },
      { inlineData: { mimeType: "application/pdf", data: await subPdf(pdf, chunk.first_page, chunk.extract_last_page) } },
    ],
    schema: chunkSchema,
    validate: isChunkResult,
    temperature: 0,
    maxOutputTokens: 32_000,
  });

  const sector = chunk.sector === "provincial" ? "provincial" : "national";
  const annexureProvince = sector === "provincial" ? normaliseProvince(chunk.annexure_name) : null;

  // Department sections that start in this chunk. A real header carries its own
  // applications, closing date or note; anything else is the model naming a department.
  const ownSections = onlyPosts ? [] : result.sections
    .filter((s) => s.start_page >= chunk.first_page && s.start_page <= chunk.last_page)
    .filter((s) => clean(s.application_instructions) || validDate(s.closing_date) || clean(s.note))
    .map((s) => ({ ...s, department: departmentCase(s.department.trim()) }));
  for (const s of ownSections) await saveSection(circular.id, chunk.annexure, sector, annexureProvince, s);

  // Sections known so far in this annexure, to merge into posts.
  const { data: sectionRows } = await db
    .from("gov_sections")
    .select("id, department, start_page")
    .eq("circular_id", circular.id)
    .eq("annexure", chunk.annexure)
    .order("start_page");
  const sectionsByName = new Map((sectionRows ?? []).map((r) => [squash(r.department), r]));
  const fullSections = new Map(
    [...ownSections, ...result.sections.filter((s) => validDate(s.closing_date) || clean(s.application_instructions))]
      .map((s) => [squash(s.department), s] as const),
  );

  // A heading printed at the foot of the last page is often reported as the next page, where
  // its content is. Allow one page of slack; the overlap pages still hold the whole post, and
  // duplicates from the next chunk are ignored on insert.
  const prefix = `${circular.circular_number}/`;
  const posts = result.posts.filter((p) => {
    const n = p.post_number.trim();
    if (onlyPosts) return onlyPosts.includes(n);
    return n.startsWith(prefix) && p.page >= chunk.first_page && p.page <= chunk.last_page + 1;
  });

  const rows = await Promise.all(posts.map(async (p) => {
    const key = squash(p.department);
    let section = sectionsByName.get(key) ??
      [...(sectionRows ?? [])].reverse().find((r) => (r.start_page ?? 0) <= p.page) ?? null;
    let sectionDetail: ChunkSection | null = fullSections.get(key) ?? null;
    if (section && !sectionDetail) {
      const { data } = await db.from("gov_sections").select("*").eq("id", section.id).single();
      sectionDetail = data
        ? {
          department: data.department, province: data.province, start_page: data.start_page, note: data.note,
          application_methods: [], application_url: data.application_url, application_email: data.application_email,
          application_postal_address: null, application_physical_address: null,
          application_instructions: data.applications, for_attention: data.for_attention,
          closing_date: data.closing_date, closing_time: data.closing_time, required_documents: data.required_documents,
          certified_copies: "not_stated",
        }
        : null;
    }
    if (!section && sectionRows?.length) section = sectionRows[sectionRows.length - 1];
    const merged = mergeApplication(p, sectionDetail);
    // Section-level methods are not stored on gov_sections, so infer from its fields when the post has none.
    if (merged.application_methods.length === 0) {
      if (merged.application_url) merged.application_methods.push("online");
      if (merged.application_email) merged.application_methods.push("email");
      if (merged.application_postal_address) merged.application_methods.push("post");
      if (merged.application_physical_address) merged.application_methods.push("hand_delivery");
    }
    const seq = Number(p.post_number.trim().split("/")[1]);
    return {
      circular_id: circular.id,
      section_id: section?.id ?? null,
      post_number: p.post_number.trim(),
      post_seq: Number.isFinite(seq) ? seq : 0,
      title: p.title.trim(),
      reference_numbers: dedupe([...p.reference_numbers, ...p.centres.map((c) => c.reference ?? "")]),
      department: (sectionDetail?.department ?? p.department).trim(),
      sector,
      province: annexureProvince ?? normaliseProvince(p.province) ?? normaliseProvince(sectionDetail?.province),
      directorate: clean(p.directorate),
      centres: p.centres.filter((c) => c.centre?.trim()),
      num_posts: Math.max(1, p.num_posts || 1),
      employment_type: p.employment_type,
      contract_duration: clean(p.contract_duration),
      is_readvertisement: p.is_readvertisement,
      salary_text: clean(p.salary_text),
      salary_min: p.salary_min,
      salary_max: p.salary_max ?? p.salary_min,
      salary_level: p.salary_level,
      all_inclusive: p.all_inclusive,
      qualification_level: p.qualification_level,
      min_years_experience: p.min_years_experience,
      drivers_licence_required: p.drivers_licence_required,
      requirements: clean(p.requirements),
      duties: clean(p.duties),
      enquiries: clean(p.enquiries),
      notes: clean(p.notes),
      source_page: p.page,
      ...merged,
    };
  }));

  if (rows.length > 0) {
    const { error } = await db
      .from("gov_vacancies")
      .upsert(rows, { onConflict: "circular_id,post_number", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { lastDepartment: result.last_department ?? startDepartment, posts: rows.length };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/** Retries each missing post number on the pages between its neighbours. */
/** Retries runs of missing post numbers on the pages between their neighbours. */
async function fillGaps(pdf: PDFDocument, circular: { id: number; circular_number: number; issued_on: string | null }) {
  const db = adminClient();
  const { data: posts } = await db.from("gov_vacancies").select("post_seq, source_page").eq("circular_id", circular.id);
  const pageOf = new Map((posts ?? []).map((p) => [p.post_seq, p.source_page as number]));
  const max = Math.max(0, ...pageOf.keys());
  const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !pageOf.has(n));

  // Group consecutive numbers: [174..190], [304..307], ...
  const runs: number[][] = [];
  for (const n of missing) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === n - 1) last.push(n);
    else runs.push([n]);
  }

  const { data: chunks } = await db.from("gov_ingest_chunks").select("*").eq("circular_id", circular.id).order("seq");
  await Promise.all(runs.slice(0, 8).map(async (run) => {
    const from = pageOf.get(run[0] - 1) ?? 3;
    const to = pageOf.get(run[run.length - 1] + 1) ?? from + 2;
    const home = ((chunks ?? []) as Chunk[]).find((c) => c.first_page <= from && from <= c.last_page);
    if (!home || to < from || to - from > 14) return;
    const pseudo: Chunk = { ...home, first_page: from, last_page: to, extract_last_page: Math.min(to + 1, pdf.getPageCount()) };
    const numbers = run.map((n) => `${circular.circular_number}/${String(n).padStart(2, "0")}`);
    try {
      await processChunk(pdf, circular, pseudo, home.last_department, numbers);
    } catch (err) {
      console.error(`gap fill for posts ${numbers.join(",")} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));
}

async function finish(circularId: number, pdf: PDFDocument, circular: { id: number; circular_number: number; issued_on: string | null }) {
  const db = adminClient();
  await fillGaps(pdf, circular);
  await normaliseNames(circularId);
  await inheritFromSections(circularId);
  const [{ data: posts }, { data: failed }] = await Promise.all([
    db.from("gov_vacancies").select("post_seq").eq("circular_id", circularId),
    db.from("gov_ingest_chunks").select("first_page, last_page, error").eq("circular_id", circularId).eq("status", "failed"),
  ]);
  const seqs = new Set((posts ?? []).map((p) => p.post_seq));
  const max = Math.max(0, ...seqs);
  const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !seqs.has(n));
  await db.from("gov_circulars").update({
    status: "ready",
    published: true,
    processed_at: new Date().toISOString(),
    missing_post_numbers: missing,
    error: failed?.length
      ? `Failed pages: ${failed.map((f) => `${f.first_page}-${f.last_page}`).join(", ")}`
      : null,
  }).eq("id", circularId);
  return { posts: seqs.size, missing };
}

serve(async (req) => {
  requireCron(req);
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  let circularId: number;
  if (typeof body.storage_path === "string") {
    circularId = await startCircular(body.storage_path, body.replace === true);
  } else if (Number.isInteger(body.circular_id)) {
    circularId = body.circular_id;
    // Re-run chosen chunks (by their first page), e.g. after a prompt fix.
    if (Array.isArray(body.rerun_pages) && body.rerun_pages.length > 0) {
      await db.from("gov_ingest_chunks")
        .update({ status: "pending", attempts: 0, error: null, started_at: null })
        .eq("circular_id", circularId)
        .in("first_page", body.rerun_pages);
      await db.from("gov_circulars").update({ status: "processing" }).eq("id", circularId);
    }
  } else {
    throw new HttpError(400, "Send storage_path to start or circular_id to continue.");
  }

  const { data: circular, error } = await db
    .from("gov_circulars")
    .select("id, circular_number, issued_on, storage_path, status")
    .eq("id", circularId)
    .single();
  if (error || !circular) throw new HttpError(404, "Circular not found.");
  if (circular.status !== "processing") return json({ circular_id: circularId, status: circular.status });

  const pdf = await loadPdf(circular.storage_path);
  let processed = 0;
  let failures = 0;

  while (Date.now() - started < START_ROUND_BEFORE_MS) {
    const { data: all } = await db
      .from("gov_ingest_chunks")
      .select("*")
      .eq("circular_id", circularId)
      .order("seq");
    const chunks = (all ?? []) as Chunk[];
    const stale = (c: Chunk) => c.status === "running" && (!c.started_at || Date.now() - new Date(c.started_at).getTime() > STALE_RUNNING_MS);
    const open = (c: Chunk) => (c.status === "pending" || (c.status === "failed" && c.attempts < MAX_ATTEMPTS) || stale(c));

    // A chunk is ready when the previous chunk of the same annexure has finished (done, or out of retries).
    const ready = chunks.filter((c, i) => {
      if (!open(c)) return false;
      const prev = chunks[i - 1];
      return !prev || prev.annexure !== c.annexure || prev.status === "done" ||
        (prev.status === "failed" && prev.attempts >= MAX_ATTEMPTS);
    }).slice(0, CONCURRENCY);

    if (ready.length === 0) {
      const busy = chunks.some((c) => c.status === "running" && !stale(c)) || chunks.some(open);
      if (busy) break; // another worker is on it, or we are waiting on a chunk in flight
      const summary = await finish(circularId, pdf, circular);
      return json({ circular_id: circularId, status: "ready", ...summary });
    }

    await Promise.all(ready.map(async (c) => {
      await db.from("gov_ingest_chunks").update({
        status: "running",
        attempts: c.attempts + 1,
        started_at: new Date().toISOString(),
      }).eq("id", c.id);
      const prev = chunks.find((x) => x.seq === c.seq - 1 && x.annexure === c.annexure);
      try {
        const out = await processChunk(pdf, circular, c, prev?.last_department ?? null);
        await db.from("gov_ingest_chunks").update({
          status: "done",
          start_department: prev?.last_department ?? null,
          last_department: out.lastDepartment,
          error: null,
        }).eq("id", c.id);
        processed++;
      } catch (err) {
        failures++;
        await db.from("gov_ingest_chunks").update({
          status: "failed",
          error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        }).eq("id", c.id);
      }
    }));
  }

  triggerFunction("ingest-gov-circular", { circular_id: circularId });
  return json({ circular_id: circularId, status: "processing", processed, failures });
});
