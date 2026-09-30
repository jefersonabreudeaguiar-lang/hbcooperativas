/**
 * Fronteira BIC LAB ↔ produção oficial — fail-closed.
 * BIC integrado na UI só é exposto em /lab/bic e operações de ensaio com flags LAB.
 */

import {
  extractSupabaseProjectRef,
  PRODUCTION_SUPABASE_PROJECT_REFS,
} from "@/lib/lab/bicProductionRefs";

export type BicDeployKind =
  | "production-official"
  | "lab-mirror"
  | "local-dev";

export type BicBoundarySeverity = "BLOCK" | "WARN";

export interface BicBoundaryTripwire {
  id: string;
  severity: BicBoundarySeverity;
  message: string;
}

export interface BicBoundaryReport {
  deployKind: BicDeployKind;
  bicEnvironment: "LAB" | "UNSET";
  safe: boolean;
  productionLocked: boolean;
  mirrorMode: boolean;
  tripwires: BicBoundaryTripwire[];
  fingerprint: {
    vercelEnv?: string;
    appSupabaseRef: string | null;
    productionRefsBlocked: readonly string[];
  };
  banner: {
    title: string;
    subtitle: string;
    variant: "production-safe" | "lab-active" | "danger";
  };
}

const ALLOWED_ON = new Set(["true", "1", "yes"]);

const BIC_LAB_FLAGS = [
  "HB_BIC_LAB_ENABLED",
  "NEXT_PUBLIC_HB_BIC_LAB_ENABLED",
  "HB_BIC_MIRROR_ENABLED",
  "HB_BIC_LAB_DEPLOY",
] as const;

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

export function readAppSupabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
}

export function isBicMirrorMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseFlag(env.HB_BIC_MIRROR_ENABLED);
}

export function isBicLabDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseFlag(env.HB_BIC_LAB_DEPLOY) || isBicMirrorMode(env);
}

export function resolveBicEnvironment(env: NodeJS.ProcessEnv = process.env): "LAB" | "UNSET" {
  const raw = (env.BIC_ENVIRONMENT ?? "").trim().toUpperCase();
  if (raw === "LAB") return "LAB";
  return "UNSET";
}

export function resolveBicDeployKind(env: NodeJS.ProcessEnv = process.env): BicDeployKind {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  const bicEnv = resolveBicEnvironment(env);

  if (vercelEnv === "production") {
    return "production-official";
  }

  if (env.NODE_ENV !== "production") {
    return isBicLabDeploy(env) ? "lab-mirror" : "local-dev";
  }

  if (isBicLabDeploy(env) && bicEnv === "LAB") {
    return "lab-mirror";
  }

  if (isBicLabDeploy(env)) return "lab-mirror";

  return "production-official";
}

export function listActiveBicLabFlags(env: NodeJS.ProcessEnv = process.env): string[] {
  return BIC_LAB_FLAGS.filter((key) => parseFlag(env[key]));
}

export function isAppSupabaseProductionRef(env: NodeJS.ProcessEnv = process.env): boolean {
  const ref = extractSupabaseProjectRef(readAppSupabaseUrl(env));
  if (!ref) return false;
  return (PRODUCTION_SUPABASE_PROJECT_REFS as readonly string[]).includes(ref);
}

export function evaluateBicLabBoundary(env: NodeJS.ProcessEnv = process.env): BicBoundaryReport {
  const deployKind = resolveBicDeployKind(env);
  const bicEnvironment = resolveBicEnvironment(env);
  const mirrorMode = isBicMirrorMode(env);
  const tripwires: BicBoundaryTripwire[] = [];
  const appSupabaseRef = extractSupabaseProjectRef(readAppSupabaseUrl(env));
  const productionLocked = deployKind === "production-official";
  const activeFlags = listActiveBicLabFlags(env);

  if (productionLocked && activeFlags.length > 0) {
    tripwires.push({
      id: "PRODUCTION_BIC_LAB_FLAGS",
      severity: "BLOCK",
      message: `Deploy oficial com flags BIC LAB ativas: ${activeFlags.join(", ")}`,
    });
  }

  if (mirrorMode && bicEnvironment !== "LAB") {
    tripwires.push({
      id: "MIRROR_REQUIRES_BIC_LAB_ENV",
      severity: "BLOCK",
      message: "HB_BIC_MIRROR_ENABLED exige BIC_ENVIRONMENT=LAB.",
    });
  }

  if (deployKind === "lab-mirror" && !isBicLabDeploy(env)) {
    tripwires.push({
      id: "LAB_DEPLOY_MARKER_MISSING",
      severity: "BLOCK",
      message: "Deploy LAB BIC exige HB_BIC_LAB_DEPLOY=true ou HB_BIC_MIRROR_ENABLED=true.",
    });
  }

  if (isBicLabDeploy(env) && isAppSupabaseProductionRef(env)) {
    tripwires.push({
      id: "LAB_APP_POINTS_TO_PRODUCTION_SUPABASE",
      severity: "BLOCK",
      message:
        "Espelho LAB não deve usar NEXT_PUBLIC_SUPABASE_URL de produção. Use projeto homolog separado ou ensaios in-memory.",
    });
  }

  const blocking = tripwires.filter((t) => t.severity === "BLOCK");
  const safe = blocking.length === 0;

  let banner: BicBoundaryReport["banner"];
  if (productionLocked) {
    banner = {
      title: "Produção oficial — BIC LAB desligado",
      subtitle: "Painéis /lab/bic e ensaios cloud BIC não rodam no app oficial.",
      variant: "production-safe",
    };
  } else if (safe && isBicLabDeploy(env)) {
    banner = {
      title: "BIC — Laboratório espelho",
      subtitle: "Projeção read-only; legado continua autoridade factual.",
      variant: "lab-active",
    };
  } else {
    banner = {
      title: "Fronteira BIC LAB — revisar env",
      subtitle: tripwires.map((t) => t.message).join(" | ") || "Configuração incompleta.",
      variant: "danger",
    };
  }

  return {
    deployKind,
    bicEnvironment,
    safe,
    productionLocked,
    mirrorMode,
    tripwires,
    fingerprint: {
      vercelEnv: env.VERCEL_ENV,
      appSupabaseRef,
      productionRefsBlocked: PRODUCTION_SUPABASE_PROJECT_REFS,
    },
    banner,
  };
}

export function isBicBoundaryClearForLabOperation(env: NodeJS.ProcessEnv = process.env): boolean {
  const report = evaluateBicLabBoundary(env);
  if (report.productionLocked) return false;
  return report.safe;
}
