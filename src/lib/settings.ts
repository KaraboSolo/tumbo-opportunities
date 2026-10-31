import { useEffect, useState } from "react";
import { supabase } from "./supabase";

let cache: Record<string, unknown> | null = null;
let pending: Promise<Record<string, unknown>> | null = null;

async function loadSettings(): Promise<Record<string, unknown>> {
  pending ??= Promise.resolve(supabase.from("app_settings").select("key, value")).then(({ data }) => {
    cache = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    return cache;
  });
  return pending;
}

/** Feature toggle from app_settings (set from the admin portal). Undefined while loading. */
export function useSetting(key: string): boolean | undefined {
  const [value, setValue] = useState<boolean | undefined>(cache ? cache[key] === true : undefined);
  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => alive && setValue(s[key] === true));
    return () => {
      alive = false;
    };
  }, [key]);
  return value;
}
