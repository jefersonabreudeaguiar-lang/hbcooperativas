import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { getAsaasConfig } from "@/lib/asaas/config";
import type { AsaasWebhookPayload } from "@/lib/asaas/types";
import { processAsaasWebhookPayment } from "@/services/hbAsaasChargeService";

export async function POST(request: Request) {
  const config = getAsaasConfig();
  if (!config) {
    return NextResponse.json({ error: "Asaas não configurado." }, { status: 503 });
  }

  if (config.webhookToken) {
    const token = request.headers.get("asaas-access-token");
    if (token !== config.webhookToken) {
      return NextResponse.json({ error: "Token de webhook inválido." }, { status: 401 });
    }
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = (await request.json()) as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ received: true, warning: "Supabase offline" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ received: true, warning: "Supabase client offline" });
  }

  const result = await processAsaasWebhookPayment(supabase, payload);
  if (!result.ok && !result.duplicate) {
    console.error("[asaas/webhook]", result.error);
  }

  return NextResponse.json({ received: true, ok: result.ok, duplicate: result.duplicate ?? false });
}
