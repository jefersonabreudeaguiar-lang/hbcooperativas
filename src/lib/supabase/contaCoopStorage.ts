import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import type {
  ContaCoopDashboard,
  ContaCoopIntent,
  ContaCoopLedgerEntry,
  ContaCoopLimiteCooperado,
  ContaCoopParceiro,
  ContaCoopTresValores,
  ParceiroStatus,
} from "@/modules/hb-credit/types";
import { computeDisponivel, formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { calcLimiteFromPercentual, calcTetoGlobalCents, sumCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { INTENT_EXPIRY_MINUTES } from "@/modules/hb-credit/config";
import {
  intentStatusFromDb,
  intentStatusToDb,
  partnerStatusFromDb,
  partnerStatusToDb,
  receivableStatusFromDb,
} from "@/modules/hb-credit/infrastructure/mappers/statusMapper";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildQrPayload(intentId: string, nonce: string): string {
  return `${"hb-credit"}://pay/${intentId}?nonce=${encodeURIComponent(nonce)}`;
}

export function parseQrPayload(raw: string): { intentId: string; nonce: string } | null {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed) as { scheme?: string; intentId?: string; nonce?: string };
      if (json.scheme === "hb-credit" && json.intentId && json.nonce) {
        return { intentId: json.intentId, nonce: json.nonce };
      }
    }
    const url = trimmed.startsWith("hb-credit://")
      ? new URL(trimmed.replace("hb-credit://", "https://credit.local/"))
      : new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const intentId = parts[parts.length - 1];
    const nonce = url.searchParams.get("nonce") ?? "";
    if (!intentId || !nonce) return null;
    return { intentId, nonce };
  } catch {
    return null;
  }
}

const DEFAULT_TETO_PERCENT = 100;

export async function getOrCreateTetoPercent(
  supabase: SupabaseClient,
  cnpj: string,
  defaultPercent = DEFAULT_TETO_PERCENT
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  const { data, error } = await supabase
    .from("hb_credit_cooperative_caps")
    .select("global_credit_cap_percent")
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  if (error) {
    if (/global_credit_cap_percent/i.test(error.message ?? "")) {
      return defaultPercent;
    }
    throw error;
  }

  if (data) {
    const stored = Number(data.global_credit_cap_percent);
    return stored > 0 ? stored : defaultPercent;
  }

  await supabase.from("hb_credit_cooperative_caps").insert({
    cooperative_cnpj: digits,
    global_credit_cap_cents: 0,
    global_credit_cap_percent: defaultPercent,
  });
  return defaultPercent;
}

export async function resolveTetoGlobal(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number>
): Promise<{ percent: number; cents: number; creditoBaseTotalCents: number }> {
  const percent = await getOrCreateTetoPercent(supabase, cnpj);
  const creditoBaseTotalCents = sumCreditosBaseCents(creditosBaseCents);
  const cents = calcTetoGlobalCents(creditosBaseCents, percent);
  return { percent, cents, creditoBaseTotalCents };
}

