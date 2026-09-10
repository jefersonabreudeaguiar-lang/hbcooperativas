/**
 * Gate do laboratório HOBELISCO HX — fail-closed em produção.
 */

import {
  evaluateHobeliscoLabBoundary,
  isHobeliscoBoundaryClearForOperation,
} from "./hobeliscoLabBoundary";

const SERVER_FLAG = "HB_HOBELISCO_LAB_ENABLED";
const CLIENT_FLAG = "NEXT_PUBLIC_HB_HOBELISCO_LAB_ENABLED";

const ALLOWED_ON = new Set(["true", "1"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

export function isHobeliscoLabEnabledServer(env: NodeJS.ProcessEnv = process.env): boolean {
  const boundary = evaluateHobeliscoLabBoundary(env);
  if (boundary.productionLocked) return false;
  if (!isHobeliscoBoundaryClearForOperation(env)) return false;

  if (env.NODE_ENV !== "production") return true;
  if (boundary.deployKind === "lab-mirror") return parseFlag(env[SERVER_FLAG]);
  return parseFlag(env[SERVER_FLAG]);
}

export function isHobeliscoLabEnabledClient(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.NEXT_PUBLIC_HB_HOBELISCO_PRODUCTION_LOCK === "true") return false;
  return parseFlag(process.env[CLIENT_FLAG]);
}

export const HOBELISCO_LAB_PATH = "/lab/hobelisco";
