/** Políticas de endurecimento — LAB ONLY. Não importar em src/ produção. */

export interface HardeningFlags {
  blockIncoherentPush: boolean;
  sliceSyncPolicy: boolean;
  assinaturaFsmGate: boolean;
  capacityPredictor: boolean;
  chaosRecovery: boolean;
  duplicateCooperadoGuard: boolean;
  securityLint: boolean;
}

export const HARDENING_ROUNDS: { round: number; label: string; flags: HardeningFlags }[] = [
  {
    round: 0,
    label: "Baseline produção (Build 59)",
    flags: {
      blockIncoherentPush: false,
      sliceSyncPolicy: false,
      assinaturaFsmGate: false,
      capacityPredictor: false,
      chaosRecovery: false,
      duplicateCooperadoGuard: false,
      securityLint: false,
    },
  },
  {
    round: 1,
    label: "Coerência + capacidade",
    flags: {
      blockIncoherentPush: true,
      sliceSyncPolicy: false,
      assinaturaFsmGate: false,
      capacityPredictor: true,
      chaosRecovery: false,
      duplicateCooperadoGuard: false,
      securityLint: true,
    },
  },
  {
    round: 2,
    label: "+ Assinatura FSM + duplicatas",
    flags: {
      blockIncoherentPush: true,
      sliceSyncPolicy: false,
      assinaturaFsmGate: true,
      capacityPredictor: true,
      chaosRecovery: false,
      duplicateCooperadoGuard: true,
      securityLint: true,
    },
  },
  {
    round: 3,
    label: "+ Sync slices + recovery caos",
    flags: {
      blockIncoherentPush: true,
      sliceSyncPolicy: true,
      assinaturaFsmGate: true,
      capacityPredictor: true,
      chaosRecovery: true,
      duplicateCooperadoGuard: true,
      securityLint: true,
    },
  },
];

export function enabledLabels(flags: HardeningFlags): string[] {
  const out: string[] = [];
  if (flags.blockIncoherentPush) out.push("Bloqueio push incoerente");
  if (flags.sliceSyncPolicy) out.push("Sync por slices (lab)");
  if (flags.assinaturaFsmGate) out.push("Gate FSM assinatura");
  if (flags.capacityPredictor) out.push("Preditor capacidade");
  if (flags.chaosRecovery) out.push("Recovery pós-caos");
  if (flags.duplicateCooperadoGuard) out.push("Alerta cooperado duplicado");
  if (flags.securityLint) out.push("Lint segurança estático");
  return out;
}
