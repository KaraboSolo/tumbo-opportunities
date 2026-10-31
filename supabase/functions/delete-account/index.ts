// POPIA: deletes the user's CV files, profile, matches and login.
import { adminClient, json, requireUser, serve } from "../_shared/http.ts";

serve(async (req) => {
  const userId = await requireUser(req);
  const db = adminClient();

  const { data: files } = await db.storage.from("cvs").list(userId, { limit: 1000 });
  if (files && files.length > 0) {
    const { error } = await db.storage.from("cvs").remove(files.map((f) => `${userId}/${f.name}`));
    if (error) throw error;
  }

  // Profiles, matches, logs and verification rows cascade from auth.users.
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;

  return json({ ok: true });
});
