import { useEffect, useState } from "react";
import { callFunction, supabase } from "./supabase";
import { useAuth } from "./auth";

/** True when the signed-in user is in public.admins. Undefined while checking. */
export function useIsAdmin(): boolean | undefined {
  const { session, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    if (!session) {
      setIsAdmin(false);
      return;
    }
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true));
  }, [session, loading]);
  return isAdmin;
}

/** Calls the admin Edge Function. */
export const adminAction = <T = { ok: boolean }>(action: string, payload: Record<string, unknown> = {}) =>
  callFunction<T>("admin", { action, ...payload });

/** Calls an admin RPC and throws on error. */
export async function adminRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-ZA");

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