/** @deprecated use resolveTetoGlobal */
export async function getOrCreateTeto(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<number> {
  const resolved = await resolveTetoGlobal(supabase, cnpj, creditosBaseCents);
  return resolved.cents;
}

export async function setTetoGlobalPercent(
  supabase: SupabaseClient,
  cnpj: string,
  tetoPercent: number,
  creditosBaseCents: Record<string, number>,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(tetoPercent) || tetoPercent < 0 || tetoPercent > 100) {
    return { ok: false, error: "Informe um percentual entre 0 e 100." };
  }

  const digits = normalizeCnpj(cnpj);
  const distribuido = await sumLimitesDistribuidos(supabase, digits);
  const tetoCents = calcTetoGlobalCents(creditosBaseCents, tetoPercent);

  if (tetoCents < distribuido) {
    return {
      ok: false,
      error: `Teto de ${tetoPercent}% (${formatCentsBRL(tetoCents)}) não pode ser menor que o já distribuído (${formatCentsBRL(distribuido)}).`,
    };
  }

  const row = {
    cooperative_cnpj: digits,
    global_credit_cap_percent: tetoPercent,
    global_credit_cap_cents: tetoCents,
    updated_by: actorUserId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("hb_credit_cooperative_caps").upsert(row);
  if (error && /global_credit_cap_percent/i.test(error.message ?? "")) {
    const { global_credit_cap_percent: _drop, ...legacyRow } = row;
    const retry = await supabase.from("hb_credit_cooperative_caps").upsert(legacyRow);
    if (retry.error) return { ok: false, error: retry.error.message };
  } else if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** @deprecated use setTetoGlobalPercent */
export async function setTetoGlobal(
  supabase: SupabaseClient,
  cnpj: string,
  tetoCentavos: number,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return setTetoGlobalPercent(supabase, cnpj, DEFAULT_TETO_PERCENT, {}, actorUserId);
}

function mensagemUltrapassaTeto(
  tetoPercent: number,
  tetoCents: number,
  totalAposCents: number
): string {
  return `Ultrapassa o teto global (${tetoPercent}% = ${formatCentsBRL(tetoCents)}). Total após liberação: ${formatCentsBRL(totalAposCents)}. Aumente o percentual do teto na aba Painel.`;
}

async function sumLimitesDistribuidos(supabase: SupabaseClient, cnpj: string): Promise<number> {
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("limit_released_cents")
    .eq("cooperative_cnpj", cnpj);
  return (data ?? []).reduce((s, r) => s + Number(r.limit_released_cents), 0);
}

export async function getDashboardResumo(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<ContaCoopDashboard> {
  const digits = normalizeCnpj(cnpj);
  const teto = await resolveTetoGlobal(supabase, digits, creditosBaseCents);
  const { data: limites } = await supabase
    .from("hb_credit_accounts")
    .select("limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits);

  let limiteDistribuido = 0;
  let usadoTotal = 0;
  for (const row of limites ?? []) {
    limiteDistribuido += Number(row.limit_released_cents);
    usadoTotal += Number(row.amount_used_cents);
  }

  const { count: pendentes } = await supabase
    .from("hb_credit_partners")
    .select("*", { count: "exact", head: true })
    .eq("cooperative_cnpj", digits)
    .eq("status", "PENDING");

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count: recentes } = await supabase
    .from("hb_credit_transactions")
    .select("*", { count: "exact", head: true })
    .eq("cooperative_cnpj", digits)
    .gte("created_at", since);

  return {
    teto: {
      tetoGlobalPercent: teto.percent,
      tetoGlobalCents: teto.cents,
      creditoBaseTotalCents: teto.creditoBaseTotalCents,
      limiteDistribuidoCents: limiteDistribuido,
      restanteParaLiberarCents: Math.max(0, teto.cents - limiteDistribuido),
    },
    agregadoCooperados: {
      limiteLiberadoCents: limiteDistribuido,
      valorUsadoCents: usadoTotal,
      valorDisponivelCents: computeDisponivel(limiteDistribuido, usadoTotal),
    },
    parceirosPendentes: pendentes ?? 0,
    transacoesRecentes: recentes ?? 0,
  };
}

export async function listLimitesCooperados(
  supabase: SupabaseClient,
  cnpj: string
): Promise<ContaCoopLimiteCooperado[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .order("updated_at", { ascending: false });

  return (data ?? []).map(mapLimiteRow);
}

function mapLimiteRow(row: Record<string, unknown>): ContaCoopLimiteCooperado {
  const limite = Number(row.limit_released_cents);
  const usado = Number(row.amount_used_cents);
  const status = String(row.status ?? "active");
  return {
    id: String(row.id),
    cooperativaCnpj: String(row.cooperative_cnpj),
    cooperadoId: String(row.cooperado_id),
    limiteLiberadoCents: limite,
    valorUsadoCents: usado,
    valorDisponivelCents: computeDisponivel(limite, usado),
    bloqueado: status === "blocked",
    updatedAt: String(row.updated_at),
  };
}

export async function previewLimiteAlteracao(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  novoLimiteCents: number,
  creditosBaseCents: Record<string, number> = {}
): Promise<{
  atual: ContaCoopTresValores;
  novo: number;
  totalDistribuidoApos: number;
  tetoGlobal: number;
  tetoGlobalPercent: number;
  ok: boolean;
  error?: string;
}> {
  const digits = normalizeCnpj(cnpj);
  const teto = await resolveTetoGlobal(supabase, digits, creditosBaseCents);
  const { data: atualRow } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const atualLimite = atualRow ? Number(atualRow.limit_released_cents) : 0;
  const usado = atualRow ? Number(atualRow.amount_used_cents) : 0;

  if (novoLimiteCents < usado) {
    return {
      atual: { limiteLiberadoCents: atualLimite, valorUsadoCents: usado, valorDisponivelCents: computeDisponivel(atualLimite, usado) },
      novo: novoLimiteCents,
      totalDistribuidoApos: 0,
      tetoGlobal: teto.cents,
      tetoGlobalPercent: teto.percent,
      ok: false,
      error: "Novo limite não pode ser menor que o valor já usado.",
    };
  }

  const distribuido = await sumLimitesDistribuidos(supabase, digits);
  const totalApos = distribuido - atualLimite + novoLimiteCents;

  if (totalApos > teto.cents) {
    return {
      atual: { limiteLiberadoCents: atualLimite, valorUsadoCents: usado, valorDisponivelCents: computeDisponivel(atualLimite, usado) },
      novo: novoLimiteCents,
      totalDistribuidoApos: totalApos,
      tetoGlobal: teto.cents,
      tetoGlobalPercent: teto.percent,
      ok: false,
      error: mensagemUltrapassaTeto(teto.percent, teto.cents, totalApos),
    };
  }

  return {
    atual: { limiteLiberadoCents: atualLimite, valorUsadoCents: usado, valorDisponivelCents: computeDisponivel(atualLimite, usado) },
    novo: novoLimiteCents,
    totalDistribuidoApos: totalApos,
    tetoGlobal: teto.cents,
    tetoGlobalPercent: teto.percent,
    ok: true,
  };
}

export async function setLimiteCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  novoLimiteCents: number,
  actorUserId: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<{ ok: true; limite: ContaCoopLimiteCooperado } | { ok: false; error: string }> {
  const preview = await previewLimiteAlteracao(
    supabase,
    cnpj,
    cooperadoId,
    novoLimiteCents,
    creditosBaseCents
  );
  if (!preview.ok) return { ok: false, error: preview.error! };

  const digits = normalizeCnpj(cnpj);
  const { data: existing } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const usado = existing ? Number(existing.amount_used_cents) : 0;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("hb_credit_accounts")
    .upsert(
      {
        cooperative_cnpj: digits,
        cooperado_id: cooperadoId,
        limit_released_cents: novoLimiteCents,
        amount_used_cents: usado,
        status: existing?.status ?? "active",
        updated_at: now,
        updated_by: actorUserId,
      },
      { onConflict: "cooperative_cnpj,cooperado_id" }
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "LIMIT_CHANGED",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: {
      anterior: preview.atual,
      novo: { limiteLiberadoCents: novoLimiteCents },
    },
  });

  return { ok: true, limite: mapLimiteRow(data as Record<string, unknown>) };
}

export async function setLimiteColetivo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  valorPorCooperadoCents: number,
  actorUserId: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const preview = await previewLimiteColetivo(
    supabase,
    cnpj,
    cooperadoIds,
    valorPorCooperadoCents,
    creditosBaseCents
  );
  if (!preview.ok) return { ok: false, error: preview.error ?? "Prévia recusada." };

  let updated = 0;
  for (const cooperadoId of cooperadoIds) {
    const result = await setLimiteCooperado(
      supabase,
      cnpj,
      cooperadoId,
      valorPorCooperadoCents,
      actorUserId,
      creditosBaseCents
    );
    if (!result.ok) return result;
    updated++;
  }
  return { ok: true, updated };
}

export async function registerParceiro(
  supabase: SupabaseClient,
  input: {
    id: string;
    cooperativaCnpj: string;
    cnpjMercado: string;
    nomeMercado: string;
    email: string;
    appUserId: string;
  }
): Promise<ContaCoopParceiro> {
  const digits = normalizeCnpj(input.cooperativaCnpj);
  const cnpjMercado = normalizeCnpj(input.cnpjMercado);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("hb_credit_partners")
    .insert({
      id: input.id,
      cooperative_cnpj: digits,
      partner_cnpj: cnpjMercado,
      name: input.nomeMercado.trim(),
      email: input.email.trim().toLowerCase(),
      status: "PENDING",
      app_user_id: input.appUserId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapParceiroRow(data as Record<string, unknown>);
}

export async function listParceiros(supabase: SupabaseClient, cnpj: string): Promise<ContaCoopParceiro[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_partners")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => mapParceiroRow(r as Record<string, unknown>));
}

export async function setParceiroStatus(
  supabase: SupabaseClient,
  cnpj: string,
  parceiroId: string,
  status: ParceiroStatus,
  actorUserId: string
): Promise<ContaCoopParceiro | null> {
  const digits = normalizeCnpj(cnpj);
  const { data: before } = await supabase
    .from("hb_credit_partners")
    .select("*")
    .eq("id", parceiroId)
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  const dbStatus = partnerStatusToDb(status);
  const { data, error } = await supabase
    .from("hb_credit_partners")
    .update({ status: dbStatus, updated_at: new Date().toISOString() })
    .eq("id", parceiroId)
    .eq("cooperative_cnpj", digits)
    .select()
    .single();

  if (error || !data) return null;

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: status === "ativo" ? "PARTNER_APPROVED" : "PARTNER_BLOCKED",
    resource_type: "partner",
    resource_id: parceiroId,
    metadata: {
      anterior: before ? { status: partnerStatusFromDb(String(before.status)) } : null,
      novo: { status },
    },
  });

  return mapParceiroRow(data as Record<string, unknown>);
}

function mapParceiroRow(row: Record<string, unknown>): ContaCoopParceiro {
  return {
    id: String(row.id),
    cooperativaCnpj: String(row.cooperative_cnpj),
    cnpjMercado: String(row.partner_cnpj),
    nomeMercado: String(row.name),
    email: String(row.email),
    status: partnerStatusFromDb(String(row.status)),
    appUserId: row.app_user_id ? String(row.app_user_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getLimiteCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<ContaCoopLimiteCooperado | null> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  return data ? mapLimiteRow(data as Record<string, unknown>) : null;
}

export async function setFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  pin: string
): Promise<void> {
  const pinHash = await hashPassword(pin);
  const digits = normalizeCnpj(cnpj);
  await supabase
    .from("hb_credit_accounts")
    .upsert(
      {
        cooperative_cnpj: digits,
        cooperado_id: cooperadoId,
        limit_released_cents: 0,
        amount_used_cents: 0,
        status: "active",
        pin_hash: pinHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cooperative_cnpj,cooperado_id" }
    );
}

export async function verifyFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  pin: string
): Promise<boolean> {
  const limite = await getLimiteCooperado(supabase, cnpj, cooperadoId);
  if (!limite) return false;
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("pin_hash")
    .eq("cooperative_cnpj", normalizeCnpj(cnpj))
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  if (!data?.pin_hash) return false;
  return verifyPassword(pin, String(data.pin_hash));
}

export async function createPaymentIntent(
  supabase: SupabaseClient,
  input: {
    parceiroId: string;
    cooperativaCnpj: string;
    amountCents: number;
    descricao?: string;
  }
): Promise<ContaCoopIntent> {
  const { data: parceiro } = await supabase
    .from("hb_credit_partners")
    .select("*")
    .eq("id", input.parceiroId)
    .maybeSingle();

  if (!parceiro || parceiro.status !== "ACTIVE") {
    throw new Error("Mercado não autorizado a criar cobranças.");
  }

  const id = genId("intent");
  const nonce = genId("nonce");
  const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MINUTES * 60_000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("hb_credit_payment_intents")
    .insert({
      id,
      cooperative_cnpj: normalizeCnpj(input.cooperativaCnpj),
      partner_id: input.parceiroId,
      amount_cents: input.amountCents,
      description: input.descricao?.trim() || null,
      status: "PENDING",
      nonce,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id,
    cooperativaCnpj: String(data.cooperative_cnpj),
    parceiroId: input.parceiroId,
    parceiroNome: String(parceiro.name),
    amountCents: input.amountCents,
    descricao: input.descricao,
    status: "pendente",
    nonce,
    expiresAt,
    createdAt: now,
  };
}

export async function validateIntentForCooperado(
  supabase: SupabaseClient,
  intentId: string,
  nonce: string,
  cooperadoId: string,
  cooperativaCnpj: string
): Promise<
  | { ok: true; intent: ContaCoopIntent; limite: ContaCoopLimiteCooperado; parceiroNome: string }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cooperativaCnpj);
  const { data: intent } = await supabase.from("hb_credit_payment_intents").select("*").eq("id", intentId).maybeSingle();
  if (!intent) return { ok: false, error: "Cobrança não encontrada." };
  if (intent.cooperative_cnpj !== digits) return { ok: false, error: "Cooperativa inválida." };
  if (intent.nonce !== nonce) return { ok: false, error: "QR inválido." };
  if (!["PENDING", "CREATED"].includes(intent.status)) return { ok: false, error: "Cobrança já utilizada." };
  if (new Date(intent.expires_at).getTime() < Date.now()) return { ok: false, error: "Cobrança expirada." };

  const { data: parceiro } = await supabase.from("hb_credit_partners").select("*").eq("id", intent.partner_id).maybeSingle();
  if (!parceiro || parceiro.status !== "ACTIVE") return { ok: false, error: "Mercado bloqueado ou inativo." };

  const limite = await getLimiteCooperado(supabase, digits, cooperadoId);
  if (!limite) return { ok: false, error: "Sem limite Conta Coop." };
  if (limite.bloqueado) return { ok: false, error: "Cooperado bloqueado." };
  if (limite.valorDisponivelCents < Number(intent.amount_cents)) {
    return { ok: false, error: "Limite insuficiente." };
  }

  return {
    ok: true,
    intent: {
      id: intent.id,
      cooperativaCnpj: digits,
      parceiroId: intent.partner_id,
      amountCents: Number(intent.amount_cents),
      descricao: intent.description ?? undefined,
      status: intentStatusFromDb(String(intent.status)),
      nonce: intent.nonce,
      expiresAt: intent.expires_at,
      createdAt: intent.created_at,
    },
    limite,
    parceiroNome: String(parceiro.name),
  };
}

export async function authorizePayment(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    nonce: string;
    cooperadoId: string;
    cooperativaCnpj: string;
    idempotencyKey: string;
    pin: string;
    actorUserId: string;
  }
): Promise<
  | { ok: true; transacaoId: string; receiptCode: string; disponivelAposCents: number; duplicate?: boolean }
  | { ok: false; error: string }
