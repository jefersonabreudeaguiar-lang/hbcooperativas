/**
 * Configuração e health check — Hobelisco LAB espelho (Fase 0)
 */

import { loadHobeliscoV2Flags } from "@lab/hobelisco-hx/config";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import { isStagingPersistenceConfigured } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import {
  assertHobeliscoLabBoundary,
  evaluateHobeliscoLabBoundary,
  isHobeliscoLabDeploy,
  isHobeliscoMirrorMode,
  readHobeliscoPersistenceUrl,
  type HobeliscoBoundaryReport,
} from "./hobeliscoLabBoundary";
import { isHobeliscoLabEnabledServer } from "./hobeliscoLabGate";
import { isHobeliscoV2ObserverEnabledServer } from "./hobeliscoV2Gate";

export interface HobeliscoLabMirrorConfig {
  environment: string;
  mirrorEnabled: boolean;
  labDeploy: boolean;
  labUiEnabled: boolean;
  v2Enabled: boolean;
  observeOnly: boolean;
  persistenceConfigured: boolean;
  hobeliscoSupabaseConfigured: boolean;
  probeCoopCnpj: string | null;
  activeDefenseEnabled: boolean;
  adaptiveDefenseEnabled: boolean;
  autoRepairEnabled: boolean;
  fabricMode: string;
}

export interface HobeliscoLabMirrorHealth {
  ok: boolean;
  phase: "0-foundation";
  mode: "LAB_MIRROR";
  config: HobeliscoLabMirrorConfig;
  boundary: HobeliscoBoundaryReport;
  gates: {
    boundaryClear: boolean;
    labEnabled: boolean;
    observerEnabled: boolean;
    notProductionDeploy: boolean;
    mirrorMarker: boolean;
  };
  issues: string[];
  recommendations: string[];
}

function parseBool(raw: string | undefined): boolean {
  return ["true", "1", "yes"].includes((raw ?? "").trim().toLowerCase());
}

export function loadHobeliscoLabMirrorConfig(env: NodeJS.ProcessEnv = process.env): HobeliscoLabMirrorConfig {
  const flags = loadHobeliscoV2Flags(env);
  const fabricRaw = (env.HOBELISCO_FABRIC_MODE ?? "SHADOW").trim().toUpperCase();
  return {
    environment: resolveHobeliscoEnvironment(env),
    mirrorEnabled: isHobeliscoMirrorMode(env),
    labDeploy: isHobeliscoLabDeploy(env),
    labUiEnabled: isHobeliscoLabEnabledServer(env),
    v2Enabled: flags.v2Enabled,
    observeOnly: flags.observeOnly,
    persistenceConfigured: isStagingPersistenceConfigured(env),
    hobeliscoSupabaseConfigured: Boolean(readHobeliscoPersistenceUrl(env)),
    probeCoopCnpj: env.HB_HOBELISCO_PROBE_COOP_CNPJ?.trim() || null,
    activeDefenseEnabled: parseBool(env.HOBELISCO_ACTIVE_DEFENSE_ENABLED),
    adaptiveDefenseEnabled: parseBool(env.HB_ADAPTIVE_DEFENSE_ENABLED),
    autoRepairEnabled: parseBool(env.HOBELISCO_AUTO_REPAIR),
    fabricMode: fabricRaw,
  };
}

export function checkHobeliscoLabMirrorHealth(env: NodeJS.ProcessEnv = process.env): HobeliscoLabMirrorHealth {
  const config = loadHobeliscoLabMirrorConfig(env);
  const boundary = evaluateHobeliscoLabBoundary(env);
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (boundary.productionLocked) {
    issues.push("Deploy de produção oficial — Hobelisco LAB espelho não deve rodar aqui.");
  }

  if (!config.mirrorEnabled) {
    issues.push("HB_HOBELISCO_MIRROR_ENABLED deve ser true no deploy LAB espelho.");
  }

  if (config.environment !== "LAB") {
    issues.push("HOBELISCO_ENVIRONMENT deve ser LAB neste deploy.");
  }

  if (!config.labDeploy) {
    issues.push("Defina HB_HOBELISCO_LAB_DEPLOY=true no Vercel Preview/LAB dedicado.");
  }

  if (!config.hobeliscoSupabaseConfigured) {
    issues.push("Configure HB_HOBELISCO_LAB_SUPABASE_URL (projeto Supabase separado de produção).");
  }

  if (!config.persistenceConfigured) {
    recommendations.push(
      "Aplique lab/hobelisco-hx/schema/hb_hobelisco_v2_staging.sql no Supabase LAB e configure SERVICE_ROLE_KEY."
    );
  }

  if (!config.labUiEnabled) {
    recommendations.push("Ative HB_HOBELISCO_LAB_ENABLED=true e NEXT_PUBLIC_HB_HOBELISCO_LAB_ENABLED=true.");
  }

  if (!config.probeCoopCnpj) {
    recommendations.push("Defina HB_HOBELISCO_PROBE_COOP_CNPJ para probes read-only.");
  }

  for (const tripwire of boundary.tripwires.filter((t) => t.severity === "BLOCK")) {
    issues.push(tripwire.message);
  }

  const gates = {
    boundaryClear: boundary.safe && !boundary.productionLocked,
    labEnabled: config.labUiEnabled,
    observerEnabled: isHobeliscoV2ObserverEnabledServer(env),
    notProductionDeploy: !boundary.productionLocked,
    mirrorMarker: config.mirrorEnabled && config.labDeploy,
  };

  const ok =
    gates.boundaryClear &&
    gates.notProductionDeploy &&
    config.mirrorEnabled &&
    config.environment === "LAB" &&
    issues.length === 0;

  return {
    ok,
    phase: "0-foundation",
    mode: "LAB_MIRROR",
    config,
    boundary,
    gates,
    issues,
    recommendations,
  };
}

export function assertHobeliscoLabMirrorReady(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  health: HobeliscoLabMirrorHealth;
} {
  const health = checkHobeliscoLabMirrorHealth(env);
  const boundaryAssert = assertHobeliscoLabBoundary(env);
  return { ok: health.ok && boundaryAssert.ok, health };
}
