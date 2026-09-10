/** Alertas de incidente — notificação humana quando confiança alta */

import { createHash, randomBytes } from "crypto";
import type { HobeliscoPersistence } from "../persistence/HobeliscoPersistence";
import type { HobeliscoIncidentV2 } from "./types";

export const INCIDENT_ALERT_CONFIDENCE_THRESHOLD = 0.7;

export function shouldAlertIncident(incident: HobeliscoIncidentV2): boolean {
  if (incident.confidence < INCIDENT_ALERT_CONFIDENCE_THRESHOLD) return false;
  if (incident.status === "DISMISSED" || incident.status === "CONFIRMED") return false;
  return incident.correlationLevel === "INCIDENT_CANDIDATE" || incident.status === "CORRELATED";
}

function hashAlertBody(kind: string, payload: Record<string, unknown>, at: string): string {
  return createHash("sha256").update(JSON.stringify({ kind, payload, at, previous: null })).digest("hex");
}

export async function emitIncidentAlertIfNeeded(
  persistence: HobeliscoPersistence,
  incident: HobeliscoIncidentV2
): Promise<boolean> {
  if (!shouldAlertIncident(incident)) return false;

  const at = new Date().toISOString();
  const payload = {
    incidentId: incident.incidentId,
    confidence: incident.confidence,
    fingerprint: incident.fingerprint,
    cooperativeId: incident.cooperativeId,
    explanation: incident.explanation,
    humanRequired: true,
    threshold: INCIDENT_ALERT_CONFIDENCE_THRESHOLD,
  };

  await persistence.saveAuditEvent({
    id: `alert_${incident.incidentId}_${randomBytes(4).toString("hex")}`,
    kind: "incident_alert",
    payload,
    eventHash: hashAlertBody("incident_alert", payload, at),
    previousEventHash: null,
    at,
  });

  await notifyWhatsAppIfEnabled(incident);

  return true;
}

async function notifyWhatsAppIfEnabled(incident: HobeliscoIncidentV2): Promise<void> {
  if (process.env.HOBELISCO_ENVIRONMENT?.toUpperCase() === "PRODUCTION") return;
  try {
    const { loadWhatsAppConfig, sendWhatsAppSecurityAlert } = await import("@/lib/lab/hobeliscoWhatsAppAlert");
    const config = loadWhatsAppConfig();
    if (!config.enabled) return;
    const severity =
      incident.confidence >= 0.9 ? "CRITICAL" : incident.confidence >= 0.8 ? "HIGH" : "MEDIUM";
    await sendWhatsAppSecurityAlert(
      {
        title: "Incidente de segurança detectado",
        body: incident.explanation,
        severity,
        incidentId: incident.incidentId,
        cooperativeId: incident.cooperativeId,
        module: "CorrelationEngine",
      },
      config
    );
  } catch {
    /* fail-open — WhatsApp opcional */
  }
}
