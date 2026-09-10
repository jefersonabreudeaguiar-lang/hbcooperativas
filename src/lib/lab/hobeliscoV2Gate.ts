/**
 * Gate HOBELISCO V2 — fail-closed em produção
 * Server-side only
 */

import { loadHobeliscoV2Flags } from "@lab/hobelisco-hx/config";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import { isHobeliscoBoundaryClearForOperation } from "./hobeliscoLabBoundary";

export function isHobeliscoV2ObserverEnabledServer(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isHobeliscoBoundaryClearForOperation(env)) return false;

  const environment = resolveHobeliscoEnvironment(env);
  if (environment === "PRODUCTION") return false;

  const flags = loadHobeliscoV2Flags(env);
  if (!flags.v2Enabled) return false;
  if (!flags.observeOnly) return false;

  if (environment === "STAGING") return flags.stagingEnabled;
  if (environment === "LAB") return flags.labEnabled || env.NODE_ENV !== "production";

  return false;
}

export function assertV2ObserveOnlyServer(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  reason?: string;
} {
  const environment = resolveHobeliscoEnvironment(env);
  if (environment === "PRODUCTION") {
    return { ok: false, reason: "OBSERVER_DISABLED" };
  }
  if (!loadHobeliscoV2Flags(env).observeOnly) {
    return { ok: false, reason: "OBSERVE_ONLY_REQUIRED" };
  }
  return { ok: true };
}
