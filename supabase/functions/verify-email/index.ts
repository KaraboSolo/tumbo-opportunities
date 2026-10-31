// Confirm link target. Marks the contact email as confirmed, then redirects to the site.
// (Supabase serves function HTML as plain text, so we always redirect instead.)
import { adminClient, env, serve } from "../_shared/http.ts";

const MAX_AGE_MS = 7 * 24 * 3600_000;

serve(async (req) => {
  const site = env("SITE_URL");
  const redirect = (result: string) => Response.redirect(`${site}/settings?email=${result}`, 302);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return redirect("invalid");

  const db = adminClient();
  const { data: row } = await db
    .from("email_verifications")
    .select("user_id, email, created_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!row || row.used_at || Date.now() - new Date(row.created_at).getTime() > MAX_AGE_MS) {
    return redirect("invalid");
  }

  // Only confirm if the address has not changed since the link was sent.
  const now = new Date().toISOString();
  const { data: updated } = await db
    .from("profiles")
    .update({ contact_email_verified_at: now })
    .eq("id", row.user_id)
    .eq("contact_email", row.email)
    .select("id");
  await db.from("email_verifications").update({ used_at: now }).eq("token", token);

  return redirect(updated && updated.length > 0 ? "confirmed" : "invalid");
});
