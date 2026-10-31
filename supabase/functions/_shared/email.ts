// Email sending (Zoho CPaaS), templates and signed unsubscribe links.
import { env } from "./http.ts";

/** Sends one email through Zoho CPaaS and returns its request id. */
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<string> {
  // The send mail token may be stored with or without its "Zoho-enczapikey" prefix.
  const token = env("ZOHO_CPAAS_EMAIL_TOKEN").replace(/^Zoho-enczapikey\s+/i, "");
  const res = await fetch(`${env("ZOHO_CPAAS_HOST", "https://cpaas.zoho.com")}/v1.1/email`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: { address: env("EMAIL_FROM_ADDRESS"), name: env("EMAIL_FROM_NAME", "Tumbo Opportunities") },
      to: [{ email_address: { address: to } }],
      subject,
      htmlbody: html,
      textbody: text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.message === "error") {
    const detail = data?.data?.error_code ?? data?.error?.code ?? "unknown error";
    throw new Error(`Zoho CPaaS ${res.status}: ${detail}`);
  }
  return data.request_id ?? "";
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env("UNSUBSCRIBE_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function unsubscribeUrl(userId: string): Promise<string> {
  return `${env("SUPABASE_URL")}/functions/v1/unsubscribe?u=${userId}&t=${await hmac(userId)}`;
}

export async function checkUnsubscribeToken(userId: string, token: string): Promise<boolean> {
  const expected = await hmac(userId);
  return expected.length === token.length && expected === token;
}

const BRAND = "#24448f";

function layout(inner: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:24px 24px 8px;font-size:20px;font-weight:bold;color:${BRAND};letter-spacing:1px">TUMBO</td></tr>
<tr><td style="padding:8px 24px 24px;font-size:15px;line-height:1.5">${inner}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface DigestJob {
  title: string;
  company: string | null;
  location_display: string | null;
  salary: string | null;
  reason: string;
  redirect_url: string;
}

export async function digestEmail(userId: string, firstName: string, jobs: DigestJob[]) {
  const site = env("SITE_URL");
  const contact = env("COMPANY_CONTACT", "Tumbo");
  const unsub = await unsubscribeUrl(userId);
  const n = jobs.length;
  const subject = `${n} new job${n === 1 ? "" : "s"} that fit your profile`;

  const blocks = jobs.map((j) => `
<div style="padding:16px 0;border-top:1px solid #e5e7eb">
  <div style="font-size:16px;font-weight:bold">${esc(j.title)}</div>
  <div style="color:#4b5563">${esc([j.company, j.location_display].filter(Boolean).join(" · "))}</div>
  ${j.salary ? `<div style="color:#4b5563">${esc(j.salary)}</div>` : ""}
  <p style="font-style:italic;margin:8px 0">${esc(j.reason)}</p>
  <a href="${esc(j.redirect_url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px">View job</a>
</div>`).join("");

  const html = layout(
    `<p>Hi ${esc(firstName)},</p><p>Here are today's best matches for you.</p>${blocks}
<p style="padding-top:16px"><a href="${site}/matches" style="color:${BRAND}">See all my matches</a></p>`,
    `Jobs powered by <a href="https://www.adzuna.co.za" style="color:#6b7280">Adzuna</a>.<br>
<a href="${esc(unsub)}" style="color:#6b7280">Pause these emails</a> · ${esc(contact)}`,
  );

  const text = [
    `Hi ${firstName},`,
    "",
    "Here are today's best matches for you.",
    "",
    ...jobs.flatMap((j) => [
      j.title,
      [j.company, j.location_display].filter(Boolean).join(" · "),
      ...(j.salary ? [j.salary] : []),
      j.reason,
      `View job: ${j.redirect_url}`,
      "",
    ]),
    `See all my matches: ${site}/matches`,
    "",
    "Jobs powered by Adzuna (https://www.adzuna.co.za)",
    `Pause these emails: ${unsub}`,
    contact,
  ].join("\n");

  return { subject, html, text };
}

export function verificationEmail(firstName: string, link: string) {
  const contact = env("COMPANY_CONTACT", "Tumbo");
  const subject = "Confirm your email for job alerts";
  const html = layout(
    `<p>Hi ${esc(firstName)},</p><p>Please confirm this is your email address so we can send you new jobs that fit your profile.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px">Confirm my email</a></p>
<p style="color:#6b7280;font-size:13px">If you did not sign up, you can ignore this email.</p>`,
    esc(contact),
  );
  const text = `Hi ${firstName},\n\nPlease confirm this is your email address so we can send you new jobs that fit your profile:\n${link}\n\nIf you did not sign up, you can ignore this email.\n\n${contact}`;
  return { subject, html, text };
}

const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA").replace(/,/g, " ")}`;

/** Formats Adzuna's annual salary as a monthly range. */
export function monthlySalary(min: number | null, max: number | null, predicted: boolean): string | null {
  if (!min && !max) return null;
  const lo = min ? min / 12 : null;
  const hi = max ? max / 12 : null;
  const range = lo && hi && Math.round(lo) !== Math.round(hi) ? `${rand(lo)} to ${rand(hi)}` : rand((lo ?? hi)!);
  return `${range} per month${predicted ? " (estimated)" : ""}`;
}

export const firstName = (fullName: string | null | undefined) => (fullName ?? "").trim().split(/\s+/)[0] || "there";
