/**
 * Fronteira Hobelisco LAB ↔ Produção — tripwires fail-closed.
 * Impede Hobelisco de operar no deploy oficial ou usar credenciais de produção.
 */

import { resolveHobeliscoEnvironment, type HobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";

export type HobeliscoDeployKind =
  | "production-official"
  | "lab-mirror"
  | "staging-preview"
  | "local-dev";

export type HobeliscoBoundarySeverity = "BLOCK" | "WARN";

export interface HobeliscoBoundaryTripwire {
  id: string;
  severity: HobeliscoBoundarySeverity;
  message: string;
}

export interface HobeliscoBoundaryChecks {
  hobeliscoNotOnProductionDeploy: boolean;
  appAndHobeliscoDbIsolated: boolean;
  noProductionSupabaseRefMatch: boolean;
  mirrorRequiresLabEnvironment: boolean;
  labDeployMarkerPresent: boolean;
  productionFlagsAbsent: boolean;
  dedicatedHobeliscoCredentials: boolean;
}

export interface HobeliscoBoundaryReport {
  deployKind: HobeliscoDeployKind;
  hobeliscoEnvironment: HobeliscoEnvironment;
  safe: boolean;
  productionLocked: boolean;
  mirrorMode: boolean;
  boundaryStrict: boolean;
  phase: "0-foundation";
  tripwires: HobeliscoBoundaryTripwire[];
  checks: HobeliscoBoundaryChecks;
  fingerprint: {
    vercelEnv?: string;
    vercelUrl?: string;
    appSupabaseHost: string | null;
    hobeliscoSupabaseHost: string | null;
    productionRefBlocked: string | null;
  };
  banner: {
    visible: boolean;
    title: string;
    subtitle: string;
    variant: "production-safe" | "lab-active" | "danger";
  };
}

const ALLOWED_ON = new Set(["true", "1", "yes"]);

const HOBELISCO_OPERATION_FLAGS = [
  "HB_HOBELISCO_V2_ENABLED",
  "HB_HOBELISCO_LAB_ENABLED",
  "NEXT_PUBLIC_HB_HOBELISCO_LAB_ENABLED",
  "HB_HOBELISCO_STAGING_ENABLED",
  "HOBELISCO_ACTIVE_DEFENSE_ENABLED",
  "HB_ADAPTIVE_DEFENSE_ENABLED",
  "HOBELISCO_AUTO_REPAIR",
  "HB_HOBELISCO_MIRROR_ENABLED",
  "HB_HOBELISCO_CREDIT_WATCH_ENABLED",
  "HOBELISCO_ENABLED",
] as const;

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

function isInvalidCredentialValue(value?: string): boolean {
  if (!value?.trim()) return true;
  const v = value.trim().toLowerCase();
  return v.includes("<copie") || v.includes("copie de") || v.startsWith("your_");
}

export function extractSupabaseProjectRef(url?: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] ?? host;
  } catch {
    return null;
  }
}

export function readAppSupabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
}

/** URL exclusiva do Hobelisco — nunca deve ser inferida de credenciais de produção em modo espelho. */
export function readHobeliscoPersistenceUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const lab = env.HB_HOBELISCO_LAB_SUPABASE_URL?.trim();
  const staging = env.HB_HOBELISCO_STAGING_SUPABASE_URL?.trim();
  if (!isInvalidCredentialValue(lab)) return lab;
  if (!isInvalidCredentialValue(staging)) return staging;
  return undefined;
}

export function readHobeliscoPersistenceServiceKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const lab = env.HB_HOBELISCO_LAB_SERVICE_ROLE_KEY?.trim();
  const staging = env.HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY?.trim();
  if (!isInvalidCredentialValue(lab)) return lab;
  if (!isInvalidCredentialValue(staging)) return staging;
  return undefined;
}

export function readProductionSupabaseRef(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.HB_HOBELISCO_PRODUCTION_SUPABASE_REF?.trim();
  if (explicit) return explicit.toLowerCase();
  return extractSupabaseProjectRef(readAppSupabaseUrl(env));
}

export function isHobeliscoMirrorMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseFlag(env.HB_HOBELISCO_MIRROR_ENABLED);
}

export function isHobeliscoBoundaryStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFlag(env.HB_HOBELISCO_BOUNDARY_STRICT)) return true;
  if (isHobeliscoMirrorMode(env)) return true;
  if (parseFlag(env.HB_HOBELISCO_LAB_DEPLOY)) return true;
  return false;
}

