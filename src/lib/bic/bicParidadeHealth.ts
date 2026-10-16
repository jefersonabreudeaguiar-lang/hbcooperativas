/**
 * Concerto BIC — snapshot de saúde (server-safe).
 */
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { listBicLeituraPortaSuperficiesAtivas } from "@/lib/bic/bicLeituraPortaGating";
import { isCooperadoBicHybridLightEnabled } from "@/lib/cooperado/cooperadoBicHybridLight";

export function isBicRevisionPulseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.NEXT_PUBLIC_BIC_REVISION_PULSE ?? "true";
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function isCooperadoBicSonataSyncUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.NEXT_PUBLIC_BIC_SONATA_SYNC_UI ?? "true";
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function buildBicParidadeHealthSnapshot(env: NodeJS.ProcessEnv = process.env) {
  return {
    movement: "IV",
    build: APP_BUILD_VERSION,
    bicAuthority: isBicCentralReadAuthorityEnabled(env),
    hybridLight: isCooperadoBicHybridLightEnabled(env),
    revisionPulse: isBicRevisionPulseEnabled(env),
    sonataSyncUi: isCooperadoBicSonataSyncUiEnabled(env),
    leituraPortaSuperficies: listBicLeituraPortaSuperficiesAtivas(env),
    portaGlobalKillSwitch: env.NEXT_PUBLIC_BIC_LEITURA_PORTA?.trim().toLowerCase() === "false",
    clientTelemetryKey: "hb.bic.paridadeTelemetry.v1",
  };
}
