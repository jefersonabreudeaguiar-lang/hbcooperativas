/**
 * Fase B — antifraude (velocidade, valor alto, mercado novo) + step-up opcional.
 * Padrão: ativo em modo sombra (auditoria; não bloqueia nem pede 2º PIN).
 */

const ENABLED_FLAG = "HB_CREDIT_PHASE_B_ENABLED";
const SHADOW_FLAG = "HB_CREDIT_PHASE_B_SHADOW";
const ENFORCE_FLAG = "HB_CREDIT_PHASE_B_ENFORCE";
const BLOCK_HIGH_FLAG = "HB_CREDIT_PHASE_B_BLOCK_HIGH";

function parseOff(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
}

function parseOn(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ["true", "1", "on", "yes"].includes(raw.trim().toLowerCase());
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type HbCreditPhaseBMode = {
  enabled: boolean;
  shadow: boolean;
  /** Step-up (2º PIN) em risco médio quando enforce ligado. */
  enforceStepUp: boolean;
  /** Bloqueia risco alto quando enforce + flag explícita. */
  blockHighRisk: boolean;
  maxPayments15m: number;
  maxVolume24hCents: number;
  highAmountPctOfAvailable: number;
  highAmountAbsoluteCents: number;
};

export function resolveHbCreditPhaseBMode(env: NodeJS.ProcessEnv = process.env): HbCreditPhaseBMode {
  const enabled = !parseOff(env[ENABLED_FLAG]);
  const shadow =
    env[SHADOW_FLAG] == null || env[SHADOW_FLAG].trim() === "" ? true : !parseOff(env[SHADOW_FLAG]);
  const enforceOn = parseOn(env[ENFORCE_FLAG]);
  const blockHigh = parseOn(env[BLOCK_HIGH_FLAG]);
  return {
    enabled,
    shadow,
    enforceStepUp: enabled && !shadow && enforceOn,
    blockHighRisk: enabled && !shadow && enforceOn && blockHigh,
    maxPayments15m: parsePositiveInt(env.HB_CREDIT_PHASE_B_MAX_PAYMENTS_15M, 4),
    maxVolume24hCents: parsePositiveInt(env.HB_CREDIT_PHASE_B_MAX_VOLUME_24H_CENTS, 500_000),
    highAmountPctOfAvailable: parsePositiveInt(env.HB_CREDIT_PHASE_B_HIGH_AMOUNT_PCT, 85),
    highAmountAbsoluteCents: parsePositiveInt(env.HB_CREDIT_PHASE_B_HIGH_AMOUNT_CENTS, 200_000),
  };
}