> {
  const pinOk = await verifyFinancialPin(supabase, input.cooperativaCnpj, input.cooperadoId, input.pin);
  if (!pinOk) return { ok: false, error: "PIN financeiro inválido." };

  const transacaoId = genId("tx");
  const recebivelId = genId("recv");
  const receiptCode = genId("receipt").slice(-8).toUpperCase();

  const { data, error } = await supabase.rpc("hb_credit_authorize_payment", {
    p_intent_id: input.intentId,
    p_nonce: input.nonce,
    p_cooperado_id: input.cooperadoId,
    p_cooperative_cnpj: normalizeCnpj(input.cooperativaCnpj),
    p_idempotency_key: input.idempotencyKey,
    p_transaction_id: transacaoId,
    p_receivable_id: recebivelId,
    p_receipt_code: receiptCode,
    p_actor_user_id: input.actorUserId,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration HB Credit não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; error?: string; duplicate?: boolean; transacao_id?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: result?.error ?? "Pagamento recusado." };

  return {
    ok: true,
    transacaoId: result.transacao_id ?? transacaoId,
    receiptCode,
    disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0),
    duplicate: Boolean(result.duplicate),
  };
}

export async function listLedgerCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  limit = 30
): Promise<ContaCoopLedgerEntry[]> {
  const account = await getLimiteCooperado(supabase, cnpj, cooperadoId);
  if (!account) return [];

  const { data } = await supabase
    .from("hb_credit_ledger_entries")
    .select("*")
    .eq("cooperative_cnpj", normalizeCnpj(cnpj))
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const signed = r.direction === "debit" ? -Number(r.amount_cents) : Number(r.amount_cents);
    return {
      id: String(r.id),
      tipo: String(r.entry_type),
      amountCents: signed,
      saldoDisponivelAposCents:
        r.balance_reference_cents != null ? Number(r.balance_reference_cents) : null,
      memo: meta.memo ? String(meta.memo) : null,
      referenceType: "transaction",
      referenceId: String(r.transaction_id),
      createdAt: String(r.created_at),
    };
  });
}

