import { loadHobeliscoV2Flags } from "@lab/hobelisco-hx/config";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import {
  INCIDENT_ALERT_CONFIDENCE_THRESHOLD,
  shouldAlertIncident,
} from "@lab/hobelisco-hx/observation/IncidentAlertService";
import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import {
  getHobeliscoObserver,
  initHobeliscoObserver,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { isStagingPersistenceConfigured } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import {
  assertV2ObserveOnlyServer,
  isHobeliscoV2ObserverEnabledServer,
} from "@/lib/lab/hobeliscoV2Gate";

export interface HobeliscoAdminOverview {
  enabled: boolean;
  environment: string;
  observeOnly: boolean;
  running: boolean;
  persistence: {
    mode: string;
    connectionStatus: string;
    stagingConfigured: boolean;
  };
  metrics: {
    observationsReceived: number;
    observationsPersisted: number;
    incidentsObserved: number;
    observationIntegrityRate?: number;
  } | null;
  incidents: HobeliscoIncidentV2[];
  pendingCount: number;
  alertCount: number;
  alertThreshold: number;
  humanRequired: true;
}

export async function buildHobeliscoAdminOverview(): Promise<HobeliscoAdminOverview> {
  const enabled = isHobeliscoV2ObserverEnabledServer();
  const environment = resolveHobeliscoEnvironment();
  const observeOnly = assertV2ObserveOnlyServer().ok;
  const alertThreshold = INCIDENT_ALERT_CONFIDENCE_THRESHOLD;

  if (!enabled) {
    return {
      enabled: false,
      environment,
      observeOnly,
      running: false,
      persistence: {
        mode: "none",
        connectionStatus: "DISABLED",
        stagingConfigured: isStagingPersistenceConfigured(),
      },
      metrics: null,
      incidents: [],
      pendingCount: 0,
      alertCount: 0,
      alertThreshold,
      humanRequired: true,
    };
  }

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  const flags = loadHobeliscoV2Flags();
  const persistence = observer?.persistence;
  const incidents = observer ? await observer.persistence.listIncidents({ limit: 40 }) : [];
  const pending = incidents.filter((i) => i.status === "CORRELATED" || i.status === "OBSERVED");
  const alerts = pending.filter(shouldAlertIncident);

  return {
    enabled: true,
    environment,
    observeOnly: observeOnly && flags.observeOnly,
    running: observer?.isRunning() ?? false,
    persistence: {
      mode: persistence?.mode ?? "none",
      connectionStatus: persistence?.connectionStatus ?? "NOT_CONFIGURED",
      stagingConfigured: isStagingPersistenceConfigured(),
    },
    metrics: observer?.getMetrics() ?? null,
    incidents,
    pendingCount: pending.length,
    alertCount: alerts.length,
    alertThreshold,
    humanRequired: true,
  };
}
