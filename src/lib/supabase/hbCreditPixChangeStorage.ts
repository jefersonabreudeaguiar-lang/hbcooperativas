import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import { readStoredField } from "@/lib/security/fieldCrypto";
import type { ContaCoopPixChangeRequest } from "@/modules/hb-credit/types";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

type PixChangeStatusDb = "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | "CONSUMED";

function statusFromDb(status: string): ContaCoopPixChangeRequest["status"] {
  if (status === "APPROVED") return "aprovado";
  if (status === "DENIED") return "negado";
  if (status === "CANCELLED") return "cancelado";
  if (status === "CONSUMED") return "consumido";
  return "pendente";
}

function mapRow(row: Record<string, unknown>, partnerNome?: string): ContaCoopPixChangeRequest {
  return {
    id: String(row.id),
    partnerId: String(row.partner_id),
    partnerNome,
    status: statusFromDb(String(row.status)),
    motivo: row.motivo ? String(row.motivo) : null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedByName: row.reviewed_by_name ? String(row.reviewed_by_name) : null,
    reviewNote: row.review_note ? String(row.review_note) : null,
  };
}

export type PartnerPixChangeStatus = {
  pending: boolean;
  unlocked: boolean;
  pendingRequest?: ContaCoopPixChangeRequest | null;
  approvedRequest?: ContaCoopPixChangeRequest | null;
};