export async function getParceiroByUserId(
  supabase: SupabaseClient,
  appUserId: string
): Promise<ContaCoopParceiro | null> {
  const { data } = await supabase.from("hb_credit_partners").select("*").eq("app_user_id", appUserId).maybeSingle();
  return data ? mapParceiroRow(data as Record<string, unknown>) : null;
}

export async function setCooperadoBloqueado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  bloqueado: boolean,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data: before } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const { error } = await supabase
    .from("hb_credit_accounts")
    .update({
      status: bloqueado ? "blocked" : "active",
      updated_at: new Date().toISOString(),
      updated_by: actorUserId,
    })
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: bloqueado ? "cooperado.blocked" : "cooperado.unblocked",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: {
      anterior: before ? { bloqueado: String(before.status) === "blocked" } : null,
      novo: { bloqueado },
    },
  });

  return { ok: true };
}

export async function previewLimiteColetivo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  valorPorCooperadoCents: number,
  creditosBaseCents: Record<string, number> = {}
): Promise<{
  limiteAtualTotal: number;
  novoLimiteTotal: number;
  totalApos: number;
  tetoGlobal: number;
  tetoGlobalPercent: number;
  ok: boolean;
  error?: string;
}> {
  const digits = normalizeCnpj(cnpj);
  const teto = await resolveTetoGlobal(supabase, digits, creditosBaseCents);
  const distribuido = await sumLimitesDistribuidos(supabase, digits);

  let somaAtualSelecionados = 0;
  for (const cooperadoId of cooperadoIds) {
    const { data } = await supabase
      .from("hb_credit_accounts")
      .select("limit_released_cents")
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", cooperadoId)
      .maybeSingle();
    somaAtualSelecionados += data ? Number(data.limit_released_cents) : 0;
  }

  const totalApos = distribuido - somaAtualSelecionados + cooperadoIds.length * valorPorCooperadoCents;

  if (totalApos > teto.cents) {
    return {
      limiteAtualTotal: distribuido,
      novoLimiteTotal: cooperadoIds.length * valorPorCooperadoCents,
      totalApos,
      tetoGlobal: teto.cents,
      tetoGlobalPercent: teto.percent,
      ok: false,
      error: mensagemUltrapassaTeto(teto.percent, teto.cents, totalApos),
    };
  }

  return {
    limiteAtualTotal: distribuido,
    novoLimiteTotal: cooperadoIds.length * valorPorCooperadoCents,
    totalApos,
    tetoGlobal: teto.cents,
    tetoGlobalPercent: teto.percent,
    ok: true,
  };
}

