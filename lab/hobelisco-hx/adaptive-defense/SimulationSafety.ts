/** Simulation safety — sandbox obrigatório, fail-closed */

export const APPROVED_LAB_TARGETS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "lab-sandbox",
  "test-container",
  "staging-isolated",
  "COOP_LAB_A",
  "COOP_LAB_B",
  "COOP_LAB_001",
  "COOP_LAB_002",
  "COOP_LAB_003",
]);

export interface SimulationSafetyConfig {
  sandbox: boolean;
  egressDenied: boolean;
  environment: string;
  maxDurationMs: number;
  maxRequests: number;
}

export function loadSimulationSafetyConfig(env: NodeJS.ProcessEnv = process.env): SimulationSafetyConfig {
  const environment = (env.HOBELISCO_ENVIRONMENT ?? env.NODE_ENV ?? "LAB").toUpperCase();
  return {
    sandbox: true,
    egressDenied: true,
    environment,
    maxDurationMs: Number.parseInt(env.HB_ADAPTIVE_MAX_DURATION_MS ?? "120000", 10),
    maxRequests: Number.parseInt(env.HB_ADAPTIVE_MAX_REQUESTS ?? "150000", 10),
  };
}

export function assertSimulationAllowed(config: SimulationSafetyConfig): { ok: true } | { ok: false; reason: string } {
  if (config.environment === "PRODUCTION") {
    return { ok: false, reason: "SIMULATION_BLOCKED: production forbidden" };
  }
  if (!config.sandbox) {
    return { ok: false, reason: "SIMULATION_BLOCKED: sandbox=false required" };
  }
  return { ok: true };
}

export function assertTargetAllowed(target: string): { ok: true } | { ok: false; reason: string } {
  const normalized = target.trim().toLowerCase();
  if (APPROVED_LAB_TARGETS.has(target) || APPROVED_LAB_TARGETS.has(normalized)) {
    return { ok: true };
  }
  if (normalized.includes("localhost") || normalized.includes("127.0.0.1")) {
    return { ok: true };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized) && !normalized.startsWith("127.")) {
    return { ok: false, reason: "SIMULATION_BLOCKED: external IP not in allowlist" };
  }
  if (normalized.includes(".com") || normalized.includes(".net") || normalized.includes(".org")) {
    return { ok: false, reason: "SIMULATION_BLOCKED: external domain forbidden" };
  }
  return { ok: true };
}

export function assertEgressDenied(config: SimulationSafetyConfig): { ok: true } | { ok: false; reason: string } {
  if (!config.egressDenied) {
    return { ok: false, reason: "SIMULATION_BLOCKED: egress must be denied" };
  }
  return { ok: true };
}

export function generateCampaignId(): string {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
  return `HB-HARDEN-${ts}-${seq}`;
}
