/**
 * Gera um incidente de demonstração (LAB/staging) — read-only, não altera HB Coop.
 */

import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import { bridgeAuthObservation } from "@lab/hobelisco-hx/observation/SensorBridge";
import {
  getHobeliscoObserver,
  initHobeliscoObserver,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export interface SeedDemoIncidentResult {
  ok: boolean;
  incidentId?: string;
  error?: string;
}

export async function seedHobeliscoDemoIncident(): Promise<SeedDemoIncidentResult> {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return { ok: false, error: "Observer V2 desativado" };
  }

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  if (!observer?.isRunning()) {
    return { ok: false, error: "Observer não está rodando" };
  }

  const env = resolveHobeliscoEnvironment();
  const coop =
    process.env.HB_HOBELISCO_PROBE_COOP_CNPJ?.replace(/\D/g, "") || "62351750000165";
  const demoFp = `demo_lab_auth_burst_${coop}_${Date.now()}`;
  const baseTime = Date.now();

  for (let i = 0; i < 5; i++) {
    const at = new Date(baseTime - (4 - i) * 15_000).toISOString();
    const event = bridgeAuthObservation(env, {
      eventType: "auth_failure",
      cooperativeId: coop,
      actorId: "usuario-demo-lab",
      requestId: `demo-req-${i}`,
      metadata: {
        stableFingerprint: demoFp,
        ip: "203.0.113.42",
        demo: true,
        attempt: i + 1,
      },
    });
    await observer.pipeline.observeFromEvent({
      ...event,
      timestamp: at,
      observedAt: at,
    });
  }

  const incidents = await observer.persistence.listIncidents({ status: "CORRELATED", limit: 10 });
  const match =
    incidents.find((i) => String(i.context.eventType ?? "").includes("auth_failure")) ??
    incidents[0];

  if (!match) {
    return { ok: false, error: "Sinais enviados, mas nenhum candidato correlacionado" };
  }

  return { ok: true, incidentId: match.incidentId };
}
