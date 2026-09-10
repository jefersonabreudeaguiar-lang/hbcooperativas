/** HB Credit Watch — feature flags fail-closed */

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") return fallback;
  return ["true", "1", "yes"].includes(raw.trim().toLowerCase());
}

export interface CreditWatchConfig {
  enabled: boolean;
  intervalMinutes: number;
  probeCoops: string[];
}

export function loadCreditWatchConfig(env: NodeJS.ProcessEnv = process.env): CreditWatchConfig {
  const enabled = parseBool(env.HB_HOBELISCO_CREDIT_WATCH_ENABLED, false);
  const intervalRaw = Number.parseInt(env.HB_HOBELISCO_CREDIT_WATCH_INTERVAL_MINUTES ?? "15", 10);
  const intervalMinutes = Number.isFinite(intervalRaw) && intervalRaw >= 5 && intervalRaw <= 1440 ? intervalRaw : 15;

  const coops: string[] = [];
  const listRaw = env.HB_HOBELISCO_PROBE_COOPS?.trim();
  if (listRaw) {
    for (const part of listRaw.split(/[,;\s]+/)) {
      const digits = part.replace(/\D/g, "");
      if (digits.length === 14) coops.push(digits);
    }
  }
  const single = env.HB_HOBELISCO_PROBE_COOP_CNPJ?.replace(/\D/g, "") ?? "";
  if (single.length === 14 && !coops.includes(single)) coops.push(single);

  return { enabled, intervalMinutes, probeCoops: coops };
}

export function isCreditWatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = loadCreditWatchConfig(env);
  if (!cfg.enabled) return false;
  const envName = (env.HOBELISCO_ENVIRONMENT ?? "").toUpperCase();
  if (envName === "PRODUCTION") return false;
  if (env.NODE_ENV === "production" && envName !== "STAGING") return false;
  return parseBool(env.HB_HOBELISCO_V2_ENABLED, false);
}
