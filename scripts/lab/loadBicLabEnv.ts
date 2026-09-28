/**
 * Carrega .env.local e sobrescreve com .env.bic-lab (Supabase homolog + flags BIC).
 * Usado por scripts LAB — não altera produção no repositório.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Chaves que .env.bic-lab pode sobrescrever após .env.local */
export const BIC_LAB_OVERRIDE_KEYS = new Set([
  "APP_ENV",
  "BIC_ENVIRONMENT",
  "HB_BIC_LAB_DEPLOY",
  "HB_BIC_MIRROR_ENABLED",
  "HB_BIC_LAB_ENABLED",
  "NEXT_PUBLIC_HB_BIC_LAB_ENABLED",
  "HB_BIC_LAB_B4_AUTHORITY",
  "HB_BIC_LAB_FULL",
  "NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK",
  "HB_BIC_PRODUCTION_SUPABASE_REF",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

function loadEnvFile(
  path: string,
  opts: { override: boolean; keys?: Set<string> }
): boolean {
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (opts.keys && !opts.keys.has(key)) continue;
    if (!opts.override && process.env[key] !== undefined && process.env[key] !== "") continue;
    process.env[key] = value;
  }
  return true;
}

export function loadBicLabEnv(cwd: string = process.cwd()): {
  hasLocal: boolean;
  hasBicLab: boolean;
} {
  const hasLocal = loadEnvFile(resolve(cwd, ".env.local"), { override: false });
  const hasBicLab = loadEnvFile(resolve(cwd, ".env.bic-lab"), {
    override: true,
    keys: BIC_LAB_OVERRIDE_KEYS,
  });
  return { hasLocal, hasBicLab };
}
