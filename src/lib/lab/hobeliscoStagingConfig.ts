/**
 * Configuração e validação — Hobelisco STAGING observe-only
 */

import { loadHobeliscoV2Flags } from "@lab/hobelisco-hx/config";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import { isStagingPersistenceConfigured } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import {
  assertV2ObserveOnlyServer,
  isHobeliscoV2ObserverEnabledServer,
} from "./hobeliscoV2Gate";

export interface StagingObserveConfig {
  environment: string;
  v2Enabled: boolean;
  observeOnly: boolean;
  stagingEnabled: boolean;
  persistenceConfigured: boolean;
  probeCoopCnpj: string | null;
  creditWatchEnabled: boolean;
  activeDefenseEnabled: boolean;
  whatsAppEnabled: boolean;
}

export interface StagingHealthCheck {
  ok: boolean;
  mode: "OBSERVE_ONLY";
  config: StagingObserveConfig;
  gates: {
    observerEnabled: boolean;
    observeOnlyAssert: boolean;
    notProduction: boolean;
    noActiveDefense: boolean;
    noCreditWatchByDefault: boolean;
  };
  issues: string[];
  recommendations: string[];
}

export function loadStagingObserveConfig(env: NodeJS.ProcessEnv = process.env): StagingObserveConfig {
  const flags = loadHobeliscoV2Flags(env);
  return {
    environment: resolveHobeliscoEnvironment(env),
    v2Enabled: flags.v2Enabled,
    observeOnly: flags.observeOnly,
    stagingEnabled: flags.stagingEnabled,
    persistenceConfigured: isStagingPersistenceConfigured(env),
    probeCoopCnpj: env.HB_HOBELISCO_PROBE_COOP_CNPJ?.trim() || null,
    creditWatchEnabled: ["true", "1", "yes"].includes(
      (env.HB_HOBELISCO_CREDIT_WATCH_ENABLED ?? "false").trim().toLowerCase()
    ),
    activeDefenseEnabled: ["true", "1", "yes"].includes(
      (env.HOBELISCO_ACTIVE_DEFENSE_ENABLED ?? "false").trim().toLowerCase()
    ),
    whatsAppEnabled: ["true", "1", "yes"].includes(
      (env.HB_HOBELISCO_WHATSAPP_ENABLED ?? "false").trim().toLowerCase()
    ),
  };
}

export function checkStagingObserveHealth(env: NodeJS.ProcessEnv = process.env): StagingHealthCheck {
  const config = loadStagingObserveConfig(env);
  const issues: string[] = [];
  const recommendations: string[] = [];

  const observerEnabled = isHobeliscoV2ObserverEnabledServer(env);
  const observeOnlyAssert = assertV2ObserveOnlyServer(env).ok;
  const notProduction = config.environment !== "PRODUCTION";
  const noActiveDefense = !config.activeDefenseEnabled;
  const noCreditWatchByDefault = !config.creditWatchEnabled;

  if (!observerEnabled) {
    issues.push("Observer V2 não está ativo — verifique HB_HOBELISCO_V2_ENABLED e HB_HOBELISCO_STAGING_ENABLED");
  }
  if (config.environment !== "STAGING" && config.environment !== "LAB") {
    issues.push(`HOBELISCO_ENVIRONMENT=${config.environment} — use STAGING para piloto observe-only`);
  }
  if (!config.observeOnly) {
    issues.push("HB_HOBELISCO_OBSERVE_ONLY deve ser true");
  }
  if (!config.persistenceConfigured) {
    recommendations.push("Configure HB_HOBELISCO_STAGING_SUPABASE_URL + SERVICE_ROLE_KEY e aplique hb_hobelisco_v2_staging.sql");
  }
  if (config.activeDefenseEnabled) {
    issues.push("HOBELISCO_ACTIVE_DEFENSE_ENABLED deve ser false em staging observe-only");
  }
  if (!config.probeCoopCnpj) {
    recommendations.push("Defina HB_HOBELISCO_PROBE_COOP_CNPJ para probes read-only");
  }

  const gates = {
    observerEnabled,
    observeOnlyAssert,
    notProduction,
    noActiveDefense,
    noCreditWatchByDefault,
  };

  const ok =
    observerEnabled &&
    observeOnlyAssert &&
    notProduction &&
    noActiveDefense &&
    config.observeOnly &&
    issues.length === 0;

  return {
    ok,
    mode: "OBSERVE_ONLY",
    config,
    gates,
    issues,
    recommendations,
  };
}
