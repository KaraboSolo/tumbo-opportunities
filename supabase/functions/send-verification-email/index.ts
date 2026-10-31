// Sends a confirm link to the user's contact email. Digests go only to confirmed addresses,
// because Supabase email confirmation is off for this project.
import { adminClient, env, HttpError, json, rateLimit, requireUser, serve } from "../_shared/http.ts";
import { firstName, sendEmail, verificationEmail } from "../_shared/email.ts";

serve(async (req) => {
  const userId = await requireUser(req);
  const db = adminClient();

  const { data: profile, error } = await db
    .from("profiles")
    .select("full_name, contact_email, contact_email_verified_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!profile.contact_email) throw new HttpError(400, "Please add a contact email first.");
  if (profile.contact_email_verified_at) return json({ status: "already_verified" });

  await rateLimit(userId, "verify-email", 3, 24 * 3600_000, "We've sent a few confirmation emails today. Please check your inbox or try tomorrow.");

  const { data: row, error: insError } = await db
    .from("email_verifications")
    .insert({ user_id: userId, email: profile.contact_email })
    .select("token")
    .single();
  if (insError) throw insError;

  const link = `${env("SUPABASE_URL")}/functions/v1/verify-email?token=${row.token}`;
  const email = verificationEmail(firstName(profile.full_name), link);
  const messageId = await sendEmail(profile.contact_email, email.subject, email.html, email.text);
  await db.from("notification_log").insert({
    user_id: userId, channel: "email", kind: "verification", status: "sent", provider_message_id: messageId,
  });

  return json({ status: "sent" });
});