export function isHobeliscoLabDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseFlag(env.HB_HOBELISCO_LAB_DEPLOY) || isHobeliscoMirrorMode(env);
}

export function resolveHobeliscoDeployKind(env: NodeJS.ProcessEnv = process.env): HobeliscoDeployKind {
  const hobeliscoEnv = resolveHobeliscoEnvironment(env);
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();

  if (env.NODE_ENV !== "production") return "local-dev";

  if (isHobeliscoLabDeploy(env) && hobeliscoEnv === "LAB") {
    return "lab-mirror";
  }

  if (hobeliscoEnv === "STAGING" || (vercelEnv === "preview" && parseFlag(env.HB_HOBELISCO_STAGING_ENABLED))) {
    return "staging-preview";
  }

  if (vercelEnv === "production" || hobeliscoEnv === "PRODUCTION") {
    return "production-official";
  }

  if (hobeliscoEnv === "LAB") return "lab-mirror";

  return "production-official";
}

export function listActiveHobeliscoFlags(env: NodeJS.ProcessEnv = process.env): string[] {
  return HOBELISCO_OPERATION_FLAGS.filter((key) => parseFlag(env[key]));
}

/** Evolução/auto-repair nunca promove alterações para produção — contrato explícito Fase 0+. */
export function neverPromoteToProduction(): never {
  throw new Error("HOBELISCO_NEVER_PROMOTE_TO_PRODUCTION");
}

export function assertNeverPromoteToProduction(): { ok: false; reason: "NEVER_PROMOTE" } {
  return { ok: false, reason: "NEVER_PROMOTE" };
}

