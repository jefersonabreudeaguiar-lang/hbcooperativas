/**
 * Fase A — ledger + reconciliação com bloqueio opcional em DIVERGENT.
 * Padrão: ativo em modo sombra (só auditoria; não bloqueia além do P0 já existente).
 */

const ENABLED_FLAG = "HB_CREDIT_PHASE_A_ENABLED";
const SHADOW_FLAG = "HB_CREDIT_PHASE_A_SHADOW";
const BLOCK_FLAG = "HB_CREDIT_PHASE_A_BLOCK_DIVERGENT";

function parseOff(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
}

function parseOn(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ["true", "1", "on", "yes"].includes(raw.trim().toLowerCase());
}

export type HbCreditPhaseAMode = {
  enabled: boolean;
  shadow: boolean;
  blockOnDivergent: boolean;
};

/** Fase A ligada por padrão; desligar com HB_CREDIT_PHASE_A_ENABLED=false */
export function resolveHbCreditPhaseAMode(env: NodeJS.ProcessEnv = process.env): HbCreditPhaseAMode {
  const enabled = !parseOff(env[ENABLED_FLAG]);
  const shadow = env[SHADOW_FLAG] == null || env[SHADOW_FLAG].trim() === "" ? true : !parseOff(env[SHADOW_FLAG]);
  const blockOnDivergent = parseOn(env[BLOCK_FLAG]);
  return {
    enabled,
    shadow,
    blockOnDivergent: enabled && !shadow && blockOnDivergent,
  };
}

export function isHbCreditPhaseAEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveHbCreditPhaseAMode(env).enabled;
}
