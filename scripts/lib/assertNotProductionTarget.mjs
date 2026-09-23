/**
 * Fail-closed guard for admin/destructive CLI scripts.
 * Requires APP_ENV=homolog and a non-production Supabase project ref.
 */

/** Supabase project refs that must never be targeted by destructive admin scripts. */
export const PRODUCTION_SUPABASE_PROJECT_REFS = ["ifptyzikekrswippzmsf"];

/**
 * @param {string | undefined | null} supabaseUrl
 * @returns {string | null}
 */
export function extractSupabaseProjectRef(supabaseUrl) {
  const raw = String(supabaseUrl ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ allowed: boolean; label: "ALLOWED" | "BLOCKED"; message: string; projectRef: string | null; appEnv: string }}
 */
export function evaluateProductionGuard(env = process.env) {
  const appEnvRaw = String(env.APP_ENV ?? "").trim();
  const appEnv = appEnvRaw.toLowerCase();
  const projectRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);

  if (!projectRef) {
    return {
      allowed: false,
      label: "BLOCKED",
      message: "BLOCKED — PRODUCTION TARGET (missing or invalid NEXT_PUBLIC_SUPABASE_URL)",
      projectRef: null,
      appEnv: appEnvRaw,
    };
  }

  if (PRODUCTION_SUPABASE_PROJECT_REFS.includes(projectRef)) {
    return {
      allowed: false,
      label: "BLOCKED",
      message: `BLOCKED — PRODUCTION TARGET (Supabase project ref ${projectRef})`,
      projectRef,
      appEnv: appEnvRaw,
    };
  }

  if (appEnv === "production") {
    return {
      allowed: false,
      label: "BLOCKED",
      message: "BLOCKED — APP_ENV=production",
      projectRef,
      appEnv: appEnvRaw,
    };
  }

  if (appEnv !== "homolog") {
    return {
      allowed: false,
      label: "BLOCKED",
      message:
        "BLOCKED — APP_ENV must be homolog for destructive admin scripts (absent or other values are blocked)",
      projectRef,
      appEnv: appEnvRaw,
    };
  }

  return {
    allowed: true,
    label: "ALLOWED",
    message: "ALLOWED — NON-PRODUCTION",
    projectRef,
    appEnv: appEnvRaw,
  };
}

/**
 * Exits the process with code 1 when the current env targets production or is not homolog-safe.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertNotProductionTarget(env = process.env) {
  const verdict = evaluateProductionGuard(env);
  if (!verdict.allowed) {
    console.error(verdict.message);
    process.exit(1);
  }
}
