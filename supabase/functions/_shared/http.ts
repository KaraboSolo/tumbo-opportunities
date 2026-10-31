// HTTP helpers shared by all Edge Functions: CORS, JSON responses, caller checks.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback;
  if (value === undefined || value === "") throw new Error(`Missing environment variable ${name}`);
  return value;
}

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  admin ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function isCronCall(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  const given = req.headers.get("x-cron-secret");
  return !!secret && !!given && timingSafeEqual(secret, given);
}

export function requireCron(req: Request): void {
  if (!isCronCall(req)) throw new HttpError(401, "Unauthorized");
}

/** Returns the id of the signed-in user, or throws 401. */
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");
  return data.user.id;
}

/** Wraps a handler with CORS preflight and consistent error responses. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      // Log the message only: never log CV text or contact details.
      console.error(err instanceof Error ? err.message : String(err));
      return json({ error: "Something went wrong on our side. Please try again in a moment." }, 500);
    }
  });
}

/** Calls another Edge Function with the cron secret. Does not wait for it to finish. */
export function triggerFunction(name: string, body: Record<string, unknown> = {}): void {
  const call = fetch(`${env("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": env("CRON_SECRET") },
    body: JSON.stringify(body),
  }).catch((err) => console.error(`trigger ${name} failed: ${err.message}`));
  // Keep the worker alive until the request has been sent.
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(call);
}

/** Counts a rate-limited action and throws 429 when the limit is reached. */
export async function rateLimit(userId: string, action: string, max: number, windowMs: number, message: string) {
  const db = adminClient();
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await db
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= max) throw new HttpError(429, message);
  await db.from("rate_limit_events").insert({ user_id: userId, action });
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds of wall clock we allow one invocation before handing off to a fresh one. */
export const TIME_BUDGET_MS = 110_000;
