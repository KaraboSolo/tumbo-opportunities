// Emails a digest of new (daily) matches to each user who wants them.
// Only confirmed contact emails receive digests. notified_at is set only on success.
// Body: { retry?: true } - hourly retry: only users whose last attempt today failed (max 3 tries).
// WhatsApp is phase 2.
import { adminClient, json, requireCron, serve } from "../_shared/http.ts";
import { digestEmail, firstName, monthlySalary, sendEmail } from "../_shared/email.ts";

const MAX_JOBS = 5;
const MAX_ATTEMPTS = 3;

interface Row {
  id: number;
  user_id: string;
  score: number;
  reason: string;
  jobs: {
    title: string;
    company: string | null;
    location_display: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_is_predicted: boolean;
    redirect_url: string;
  };
}

serve(async (req) => {
  requireCron(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient();
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const { data: pending, error } = await db
    .from("matches")
    .select("id, user_id, score, reason, jobs(title, company, location_display, salary_min, salary_max, salary_is_predicted, redirect_url)")
    .is("notified_at", null)
    .eq("source", "daily")
    .gte("created_at", since)
    .order("score", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const byUser = new Map<string, Row[]>();
  for (const row of (pending ?? []) as unknown as Row[]) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }
  if (byUser.size === 0) return json({ sent: 0, failed: 0, skipped: 0 });

  const { data: profiles, error: pError } = await db
    .from("profiles")
    .select("id, full_name, contact_email, contact_email_verified_at, notify_email, notifications_paused")
    .in("id", [...byUser.keys()]);
  if (pError) throw pError;

  const { data: logs } = await db
    .from("notification_log")
    .select("user_id, status")
    .eq("channel", "email")
    .eq("kind", "digest")
    .gte("created_at", today)
    .in("user_id", [...byUser.keys()]);
  const attempts = new Map<string, { failed: number; sent: boolean }>();
  for (const l of logs ?? []) {
    const a = attempts.get(l.user_id) ?? { failed: 0, sent: false };
    if (l.status === "failed") a.failed++;
    if (l.status === "sent") a.sent = true;
    attempts.set(l.user_id, a);
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const p of profiles ?? []) {
    const rows = byUser.get(p.id)!;
    const a = attempts.get(p.id) ?? { failed: 0, sent: false };
    const wantsEmail = p.notify_email && !p.notifications_paused && p.contact_email && p.contact_email_verified_at;
    if (!wantsEmail || a.failed >= MAX_ATTEMPTS || (body.retry && a.failed === 0)) {
      skipped++;
      continue;
    }

    const jobs = rows.slice(0, MAX_JOBS).map((r) => ({
      title: r.jobs.title,
      company: r.jobs.company,
      location_display: r.jobs.location_display,
      salary: monthlySalary(r.jobs.salary_min, r.jobs.salary_max, r.jobs.salary_is_predicted),
      reason: r.reason,
      redirect_url: r.jobs.redirect_url,
    }));
    const email = await digestEmail(p.id, firstName(p.full_name), jobs);

    try {
      const messageId = await sendEmail(p.contact_email, email.subject, email.html, email.text);
      // The digest links to "See all my matches", so every pending match counts as notified.
      await db.from("matches").update({ notified_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
      await db.from("notification_log").insert({
        user_id: p.id, channel: "email", kind: "digest", status: "sent", provider_message_id: messageId,
      });
      sent++;
    } catch (err) {
      await db.from("notification_log").insert({
        user_id: p.id, channel: "email", kind: "digest", status: "failed",
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      });
      failed++;
    }
  }

  return json({ sent, failed, skipped });
});
