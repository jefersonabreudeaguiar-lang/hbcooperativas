import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CloudCooperativaRow } from "./admin";

let publicClient: SupabaseClient | null = null;

export function isSupabasePublicConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Cliente anon — leitura pública com RLS. */
export function getSupabasePublic(): SupabaseClient | null {
  if (!isSupabasePublicConfigured()) return null;

  if (!publicClient) {
    publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  return publicClient;
}

export type { CloudCooperativaRow };
