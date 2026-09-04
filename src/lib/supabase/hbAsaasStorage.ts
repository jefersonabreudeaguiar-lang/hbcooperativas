import type { SupabaseClient } from "@supabase/supabase-js";
import type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";

export type HbAsaasChargeStatus = "draft" | "pending" | "received" | "confirmed" | "cancelled" | "expired";

export interface HbAsaasChargeRow {
  id: string;
  cooperative_cnpj: string;
  charge_key: string;
  periodo_saas_id: string | null;
  mes_referencia_conta_coop: string;
  saas_cooperados_count: number;
  saas_subtotal_cents: number;
  repasse_alloc_count: number;
  repasse_subtotal_cents: number;
  total_cents: number;
  breakdown: HbUnifiedChargeBreakdown;
  asaas_payment_id: string | null;
  asaas_invoice_url: string | null;
  pix_payload: string | null;
  pix_qr_base64: string | null;
  status: HbAsaasChargeStatus;
  saas_confirmed_at: string | null;
  repasse_confirmed_at: string | null;
  paid_at: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAsaasCustomerId(
  supabase: SupabaseClient,
  cooperativeCnpj: string
): Promise<string | null> {
  const { data } = await supabase
    .from("hb_asaas_customers")
    .select("asaas_customer_id")
    .eq("cooperative_cnpj", cooperativeCnpj)
    .maybeSingle();
  return data?.asaas_customer_id ? String(data.asaas_customer_id) : null;
}

export async function upsertAsaasCustomerId(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  asaasCustomerId: string
): Promise<void> {
  await supabase.from("hb_asaas_customers").upsert(
    {
      cooperative_cnpj: cooperativeCnpj,
      asaas_customer_id: asaasCustomerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cooperative_cnpj" }
  );
}

export async function findChargeByKey(
  supabase: SupabaseClient,
  chargeKey: string
): Promise<HbAsaasChargeRow | null> {
  const { data } = await supabase
    .from("hb_asaas_charges")
    .select("*")
    .eq("charge_key", chargeKey)
    .maybeSingle();
  return data ? (data as HbAsaasChargeRow) : null;
}

export async function findChargeById(
  supabase: SupabaseClient,
  id: string
): Promise<HbAsaasChargeRow | null> {
  const { data } = await supabase.from("hb_asaas_charges").select("*").eq("id", id).maybeSingle();
  return data ? (data as HbAsaasChargeRow) : null;
}

export async function findPendingChargeByKey(
  supabase: SupabaseClient,
  chargeKey: string
): Promise<HbAsaasChargeRow | null> {
  const { data } = await supabase
    .from("hb_asaas_charges")
    .select("*")
    .eq("charge_key", chargeKey)
    .in("status", ["draft", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data as HbAsaasChargeRow) : null;
}

export async function findChargeByAsaasPaymentId(
  supabase: SupabaseClient,
  asaasPaymentId: string
): Promise<HbAsaasChargeRow | null> {
  const { data } = await supabase
    .from("hb_asaas_charges")
    .select("*")
    .eq("asaas_payment_id", asaasPaymentId)
    .maybeSingle();
  return data ? (data as HbAsaasChargeRow) : null;
}

export async function insertHbAsaasCharge(
  supabase: SupabaseClient,
  row: Omit<HbAsaasChargeRow, "created_at" | "updated_at" | "saas_confirmed_at" | "repasse_confirmed_at" | "paid_at"> & {
    id?: string;
  }
): Promise<HbAsaasChargeRow | null> {
  const { data, error } = await supabase
    .from("hb_asaas_charges")
    .insert({
      ...row,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return null;
  return data as HbAsaasChargeRow;
}

export async function updateHbAsaasCharge(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<HbAsaasChargeRow>
): Promise<void> {
  await supabase
    .from("hb_asaas_charges")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markWebhookEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
  asaasPaymentId: string | null,
  chargeId: string | null,
  payload: unknown
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("hb_asaas_webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (existing) return false;

  await supabase.from("hb_asaas_webhook_events").insert({
    id: eventId,
    event_type: eventType,
    asaas_payment_id: asaasPaymentId,
    charge_id: chargeId,
    payload,
    processed_at: new Date().toISOString(),
  });
  return true;
}

export async function getLatestChargeForCoop(
  supabase: SupabaseClient,
  cooperativeCnpj: string
): Promise<HbAsaasChargeRow | null> {
  const { data } = await supabase
    .from("hb_asaas_charges")
    .select("*")
    .eq("cooperative_cnpj", cooperativeCnpj)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data as HbAsaasChargeRow) : null;
}