export type LimiteColetivoPreviewItem = {
  cooperadoId: string;
  creditoBaseCents: number;
  limiteAtualCents: number;
  valorUsadoCents: number;
  novoLimiteCents: number;
  ajustadoPorUso: boolean;
};

async function readLimiteAtualCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<{ limiteAtualCents: number; valorUsadoCents: number }> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  return {
    limiteAtualCents: data ? Number(data.limit_released_cents) : 0,
    valorUsadoCents: data ? Number(data.amount_used_cents) : 0,
  };
}

export async function previewLimiteColetivoPercentual(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  percentual: number,
  creditosBaseCents: Record<string, number>
): Promise<{
  limiteAtualTotal: number;
  novoLimiteTotal: number;
  totalApos: number;
  tetoGlobal: number;
  tetoGlobalPercent: number;
  ok: boolean;
  error?: string;
  percentual: number;
  itens: LimiteColetivoPreviewItem[];
}> {
  const digits = normalizeCnpj(cnpj);
  const teto = await resolveTetoGlobal(supabase, digits, creditosBaseCents);
  const distribuido = await sumLimitesDistribuidos(supabase, digits);

  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    return {
      limiteAtualTotal: distribuido,
      novoLimiteTotal: 0,
      totalApos: distribuido,
      tetoGlobal: teto.cents,
      tetoGlobalPercent: teto.percent,
      ok: false,
      error: "Percentual inválido (use 0 a 100).",
      percentual,
      itens: [],
    };
  }

  if (percentual > teto.percent) {
    return {
      limiteAtualTotal: distribuido,
      novoLimiteTotal: 0,
      totalApos: distribuido,
      tetoGlobal: teto.cents,
      tetoGlobalPercent: teto.percent,
      ok: false,
      error: `Liberação de ${percentual}% ultrapassa o teto global de ${teto.percent}% do crédito na ficha.`,
      percentual,
      itens: [],
    };
  }

  const itens: LimiteColetivoPreviewItem[] = [];
  let somaAtualSelecionados = 0;
  let novoLimiteTotal = 0;

  for (const cooperadoId of cooperadoIds) {
    const creditoBaseCents = Math.max(0, Math.round(Number(creditosBaseCents[cooperadoId] ?? 0)));
    const { limiteAtualCents, valorUsadoCents } = await readLimiteAtualCooperado(supabase, digits, cooperadoId);
    somaAtualSelecionados += limiteAtualCents;

    let novoLimiteCents = calcLimiteFromPercentual(creditoBaseCents, percentual);
    let ajustadoPorUso = false;
    if (novoLimiteCents < valorUsadoCents) {
      novoLimiteCents = valorUsadoCents;
      ajustadoPorUso = true;
    }

    novoLimiteTotal += novoLimiteCents;
    itens.push({
      cooperadoId,
      creditoBaseCents,
      limiteAtualCents,
      valorUsadoCents,
      novoLimiteCents,
      ajustadoPorUso,
    });
  }

  const totalApos = distribuido - somaAtualSelecionados + novoLimiteTotal;

  if (totalApos > teto.cents) {
    return {
      limiteAtualTotal: distribuido,
      novoLimiteTotal,
      totalApos,
      tetoGlobal: teto.cents,
      tetoGlobalPercent: teto.percent,
      ok: false,
      error: mensagemUltrapassaTeto(teto.percent, teto.cents, totalApos),
      percentual,
      itens,
    };
  }

  return {
    limiteAtualTotal: distribuido,
    novoLimiteTotal,
    totalApos,
    tetoGlobal: teto.cents,
    tetoGlobalPercent: teto.percent,
    ok: true,
    percentual,
    itens,
  };
}

