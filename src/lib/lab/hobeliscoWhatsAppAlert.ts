/**
 * WhatsApp alert channel — LAB only, fail-closed em produção.
 * Suporta webhook genérico (n8n/Zapier) ou WhatsApp Cloud API.
 */

export type WhatsAppMode = "disabled" | "webhook" | "cloud_api";

export interface WhatsAppConfig {
  enabled: boolean;
  mode: WhatsAppMode;
  webhookUrl: string | null;
  to: string | null;
  phoneNumberId: string | null;
  accessToken: string | null;
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SecurityAlertMessage {
  title: string;
  body: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  incidentId?: string;
  cooperativeId?: string | null;
  module?: string;
}

const SECRET_PATTERN = /password|token|jwt|secret|bearer\s+/i;

export function loadWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const isProd = env.NODE_ENV === "production" && (env.HOBELISCO_ENVIRONMENT ?? "").toUpperCase() !== "STAGING";
  const enabled = !isProd && ["true", "1", "yes"].includes((env.HB_HOBELISCO_WHATSAPP_ENABLED ?? "false").trim().toLowerCase());
  const modeRaw = (env.HB_HOBELISCO_WHATSAPP_MODE ?? "disabled").trim().toLowerCase();
  const mode: WhatsAppMode = modeRaw === "webhook" || modeRaw === "cloud_api" ? modeRaw : "disabled";

  return {
    enabled,
    mode: enabled ? mode : "disabled",
    webhookUrl: env.HB_HOBELISCO_WHATSAPP_WEBHOOK_URL?.trim() || null,
    to: env.HB_HOBELISCO_WHATSAPP_TO?.trim() || null,
    phoneNumberId: env.HB_HOBELISCO_WHATSAPP_PHONE_ID?.trim() || null,
    accessToken: env.HB_HOBELISCO_WHATSAPP_TOKEN?.trim() || null,
    minSeverity: (env.HB_HOBELISCO_WHATSAPP_MIN_SEVERITY?.toUpperCase() as WhatsAppConfig["minSeverity"]) || "HIGH",
  };
}

function severityRank(s: SecurityAlertMessage["severity"]): number {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s];
}

function sanitizeText(text: string): string {
  if (SECRET_PATTERN.test(text)) return "[REDACTED]";
  return text.slice(0, 900);
}

export function formatWhatsAppMessage(alert: SecurityAlertMessage): string {
  const lines = [
    `🛡️ *Hobelisco LAB*`,
    `*${sanitizeText(alert.title)}*`,
    `Severidade: ${alert.severity}`,
    alert.module ? `Módulo: ${alert.module}` : "",
    alert.cooperativeId ? `Coop: ${alert.cooperativeId}` : "",
    alert.incidentId ? `Incidente: ${alert.incidentId}` : "",
    "",
    sanitizeText(alert.body),
    "",
    `_Ambiente LAB — não altera produção_`,
  ].filter(Boolean);
  return lines.join("\n");
}

export interface WhatsAppSendResult {
  sent: boolean;
  skipped?: string;
  error?: string;
  channel: WhatsAppMode;
}

export async function sendWhatsAppSecurityAlert(
  alert: SecurityAlertMessage,
  config: WhatsAppConfig = loadWhatsAppConfig()
): Promise<WhatsAppSendResult> {
  if (!config.enabled) return { sent: false, skipped: "whatsapp_disabled", channel: "disabled" };
  if (severityRank(alert.severity) < severityRank(config.minSeverity)) {
    return { sent: false, skipped: "below_min_severity", channel: config.mode };
  }
  if (config.mode === "disabled") return { sent: false, skipped: "mode_disabled", channel: "disabled" };

  const text = formatWhatsAppMessage(alert);

  try {
    if (config.mode === "webhook") {
      if (!config.webhookUrl) return { sent: false, skipped: "missing_webhook_url", channel: "webhook" };
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "hobelisco_lab",
          to: config.to,
          message: text,
          severity: alert.severity,
          incidentId: alert.incidentId ?? null,
        }),
      });
      if (!res.ok) return { sent: false, error: `webhook_${res.status}`, channel: "webhook" };
      return { sent: true, channel: "webhook" };
    }

    if (config.mode === "cloud_api") {
      if (!config.phoneNumberId || !config.accessToken || !config.to) {
        return { sent: false, skipped: "missing_cloud_api_config", channel: "cloud_api" };
      }
      const url = `https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: config.to.replace(/\D/g, ""),
          type: "text",
          text: { body: text },
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { sent: false, error: `cloud_api_${res.status}:${err.slice(0, 120)}`, channel: "cloud_api" };
      }
      return { sent: true, channel: "cloud_api" };
    }

    return { sent: false, skipped: "unknown_mode", channel: config.mode };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send_failed", channel: config.mode };
  }
}
