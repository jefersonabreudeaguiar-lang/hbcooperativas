import { NextResponse } from "next/server";
import { loadWhatsAppConfig, sendWhatsAppSecurityAlert } from "@/lib/lab/hobeliscoWhatsAppAlert";
import { loadAdaptiveDefenseFlags } from "@lab/hobelisco-hx/config";

export const dynamic = "force-dynamic";

/** LAB — testa envio WhatsApp (webhook ou Cloud API) */
export async function POST(request: Request) {
  const flags = loadAdaptiveDefenseFlags();
  if (!flags.enabled && process.env.HOBELISCO_ENVIRONMENT?.toUpperCase() === "PRODUCTION") {
    return NextResponse.json({ ok: false, error: "lab_only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    message?: string;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };

  const config = loadWhatsAppConfig();
  const result = await sendWhatsAppSecurityAlert({
    title: body.title ?? "Teste Hobelisco LAB",
    body: body.message ?? "Alerta de segurança de teste — ambiente LAB.",
    severity: body.severity ?? "HIGH",
    module: "whatsapp-test",
  });

  return NextResponse.json({ ok: result.sent, config: { enabled: config.enabled, mode: config.mode }, result });
}

export async function GET() {
  const config = loadWhatsAppConfig();
  return NextResponse.json({
    enabled: config.enabled,
    mode: config.mode,
    minSeverity: config.minSeverity,
    configured: Boolean(config.webhookUrl || (config.phoneNumberId && config.accessToken && config.to)),
    env: {
      HB_HOBELISCO_WHATSAPP_ENABLED: "false default",
      HB_HOBELISCO_WHATSAPP_MODE: "webhook | cloud_api | disabled",
      HB_HOBELISCO_WHATSAPP_WEBHOOK_URL: "n8n/Zapier webhook",
      HB_HOBELISCO_WHATSAPP_TO: "5511999999999",
      HB_HOBELISCO_WHATSAPP_PHONE_ID: "Cloud API phone id",
      HB_HOBELISCO_WHATSAPP_TOKEN: "Cloud API token",
      HB_HOBELISCO_WHATSAPP_MIN_SEVERITY: "HIGH",
    },
  });
}
