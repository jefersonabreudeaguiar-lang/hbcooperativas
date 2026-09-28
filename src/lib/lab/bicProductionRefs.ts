/** Refs Supabase de produção — nunca alvo de ensaios BIC LAB com escrita. */
export const PRODUCTION_SUPABASE_PROJECT_REFS = ["ifptyzikekrswippzmsf"] as const;

export function extractSupabaseProjectRef(url?: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