export function evaluateHobeliscoLabBoundary(env: NodeJS.ProcessEnv = process.env): HobeliscoBoundaryReport {
  const hobeliscoEnvironment = resolveHobeliscoEnvironment(env);
  const deployKind = resolveHobeliscoDeployKind(env);
  const mirrorMode = isHobeliscoMirrorMode(env);
  const boundaryStrict = isHobeliscoBoundaryStrict(env);
  const tripwires: HobeliscoBoundaryTripwire[] = [];

  const appSupabaseHost = extractSupabaseProjectRef(readAppSupabaseUrl(env));
  const hobeliscoSupabaseHost = extractSupabaseProjectRef(readHobeliscoPersistenceUrl(env));
  const productionRefBlocked = readProductionSupabaseRef(env);
  const activeFlags = listActiveHobeliscoFlags(env);
  const labDeployMarkerPresent = isHobeliscoLabDeploy(env);

  const productionLocked = deployKind === "production-official";

  if (productionLocked && activeFlags.length > 0) {
    tripwires.push({
      id: "PRODUCTION_FLAGS_DETECTED",
      severity: "BLOCK",
      message: `Deploy oficial com flags Hobelisco ativas: ${activeFlags.join(", ")}`,
    });
  }

  if (productionLocked && hobeliscoEnvironment !== "PRODUCTION") {
    tripwires.push({
      id: "PRODUCTION_ENV_MISMATCH",
      severity: "WARN",
      message: "Deploy oficial deve manter HOBELISCO_ENVIRONMENT=PRODUCTION (ou ausente).",
    });
  }

  if (mirrorMode && hobeliscoEnvironment !== "LAB") {
    tripwires.push({
      id: "MIRROR_REQUIRES_LAB",
      severity: "BLOCK",
      message: "HB_HOBELISCO_MIRROR_ENABLED exige HOBELISCO_ENVIRONMENT=LAB.",
    });
  }

  if (deployKind === "lab-mirror" && !labDeployMarkerPresent) {
    tripwires.push({
      id: "LAB_DEPLOY_MARKER_MISSING",
      severity: "BLOCK",
      message: "Deploy LAB exige HB_HOBELISCO_LAB_DEPLOY=true ou HB_HOBELISCO_MIRROR_ENABLED=true.",
    });
  }

  if (boundaryStrict && !readHobeliscoPersistenceUrl(env)) {
    tripwires.push({
      id: "DEDICATED_HOBELISCO_DB_REQUIRED",
      severity: "BLOCK",
      message:
        "Configure HB_HOBELISCO_LAB_SUPABASE_URL (+ SERVICE_ROLE_KEY) — fallback para produção desabilitado.",
    });
  }

  if (
    hobeliscoSupabaseHost &&
    productionRefBlocked &&
    hobeliscoSupabaseHost === productionRefBlocked
  ) {
    tripwires.push({
      id: "PRODUCTION_SUPABASE_REF_MATCH",
      severity: boundaryStrict || deployKind === "lab-mirror" ? "BLOCK" : "WARN",
      message: "Credencial Hobelisco aponta para o mesmo projeto Supabase de produção.",
    });
  }

  if (
    appSupabaseHost &&
    hobeliscoSupabaseHost &&
    appSupabaseHost === hobeliscoSupabaseHost &&
    (boundaryStrict || deployKind === "lab-mirror")
  ) {
    tripwires.push({
      id: "APP_AND_HOBELISCO_DB_SAME",
      severity: "BLOCK",
      message: "App e Hobelisco compartilham o mesmo Supabase — isolamento obrigatório no espelho LAB.",
    });
  }

  const dedicatedHobeliscoCredentials = Boolean(
    readHobeliscoPersistenceUrl(env) && readHobeliscoPersistenceServiceKey(env)
  );

  const checks: HobeliscoBoundaryChecks = {
    hobeliscoNotOnProductionDeploy: productionLocked && activeFlags.length === 0,
    appAndHobeliscoDbIsolated:
      !appSupabaseHost ||
      !hobeliscoSupabaseHost ||
      appSupabaseHost !== hobeliscoSupabaseHost,
    noProductionSupabaseRefMatch:
      !hobeliscoSupabaseHost ||
      !productionRefBlocked ||
      hobeliscoSupabaseHost !== productionRefBlocked,
    mirrorRequiresLabEnvironment: !mirrorMode || hobeliscoEnvironment === "LAB",
    labDeployMarkerPresent: deployKind !== "lab-mirror" || labDeployMarkerPresent,
    productionFlagsAbsent: !productionLocked || activeFlags.length === 0,
    dedicatedHobeliscoCredentials,
  };

  const blockingTripwires = tripwires.filter((t) => t.severity === "BLOCK");
  const safe =
    !productionLocked &&
    blockingTripwires.length === 0 &&
    checks.mirrorRequiresLabEnvironment &&
    checks.labDeployMarkerPresent &&
    (deployKind === "local-dev" || checks.dedicatedHobeliscoCredentials);

  let banner: HobeliscoBoundaryReport["banner"];
  if (productionLocked) {
    banner = {
      visible: true,
      title: "Produção oficial — Hobelisco desligado",
      subtitle: "Nenhuma ação automática do Hobelisco ocorre neste deploy.",
      variant: "production-safe",
    };
  } else if (blockingTripwires.length > 0) {
    banner = {
      visible: true,
      title: "Fronteira LAB/Produção violada",
      subtitle: blockingTripwires[0]?.message ?? "Corrija variáveis antes de ativar o Hobelisco.",
      variant: "danger",
    };
  } else {
    banner = {
      visible: true,
      title: "AMBIENTE LAB — espelho isolado",
      subtitle: "Hobelisco opera somente aqui. Produção real permanece intocável.",
      variant: "lab-active",
    };
  }

  return {
    deployKind,
    hobeliscoEnvironment,
    safe,
    productionLocked,
    mirrorMode,
    boundaryStrict,
    phase: "0-foundation",
    tripwires,
    checks,
    fingerprint: {
      vercelEnv: env.VERCEL_ENV,
      vercelUrl: env.VERCEL_URL,
      appSupabaseHost,
      hobeliscoSupabaseHost,
      productionRefBlocked,
    },
    banner,
  };
}

export function assertHobeliscoLabBoundary(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  report: HobeliscoBoundaryReport;
} {
  const report = evaluateHobeliscoLabBoundary(env);
  return { ok: report.safe && !report.productionLocked, report };
}

/** Gate central — Hobelisco só opera se a fronteira estiver verde. */
export function isHobeliscoBoundaryClearForOperation(env: NodeJS.ProcessEnv = process.env): boolean {
  const report = evaluateHobeliscoLabBoundary(env);
  if (report.productionLocked) return false;
  return report.safe;
}

/** Tripwire de boot em deploy oficial — não lança, só retorna alertas para log/admin. */
export function assertProductionHobeliscoDisabled(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  violations: string[];
} {
  const report = evaluateHobeliscoLabBoundary(env);
  if (!report.productionLocked) {
    return { ok: true, violations: [] };
  }
  const violations = report.tripwires.filter((t) => t.severity === "BLOCK").map((t) => t.message);
  return { ok: violations.length === 0, violations };
}