export async function getPartnerPixChangeStatus(
  supabase: SupabaseClient,
  partnerId: string
): Promise<PartnerPixChangeStatus> {
  const { data } = await supabase
    .from("hb_credit_partner_pix_change_requests")
    .select("*")
    .eq("partner_id", partnerId)
    .in("status", ["PENDING", "APPROVED"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Record<string, unknown>[];
  const pendingRow = rows.find((r) => String(r.status) === "PENDING");
  const approvedRow = rows.find((r) => String(r.status) === "APPROVED");

  return {
    pending: Boolean(pendingRow),
    unlocked: Boolean(approvedRow),
    pendingRequest: pendingRow ? mapRow(pendingRow) : null,
    approvedRequest: approvedRow ? mapRow(approvedRow) : null,
  };
}

export async function createPartnerPixChangeRequest(
  supabase: SupabaseClient,
  params: {
    partnerId: string;
    cooperativeCnpj: string;
    requestedByUserId?: string;
    motivo?: string;
  }
): Promise<{ ok: true; request: ContaCoopPixChangeRequest } | { ok: false; error: string }> {
  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("id, cooperative_cnpj, pix_key, name")
    .eq("id", params.partnerId)
    .maybeSingle();

  if (!partner) return { ok: false, error: "Mercado não encontrado." };
  if (String(partner.cooperative_cnpj) !== normalizeCnpj(params.cooperativeCnpj)) {
    return { ok: false, error: "Mercado não pertence a esta cooperativa." };
  }
  if (!readStoredField(partner.pix_key as string | undefined)?.trim()) {
    return { ok: false, error: "Cadastre o PIX antes de solicitar mudança." };
  }

  const status = await getPartnerPixChangeStatus(supabase, params.partnerId);
  if (status.pending) return { ok: false, error: "Já existe uma solicitação aguardando a cooperativa." };
  if (status.unlocked) {
    return { ok: false, error: "A cooperativa já liberou a alteração — salve o novo PIX." };
  }

  const id = genId("pixchg");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hb_credit_partner_pix_change_requests")
    .insert({
      id,
      cooperative_cnpj: normalizeCnpj(params.cooperativeCnpj),
      partner_id: params.partnerId,
      motivo: params.motivo?.trim() || null,
      status: "PENDING",
      requested_by_user_id: params.requestedByUserId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Erro ao solicitar mudança." };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: normalizeCnpj(params.cooperativeCnpj),
    actor: params.requestedByUserId ?? params.partnerId,
    action: "PARTNER_PIX_CHANGE_REQUESTED",
    resource_type: "partner_pix_change",
    resource_id: id,
    metadata: { partnerId: params.partnerId },
  });

  return {
    ok: true,
    request: mapRow(data as Record<string, unknown>, String(partner.name)),
  };
}

export async function listPartnerPixChangeRequests(
  supabase: SupabaseClient,
  filters: {
    cooperativeCnpj?: string;
    partnerId?: string;
    status?: ContaCoopPixChangeRequest["status"];
    limit?: number;
  }
): Promise<ContaCoopPixChangeRequest[]> {
  let query = supabase
    .from("hb_credit_partner_pix_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.cooperativeCnpj) {
    query = query.eq("cooperative_cnpj", normalizeCnpj(filters.cooperativeCnpj));
  }
  if (filters.partnerId) query = query.eq("partner_id", filters.partnerId);
  if (filters.status === "pendente") query = query.eq("status", "PENDING");
  if (filters.status === "aprovado") query = query.eq("status", "APPROVED");

  const { data, error } = await query;
  if (error) {
    if (/hb_credit_partner_pix_change_requests/i.test(error.message ?? "")) return [];
    return [];
  }

  const partnerIds = [...new Set((data ?? []).map((r) => String((r as Record<string, unknown>).partner_id)))];
  const partnerNames = new Map<string, string>();
  if (partnerIds.length) {
    const { data: partners } = await supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds);
    for (const p of partners ?? []) {
      partnerNames.set(String(p.id), String(p.name));
    }
  }

  return (data ?? []).map((row) =>
    mapRow(row as Record<string, unknown>, partnerNames.get(String((row as Record<string, unknown>).partner_id)))
  );
}

export async function approvePartnerPixChangeRequest(
  supabase: SupabaseClient,
  params: {
    requestId: string;
    cooperativeCnpj: string;
    reviewerUserId: string;
    reviewerName: string;
  }
): Promise<{ ok: true; request: ContaCoopPixChangeRequest } | { ok: false; error: string }> {
  const { data: row } = await supabase
    .from("hb_credit_partner_pix_change_requests")
    .select("*")
    .eq("id", params.requestId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Solicitação não encontrada." };
  if (String(row.cooperative_cnpj) !== normalizeCnpj(params.cooperativeCnpj)) {
    return { ok: false, error: "Solicitação de outra cooperativa." };
  }
  if (String(row.status) !== "PENDING") return { ok: false, error: "Esta solicitação já foi processada." };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hb_credit_partner_pix_change_requests")
    .update({
      status: "APPROVED",
      reviewed_by_user_id: params.reviewerUserId,
      reviewed_by_name: params.reviewerName,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", params.requestId)
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Erro ao aprovar solicitação." };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: normalizeCnpj(params.cooperativeCnpj),
    actor: params.reviewerUserId,
    action: "PARTNER_PIX_CHANGE_APPROVED",
    resource_type: "partner_pix_change",
    resource_id: params.requestId,
    metadata: { partnerId: String(row.partner_id) },
  });

  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("name")
    .eq("id", String(row.partner_id))
    .maybeSingle();

  return {
    ok: true,
    request: mapRow(data as Record<string, unknown>, partner?.name ? String(partner.name) : undefined),
  };
}

export async function denyPartnerPixChangeRequest(
  supabase: SupabaseClient,
  params: {
    requestId: string;
    cooperativeCnpj: string;
    reviewerUserId: string;
    reviewerName: string;
    reviewNote?: string;
  }
): Promise<{ ok: true; request: ContaCoopPixChangeRequest } | { ok: false; error: string }> {
  const { data: row } = await supabase
    .from("hb_credit_partner_pix_change_requests")
    .select("*")
    .eq("id", params.requestId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Solicitação não encontrada." };
  if (String(row.cooperative_cnpj) !== normalizeCnpj(params.cooperativeCnpj)) {
    return { ok: false, error: "Solicitação de outra cooperativa." };
  }
  if (String(row.status) !== "PENDING") return { ok: false, error: "Esta solicitação já foi processada." };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hb_credit_partner_pix_change_requests")
    .update({
      status: "DENIED",
      reviewed_by_user_id: params.reviewerUserId,
      reviewed_by_name: params.reviewerName,
      review_note: params.reviewNote?.trim() || null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", params.requestId)
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Erro ao negar solicitação." };

  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("name")
    .eq("id", String(row.partner_id))
    .maybeSingle();

  return {
    ok: true,
    request: mapRow(data as Record<string, unknown>, partner?.name ? String(partner.name) : undefined),
  };
}

export async function consumeApprovedPartnerPixChangeRequest(
  supabase: SupabaseClient,
  partnerId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("hb_credit_partner_pix_change_requests")
    .update({ status: "CONSUMED", updated_at: now })
    .eq("partner_id", partnerId)
    .eq("status", "APPROVED");
}

export async function assertPartnerPixEditable(
  supabase: SupabaseClient,
  parceiroId: string,
  existingPixKey?: string | null
): Promise<{ ok: true; isFirstRegistration: boolean } | { ok: false; error: string }> {
  if (!existingPixKey?.trim()) return { ok: true, isFirstRegistration: true };

  const status = await getPartnerPixChangeStatus(supabase, parceiroId);
  if (status.unlocked) return { ok: true, isFirstRegistration: false };
  if (status.pending) {
    return { ok: false, error: "Solicitação de mudança aguardando aprovação da cooperativa." };
  }
  return {
    ok: false,
    error: "PIX já cadastrado. Toque em Solicitar mudança para alterar com autorização da cooperativa.",
  };
}
