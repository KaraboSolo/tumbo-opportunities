// One-click pause from the email footer. The link is signed, so no login is needed.
import { adminClient, env, serve } from "../_shared/http.ts";
import { checkUnsubscribeToken } from "../_shared/email.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const site = env("SITE_URL");

  if (!/^[0-9a-f-]{36}$/i.test(userId) || !(await checkUnsubscribeToken(userId, token))) {
    return Response.redirect(`${site}/paused?status=invalid`, 302);
  }
  await adminClient().from("profiles").update({ notifications_paused: true }).eq("id", userId);
  return Response.redirect(`${site}/paused`, 302);
});
