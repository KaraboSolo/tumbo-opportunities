// Parses the user's CV into a structured profile.
// Body: { cv_path: string } (file already uploaded to the "cvs" bucket) or { text: string } (pasted CV).
import { Buffer } from "node:buffer";
import mammoth from "npm:mammoth@1.8.0";
import { adminClient, HttpError, json, rateLimit, requireUser, serve } from "../_shared/http.ts";
import { generateJson, models } from "../_shared/gemini.ts";
import { cvParseSchema, cvParseSystem, cvParseUserText, isParsedProfile } from "../_shared/prompts.ts";

const MAX_TEXT = 30_000;

// Contact details are not needed by the model, so remove them from text CVs.
const stripContacts = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]")
    .replace(/(\+?27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, "[phone removed]");

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

serve(async (req) => {
  const userId = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const cvPath: string | undefined = typeof body.cv_path === "string" ? body.cv_path : undefined;
  const pasted: string | undefined = typeof body.text === "string" ? body.text.trim() : undefined;
  if (!cvPath && !pasted) throw new HttpError(400, "Please upload a CV or paste its text.");
  if (cvPath && !cvPath.startsWith(`${userId}/`)) throw new HttpError(403, "That file does not belong to you.");
  if (pasted && pasted.length < 100) throw new HttpError(400, "That looks too short to be a CV. Please paste the full text.");

  await rateLimit(userId, "parse-cv", 5, 24 * 3600_000, "You can read up to 5 CVs a day. Please try again tomorrow.");

  const { data: current } = await db.from("profiles").select("onboarding_status").eq("id", userId).single();
  const keepStatus = current?.onboarding_status === "matched";
  if (!keepStatus) {
    await db.from("profiles").update({ onboarding_status: "cv_uploaded", ...(cvPath ? { cv_path: cvPath } : {}) })
      .eq("id", userId);
  } else if (cvPath) {
    await db.from("profiles").update({ cv_path: cvPath }).eq("id", userId);
  }

  let parts;
  if (pasted) {
    parts = [{ text: cvParseUserText(stripContacts(pasted.slice(0, MAX_TEXT))) }];
  } else {
    const { data: file, error } = await db.storage.from("cvs").download(cvPath!);
    if (error || !file) throw new HttpError(404, "We could not find your uploaded CV. Please upload it again.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) throw new HttpError(400, "Your CV must be smaller than 5 MB.");
    const isPdf = cvPath!.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      parts = [
        { text: "Parse this CV.\n\n<cv>" },
        { inlineData: { mimeType: "application/pdf", data: toBase64(bytes) } },
        { text: "</cv>" },
      ];
    } else {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      if (!value?.trim()) throw new HttpError(400, "We could not read any text in that document. Try a PDF or paste the text.");
      parts = [{ text: cvParseUserText(stripContacts(value.slice(0, MAX_TEXT))) }];
    }
  }

  const profile = await generateJson({
    functionName: "parse-cv",
    model: models.parse(),
    system: cvParseSystem(new Date().toISOString().slice(0, 10)),
    parts,
    schema: cvParseSchema,
    validate: isParsedProfile,
    temperature: 0.1,
    userId,
  });

  if (!profile.is_cv) {
    throw new HttpError(422, "That doesn't look like a CV. Please upload your CV as a PDF or Word document, or paste its text.");
  }

  const { error: updError } = await db
    .from("profiles")
    .update({ parsed_profile: profile, ...(keepStatus ? {} : { onboarding_status: "profile_ready" }) })
    .eq("id", userId);
  if (updError) throw updError;

  return json({ parsed_profile: profile });
});