export async function setLimiteColetivoPercentual(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  percentual: number,
  creditosBaseCents: Record<string, number>,
  actorUserId: string
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const preview = await previewLimiteColetivoPercentual(
    supabase,
    cnpj,
    cooperadoIds,
    percentual,
    creditosBaseCents
  );
  if (!preview.ok) return { ok: false, error: preview.error ?? "Prévia recusada." };

  let updated = 0;
  for (const item of preview.itens) {
    const result = await setLimiteCooperado(
      supabase,
      cnpj,
      item.cooperadoId,
      item.novoLimiteCents,
      actorUserId,
      creditosBaseCents
    );
    if (!result.ok) return result;
    updated++;
  }
  return { ok: true, updated };
}

export async function cancelPaymentIntent(
  supabase: SupabaseClient,
  intentId: string,
  parceiroId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: intent } = await supabase
    .from("hb_credit_payment_intents")
    .select("*")
    .eq("id", intentId)
    .eq("partner_id", parceiroId)
    .maybeSingle();

  if (!intent) return { ok: false, error: "Cobrança não encontrada." };
  if (!["PENDING", "CREATED"].includes(intent.status)) {
    return { ok: false, error: "Cobrança não pode ser cancelada." };
  }

  const { error } = await supabase
    .from("hb_credit_payment_intents")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", intentId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function refundPayment(
  supabase: SupabaseClient,
  transacaoId: string,
  cooperativaCnpj: string,
  actorUserId: string
): Promise<{ ok: true; disponivelAposCents: number } | { ok: false; error: string }> {
  const refundTxId = genId("tx");
  const refundId = genId("refund");

  const { data, error } = await supabase.rpc("hb_credit_refund_payment", {
    p_transaction_id: transacaoId,
    p_cooperative_cnpj: normalizeCnpj(cooperativaCnpj),
    p_refund_transaction_id: refundTxId,
    p_refund_id: refundId,
    p_actor_user_id: actorUserId,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration HB Credit não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; error?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: result?.error ?? "Estorno recusado." };

  return { ok: true, disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0) };
}

export async function listRecebiveisParceiro(
  supabase: SupabaseClient,
  parceiroId: string,
  limit = 20
): Promise<{ id: string; amountCents: number; status: string; createdAt: string }[]> {
  const { data } = await supabase
    .from("hb_credit_receivables")
    .select("id, amount_cents, status, created_at")
    .eq("partner_id", parceiroId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    amountCents: Number(r.amount_cents),
    status: receivableStatusFromDb(String(r.status)),
    createdAt: String(r.created_at),
  }));
}

export async function listIntentsParceiro(
  supabase: SupabaseClient,
  parceiroId: string,
  limit = 10
): Promise<ContaCoopIntent[]> {
  const { data } = await supabase
    .from("hb_credit_payment_intents")
    .select("*")
    .eq("partner_id", parceiroId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    cooperativaCnpj: String(row.cooperative_cnpj),
    parceiroId: String(row.partner_id),
    amountCents: Number(row.amount_cents),
    descricao: row.description ? String(row.description) : undefined,
    status: intentStatusFromDb(String(row.status)),
    nonce: String(row.nonce),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  }));
}

export async function hasFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("pin_hash")
    .eq("cooperative_cnpj", normalizeCnpj(cnpj))
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  return Boolean(data?.pin_hash);
}
