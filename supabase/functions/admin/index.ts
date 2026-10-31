// Admin actions. The caller must be signed in and listed in public.admins.
//
// Body: { action: "set_setting", key, value }
//       { action: "upload_url", filename }                    signed upload URL for a circular PDF
//       { action: "ingest_circular", storage_path, replace? }  start reading a circular
//       { action: "rerun_circular", circular_id, pages? }      re-read chunks (all failed ones if no pages)
//       { action: "publish_circular", circular_id, published }
//       { action: "delete_circular", circular_id }
//       { action: "run_sync" }                                 run the Adzuna sync now
import { adminClient, HttpError, json, requireUser, serve, triggerFunction } from "../_shared/http.ts";

const SETTINGS = new Set(["gov_vacancies_enabled"]);

async function requireAdmin(req: Request): Promise<string> {
  const userId = await requireUser(req);
  const { data } = await adminClient().from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(403, "Admins only.");
  return userId;
}

serve(async (req) => {
  await requireAdmin(req);
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  switch (body.action) {
    case "set_setting": {
      if (!SETTINGS.has(body.key)) throw new HttpError(400, "Unknown setting.");
      const { error } = await db.from("app_settings")
        .upsert({ key: body.key, value: body.value === true, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    case "upload_url": {
      const name = String(body.filename ?? "circular.pdf").toLowerCase().replace(/[^a-z0-9.]+/g, "-");
      if (!name.endsWith(".pdf")) throw new HttpError(400, "Please upload a PDF.");
      const path = `${new Date().getFullYear()}/${Date.now()}-${name}`;
      const { data, error } = await db.storage.from("circulars").createSignedUploadUrl(path);
      if (error) throw error;
      return json({ path, token: data.token });
    }

    case "ingest_circular": {
      if (typeof body.storage_path !== "string") throw new HttpError(400, "storage_path is required.");
      // Reading the index happens inside the ingester; it records its own progress.
      triggerFunction("ingest-gov-circular", { storage_path: body.storage_path, replace: body.replace === true });
      return json({ ok: true });
    }

    case "rerun_circular": {
      const id = Number(body.circular_id);
      let pages: number[] = Array.isArray(body.pages) ? body.pages.map(Number) : [];
      if (pages.length === 0) {
        const { data } = await db.from("gov_ingest_chunks").select("first_page")
          .eq("circular_id", id).eq("status", "failed");
        pages = (data ?? []).map((c) => c.first_page);
      }
      // With no pages to redo, the ingester still re-runs its gap check and final pass.
      if (pages.length === 0) await db.from("gov_circulars").update({ status: "processing" }).eq("id", id);
      triggerFunction("ingest-gov-circular", { circular_id: id, rerun_pages: pages });
      return json({ ok: true, pages });
    }

    case "publish_circular": {
      const { error } = await db.from("gov_circulars")
        .update({ published: body.published === true }).eq("id", Number(body.circular_id));
      if (error) throw error;
      return json({ ok: true });
    }

    case "delete_circular": {
      const id = Number(body.circular_id);
      const { data: c } = await db.from("gov_circulars").select("storage_path").eq("id", id).maybeSingle();
      if (!c) throw new HttpError(404, "Circular not found.");
      const { error } = await db.from("gov_circulars").delete().eq("id", id);
      if (error) throw error;
      // Keep the PDF if another circular row still points at it.
      const { count } = await db.from("gov_circulars").select("id", { count: "exact", head: true })
        .eq("storage_path", c.storage_path);
      if (!count) await db.storage.from("circulars").remove([c.storage_path]);
      return json({ ok: true });
    }

    case "run_sync": {
      triggerFunction("adzuna-sync", { mode: "daily" });
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
