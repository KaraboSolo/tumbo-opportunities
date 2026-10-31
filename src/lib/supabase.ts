import { createClient, FunctionsHttpError } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "missing-anon-key");

/** Calls an Edge Function and turns its error body into a readable message. */
export async function callFunction<T = unknown>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Something went wrong. Please try again.");
    }
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }
  return data as T;
}
