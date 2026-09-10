/** Feature flags HOBELISCO — fail-closed */

import type { HobeliscoFlags, HobeliscoMode } from "./types";

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") return fallback;
  return ["true", "1", "yes"].includes(raw.trim().toLowerCase());
}

function parseMode(raw: string | undefined): HobeliscoMode {
  const v = (raw ?? "observe").trim().toLowerCase();
  if (v === "arena" || v === "canary" || v === "active" || v === "observe") return v;
  return "observe";
}

export function loadHobeliscoFlags(env: NodeJS.ProcessEnv = process.env): HobeliscoFlags {
  const isProd = env.NODE_ENV === "production";
  return {
    enabled: parseBool(env.HOBELISCO_ENABLED, false),
    mode: parseMode(env.HOBELISCO_MODE),
    autoRepair: parseBool(env.HOBELISCO_AUTO_REPAIR, false),
    fortress: parseBool(env.HOBELISCO_FORTRESS, false),
    arena: parseBool(env.HOBELISCO_ARENA, !isProd),
  };
}

export const HOBELISCO_VERSION = "HX-0.2.0-lab-v1";
export const HOBELISCO_V2_VERSION = "HX-0.4.0-v2-hb-coop-observer";
export const HOBELISCO_LAB_ORGANISM_VERSION = "HX-0.4.0-lab-full-organism";
export const HOBELISCO_CLOSURE_VERSION = "HX-0.3.0-LAB-CLOSURE";
export const HOBELISCO_LAB_HARDENED_VERSION = "HX-0.3.1-LAB-HARDENED";
export const HOBELISCO_ADAPTIVE_DEFENSE_VERSION = "HX-0.5.0-LAB-ADAPTIVE-DEFENSE";
export const HOBELISCO_10X_VERSION = "HX-0.6.0-LAB-10X";
export const LAB_ORGANISM_ID = "HOBELISCO-HX-LAB-0001";

/** Limites configuráveis do organismo LAB */
export const LAB_RESOURCE_LIMITS = {
  maxEventsPerPulse: 50,
  maxEventSizeBytes: 8192,
  maxMemoryEntries: 5000,
  maxAuditEntries: 10000,
  maxActionsPerPulse: 20,
  maxRecursionDepth: 8,
  maxArenaSimulations: 100000,
  maxReplayDepth: 500,
} as const;

export interface LabOrganismConfig {
  organismId: string;
  deterministicLab: boolean;
  seed: number | null;
  hibernationPulseThreshold: number;
  circuitBreakerThreshold: number;
}

export function loadLabOrganismConfig(env: NodeJS.ProcessEnv = process.env): LabOrganismConfig {
  const seedRaw = env.HOBELISCO_LAB_SEED?.trim();
  return {
    organismId: env.HOBELISCO_ORGANISM_ID?.trim() || LAB_ORGANISM_ID,
    deterministicLab: parseBool(env.HOBELISCO_DETERMINISTIC_LAB, true),
    seed: seedRaw ? Number.parseInt(seedRaw, 10) : null,
    hibernationPulseThreshold: Number.parseInt(env.HOBELISCO_HIBERNATION_PULSES ?? "10", 10),
    circuitBreakerThreshold: 3,
  };
}

/** Micro-simulações por cenário (100 × 10 = 1000 no total) */
export const ARENA_MICRO_SIMULATIONS_PER_SCENARIO = 100;

export interface HobeliscoV2Flags {
  v2Enabled: boolean;
  observeOnly: boolean;
  stagingEnabled: boolean;
  labEnabled: boolean;
}

export function loadHobeliscoV2Flags(env: NodeJS.ProcessEnv = process.env): HobeliscoV2Flags {
  const isProd = env.NODE_ENV === "production";
  const parse = (key: string, fallback: boolean) => parseBool(env[key], fallback);

  const v2Enabled = parse("HB_HOBELISCO_V2_ENABLED", false);
  const observeOnly = parse("HB_HOBELISCO_OBSERVE_ONLY", true);
  const stagingEnabled = parse("HB_HOBELISCO_STAGING_ENABLED", false);
  const labEnabled = parse("HB_HOBELISCO_LAB_ENABLED", !isProd);

  if (resolveProductionBlock(env)) {
    return { v2Enabled: false, observeOnly: true, stagingEnabled: false, labEnabled: false };
  }

  return { v2Enabled, observeOnly, stagingEnabled, labEnabled };
}

function resolveProductionBlock(env: NodeJS.ProcessEnv): boolean {
  const envName = (env.HOBELISCO_ENVIRONMENT ?? "").toUpperCase();
  if (envName === "PRODUCTION") return true;
  if (env.NODE_ENV === "production" && envName !== "STAGING") return true;
  return false;
}

export interface AdaptiveDefenseFlags {
  enabled: boolean;
  maxScenarios: number;
  defaultSeed: number;
}

export function loadAdaptiveDefenseFlags(env: NodeJS.ProcessEnv = process.env): AdaptiveDefenseFlags {
  const isProd = env.NODE_ENV === "production" && (env.HOBELISCO_ENVIRONMENT ?? "").toUpperCase() !== "STAGING";
  return {
    enabled: parseBool(env.HB_ADAPTIVE_DEFENSE_ENABLED, false) && !isProd,
    maxScenarios: Number.parseInt(env.HB_ADAPTIVE_MAX_SCENARIOS ?? "100000", 10),
    defaultSeed: Number.parseInt(env.HB_ADAPTIVE_SEED ?? "20260909", 10),
  };
}

export interface Hobelisco10xFlags {
  fabricMode: "OFF" | "OBSERVE" | "SHADOW" | "CONTROLLED_BLOCK";
  shadowMode: boolean;
  activeDefenseEnabled: boolean;
  labEnabled: boolean;
}

export function loadHobelisco10xFlags(env: NodeJS.ProcessEnv = process.env): Hobelisco10xFlags {
  const isProd = resolveProductionBlock(env);
  const fabricRaw = (env.HOBELISCO_FABRIC_MODE ?? "OBSERVE").toUpperCase();
  const fabricMode =
    fabricRaw === "SHADOW" || fabricRaw === "CONTROLLED_BLOCK" || fabricRaw === "OFF"
      ? fabricRaw
      : "OBSERVE";
  return {
    fabricMode: isProd ? "OFF" : fabricMode,
    shadowMode: parseBool(env.HOBELISCO_SHADOW_MODE, true) && !isProd,
    activeDefenseEnabled: parseBool(env.HOBELISCO_ACTIVE_DEFENSE_ENABLED, false) && !isProd,
    labEnabled: parseBool(env.HOBELISCO_LAB_ENABLED, !isProd) && !isProd,
  };
}
