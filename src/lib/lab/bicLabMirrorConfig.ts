import {
  evaluateBicLabBoundary,
  isBicLabDeploy,
  isBicMirrorMode,
  resolveBicEnvironment,
  type BicBoundaryReport,
} from "./bicLabBoundary";
import { isBicLabB4AuthorityEnabled } from "./bicLabB4Authority";
import { isBicLabFullIntegrationEnabled } from "./bicLabFullIntegration";
import { isBicLabEnabledServer } from "./bicLabGate";
import { BIC_MIRROR_SYNC_PATHS } from "./bicLabMirrorManifest";

export interface BicLabMirrorConfig {
  bicEnvironment: string;
  mirrorEnabled: boolean;
  labDeploy: boolean;
  labUiEnabled: boolean;
  mirrorPathCount: number;
}

export interface BicLabMirrorHealth {
  ok: boolean;
  phase: "B3-envelope" | "B4-lab-authority" | "LAB-FULL" | "B4-pending";
  mode: "LAB_MIRROR";
  config: BicLabMirrorConfig;
  boundary: BicBoundaryReport;
  gates: {
    boundaryClear: boolean;
    labEnabled: boolean;
    notProductionDeploy: boolean;
    mirrorMarker: boolean;
    appNotProductionSupabase: boolean;
  };
  bicEnvelope: {
    m6: boolean;
    m7: boolean;
    m8: boolean;
    tenantGuard: boolean;
    shadowCompare: boolean;
    leituraCentral: boolean;
    b4LabAuthority: boolean;
    labFullIntegration: boolean;
  };
  issues: string[];
  recommendations: string[];
  npmAudit: string[];
}

export function loadBicLabMirrorConfig(env: NodeJS.ProcessEnv = process.env): BicLabMirrorConfig {
  return {
    bicEnvironment: resolveBicEnvironment(env),
    mirrorEnabled: isBicMirrorMode(env),
    labDeploy: isBicLabDeploy(env),
    labUiEnabled: isBicLabEnabledServer(env),
    mirrorPathCount: BIC_MIRROR_SYNC_PATHS.length,
  };
}

export async function checkBicLabMirrorHealth(
  env: NodeJS.ProcessEnv = process.env
): Promise<BicLabMirrorHealth> {
  const config = loadBicLabMirrorConfig(env);
  const boundary = evaluateBicLabBoundary(env);
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (boundary.productionLocked) {
    issues.push("Deploy de produção oficial — BIC LAB espelho não deve rodar aqui.");
  }
  if (!config.mirrorEnabled) {
    issues.push("Defina HB_BIC_MIRROR_ENABLED=true no espelho LAB.");
  }
  if (config.bicEnvironment !== "LAB") {
    issues.push("Defina BIC_ENVIRONMENT=LAB neste deploy.");
  }
  if (!config.labDeploy) {
    issues.push("Defina HB_BIC_LAB_DEPLOY=true no Vercel Preview/LAB dedicado.");
  }
  if (!config.labUiEnabled) {
    recommendations.push("Ative HB_BIC_LAB_ENABLED=true para /lab/bic.");
  }

  const b4 = isBicLabB4AuthorityEnabled(env);
  const full = isBicLabFullIntegrationEnabled(env);
  if (b4 && !full) {
    recommendations.push("Para integração 100% LAB (leitura unificada), defina HB_BIC_LAB_FULL=true.");
  }

  const appProdTripwire = boundary.tripwires.find((t) => t.id === "LAB_APP_POINTS_TO_PRODUCTION_SUPABASE");
  if (appProdTripwire) {
    issues.push(appProdTripwire.message);
    recommendations.push("Copie .env.bic-lab.example → .env.local com Supabase homolog (não produção).");
  }

  const gates = {
    boundaryClear: boundary.safe,
    labEnabled: config.labUiEnabled,
    notProductionDeploy: !boundary.productionLocked,
    mirrorMarker: config.labDeploy,
    appNotProductionSupabase: !appProdTripwire,
  };

  const npmAudit = [
    "npm run test:bic-tenant",
    "npm run test:bic-facade-tenant",
    "npm run test:bic-fallback-observability",
    "npm run test:bic-shadow",
    "npm run test:bic-b3.1-integration",
    "npm run test:cooperado-financeiro",
    "npm run test:h204-orlando-global",
    "npm run test:bic-lab-boundary",
    "npm run test:bic-lab-b4-wiring",
    "npm run test:bic-lab-full-wiring",
    "npm run lab:bic-full-audit",
  ];

  const ok =
    gates.boundaryClear &&
    gates.notProductionDeploy &&
    gates.mirrorMarker &&
    (gates.appNotProductionSupabase || env.NODE_ENV === "development");

  return {
    ok,
    phase: full ? "LAB-FULL" : b4 ? "B4-lab-authority" : "B3-envelope",
    mode: "LAB_MIRROR",
    config,
    boundary,
    gates,
    bicEnvelope: {
      m6: true,
      m7: true,
      m8: true,
      tenantGuard: true,
      shadowCompare: true,
      leituraCentral: true,
      b4LabAuthority: b4,
      labFullIntegration: full,
    },
    issues,
    recommendations,
    npmAudit,
  };
}

export async function assertBicLabMirrorReady(env: NodeJS.ProcessEnv = process.env): Promise<{ ok: boolean }> {
  const health = await checkBicLabMirrorHealth(env);
  return { ok: health.ok };
}
