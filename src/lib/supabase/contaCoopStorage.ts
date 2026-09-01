import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import type {
  ContaCoopCooperadoLiquidacao,
  ContaCoopCompraEstornavel,
  ContaCoopDashboard,
  ContaCoopDashboardLancamentosMes,
  ContaCoopAppRepasse,
  ContaCoopAppRepassePreview,
  ContaCoopIntent,
  ContaCoopLedgerEntry,
  ContaCoopLimiteCooperado,
  ContaCoopLiquidacaoPreview,
  ContaCoopParceiro,
  ContaCoopSettlement,
  ContaCoopSettlementTransacao,
  ContaCoopSolicitacaoEstorno,
  ContaCoopDiscountPoolResumo,
  ContaCoopDiscountAllocation,
  ContaCoopTresValores,
  SolicitacaoEstornoStatus,
  ParceiroStatus,
  SettlementStatus,
  IntentStatus,
} from "@/modules/hb-credit/types";
import { computeDisponivel, formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { calcLimiteFromPercentual, calcTetoGlobalCents, sumCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { INTENT_EXPIRY_MINUTES } from "@/modules/hb-credit/config";
import { getCurrentMesReferencia } from "@/utils/format";
import { decryptSensitiveField, encryptSensitiveField } from "@/lib/security/fieldCrypto";
import {
  intentStatusFromDb,
  intentStatusToDb,
  partnerStatusFromDb,
  partnerStatusToDb,
  receivableStatusFromDb,
} from "@/modules/hb-credit/infrastructure/mappers/statusMapper";
import { humanizeCreditRefundError } from "@/lib/supabase/hbCreditRefundFixSchema";
import { TERMO_MERCADO_CONTA_COOP_VERSAO } from "@/config/termoUsoMercadoContaCoop";

/** Recebíveis em liquidação ou já pagos ao mercado não podem ser estornados. */
const NON_REFUNDABLE_RECEIVABLE_DB = new Set(["PROCESSING", "SETTLED"]);

function isReceivableRefundableDbStatus(dbStatus: string | undefined): boolean {
  if (!dbStatus) return true;
  return !NON_REFUNDABLE_RECEIVABLE_DB.has(dbStatus);
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

function secureNonce(): string {
  return randomBytes(16).toString("hex");
}

function protectStoredField(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return encryptSensitiveField(value.trim());
}

function readStoredField(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return decryptSensitiveField(value.trim());
}

export function buildQrPayload(intentId: string, nonce: string): string {
  return `${"hb-credit"}://pay/${intentId}?nonce=${encodeURIComponent(nonce)}`;
}

export function parseQrPayload(raw: string): { intentId: string; nonce: string } | null {
  const trimmed = raw.replace(/\uFEFF/g, "").trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed) as { scheme?: string; intentId?: string; nonce?: string };
      if (json.scheme === "hb-credit" && json.intentId && json.nonce) {
        return { intentId: json.intentId, nonce: decodeURIComponent(json.nonce) };
      }
    }

    let urlLike = trimmed;
    if (trimmed.startsWith("hb-credit://")) {
      urlLike = trimmed.replace("hb-credit://", "https://credit.local/");
    } else if (!trimmed.includes("://") && trimmed.includes("nonce=")) {
      urlLike = `https://credit.local/${trimmed.replace(/^\/*/, "")}`;
    }

    const url = new URL(urlLike);
    const parts = url.pathname.split("/").filter(Boolean);
    const intentId = parts[parts.length - 1];
    const nonceRaw = url.searchParams.get("nonce") ?? "";
    const nonce = decodeURIComponent(nonceRaw);
    if (!intentId || !nonce) return null;
    return { intentId, nonce };
  } catch {
    return null;
  }
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

export const TETO_NAO_CONFIGURADO =
  "Configuração financeira da cooperativa ausente. Defina o teto percentual na aba Painel antes de liberar crédito.";

/** Lê percentual configurado — fail-closed: não cria fallback nem auto-insert. */
export async function getTetoPercentConfigured(
  supabase: SupabaseClient,
  cnpj: string
): Promise<number | null> {
  const digits = normalizeCnpj(cnpj);
  const { data, error } = await supabase
    .from("hb_credit_cooperative_caps")
    .select("global_credit_cap_percent")
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  if (error) {
    if (/global_credit_cap_percent/i.test(error.message ?? "")) {
      return null;
    }
    throw error;
  }

  if (!data) return null;

  const stored = Number(data.global_credit_cap_percent);
  if (!Number.isFinite(stored) || stored <= 0 || stored > 100) {
    return null;
  }

  return stored;
}

/** @deprecated leitura legada — não usar para novas liberações */
export async function getOrCreateTetoPercent(
  supabase: SupabaseClient,
  cnpj: string,
  _defaultPercent?: number
): Promise<number | null> {
  return getTetoPercentConfigured(supabase, cnpj);
}

export async function resolveTetoGlobal(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number>,
  options?: { allowUnconfigured?: boolean }
): Promise<
  | { configured: true; percent: number; cents: number; creditoBaseTotalCents: number }
  | { configured: false; error: string }
> {
  const percent = await getTetoPercentConfigured(supabase, cnpj);
  if (percent == null) {
    if (options?.allowUnconfigured) {
      return {
        configured: false,
        error: TETO_NAO_CONFIGURADO,
      };
    }
    return { configured: false, error: TETO_NAO_CONFIGURADO };
  }

  const creditoBaseTotalCents = sumCreditosBaseCents(creditosBaseCents);
  const cents = calcTetoGlobalCents(creditosBaseCents, percent);
  return { configured: true, percent, cents, creditoBaseTotalCents };
}

async function requireConfiguredTeto(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number>
): Promise<
  | { ok: true; percent: number; cents: number; creditoBaseTotalCents: number }
  | { ok: false; error: string }
> {
  const teto = await resolveTetoGlobal(supabase, cnpj, creditosBaseCents);
  if (!teto.configured) return { ok: false, error: teto.error };
  return {
    ok: true,
    percent: teto.percent,
    cents: teto.cents,
    creditoBaseTotalCents: teto.creditoBaseTotalCents,
  };
}

/** @deprecated use resolveTetoGlobal */
export async function getOrCreateTeto(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<number> {
  const resolved = await resolveTetoGlobal(supabase, cnpj, creditosBaseCents);
  return resolved.configured ? resolved.cents : 0;
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
  void tetoCentavos;
  void actorUserId;
  void supabase;
  void cnpj;
  return { ok: false, error: TETO_NAO_CONFIGURADO };
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

/** Limites de cooperados que não entram na liberação coletiva atual (ex.: inativos). */
async function sumLimitesForaSelecao(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[]
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  const selected = new Set(cooperadoIds);
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("cooperado_id, limit_released_cents")
    .eq("cooperative_cnpj", digits);

  return (data ?? []).reduce((sum, row) => {
    if (selected.has(String(row.cooperado_id))) return sum;
    return sum + Number(row.limit_released_cents);
  }, 0);
}

export async function getDashboardResumo(
  supabase: SupabaseClient,
  cnpj: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<ContaCoopDashboard> {
  const digits = normalizeCnpj(cnpj);
  const tetoResult = await resolveTetoGlobal(supabase, digits, creditosBaseCents);
  const tetoPercent = tetoResult.configured ? tetoResult.percent : 0;
  const tetoCents = tetoResult.configured ? tetoResult.cents : 0;
  const creditoBaseTotalCents = tetoResult.configured
    ? tetoResult.creditoBaseTotalCents
    : sumCreditosBaseCents(creditosBaseCents);
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
    .eq("status", "posted")
    .in("event_type", ["PAYMENT", "REFUND"])
    .gte("created_at", since);

  const mesReferencia = getCurrentMesReferencia();
  const { start, end } = mesReferenciaRange(mesReferencia);

  const [{ data: txsMes }, { data: recebiveisAbertos }, { data: cashbackRows }] = await Promise.all([
    supabase
      .from("hb_credit_transactions")
      .select("event_type, amount_cents, discount_cents, net_receivable_cents, credit_debited_cents, status")
      .eq("cooperative_cnpj", digits)
      .eq("status", "posted")
      .in("event_type", ["PAYMENT", "REFUND"])
      .gte("created_at", start)
      .lt("created_at", end),
    supabase
      .from("hb_credit_receivables")
      .select("amount_cents, net_amount_cents, gross_amount_cents, status")
      .eq("cooperative_cnpj", digits)
      .in("status", ["OPEN", "ELIGIBLE", "PROCESSING"]),
    supabase
      .from("hb_credit_cashback_balances")
      .select("available_cents")
      .eq("cooperative_cnpj", digits),
  ]);

  let comprasBrutoCents = 0;
  let comprasQtd = 0;
  let estornosCents = 0;
  let estornosQtd = 0;
  let descontoMercadosCents = 0;
  let liquidoMercadosCents = 0;
  let creditoDebitadoCents = 0;

  for (const tx of txsMes ?? []) {
    if (tx.event_type === "PAYMENT") {
      comprasQtd += 1;
      const gross = Number(tx.amount_cents);
      const discount = Number(tx.discount_cents ?? 0);
      const net = Number(tx.net_receivable_cents ?? gross - discount);
      const debit = Number(tx.credit_debited_cents ?? gross);
      comprasBrutoCents += gross;
      descontoMercadosCents += discount;
      liquidoMercadosCents += net;
      creditoDebitadoCents += debit;
    } else if (tx.event_type === "REFUND") {
      estornosQtd += 1;
      estornosCents += Number(tx.amount_cents);
    }
  }

  let recebivelMercadosAbertoCents = 0;
  for (const r of recebiveisAbertos ?? []) {
    recebivelMercadosAbertoCents += Number(r.net_amount_cents ?? r.amount_cents);
  }

  const cashbackSaldoCooperadosCents = (cashbackRows ?? []).reduce(
    (sum, row) => sum + Number(row.available_cents ?? 0),
    0
  );

  const lancamentosMes: ContaCoopDashboardLancamentosMes = {
    mesReferencia,
    comprasBrutoCents,
    comprasQtd,
    estornosCents,
    estornosQtd,
    descontoMercadosCents,
    liquidoMercadosCents,
    creditoDebitadoCents,
    recebivelMercadosAbertoCents,
    cashbackSaldoCooperadosCents,
  };

  return {
    teto: {
      tetoGlobalPercent: tetoPercent,
      tetoGlobalCents: tetoCents,
      creditoBaseTotalCents,
      limiteDistribuidoCents: limiteDistribuido,
      restanteParaLiberarCents: tetoResult.configured
        ? Math.max(0, tetoCents - limiteDistribuido)
        : 0,
    },
    agregadoCooperados: {
      limiteLiberadoCents: limiteDistribuido,
      valorUsadoCents: usadoTotal,
      valorDisponivelCents: computeDisponivel(limiteDistribuido, usadoTotal),
    },
    parceirosPendentes: pendentes ?? 0,
    transacoesRecentes: recentes ?? 0,
    lancamentosMes,
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

function mapLimiteRow(row: Record<string, unknown>, cashbackDisponivelCents = 0): ContaCoopLimiteCooperado {
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
    cashbackDisponivelCents,
    updatedAt: String(row.updated_at),
  };
}

async function getCashbackDisponivel(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_cashback_balances")
    .select("available_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  return Number(data?.available_cents ?? 0);
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
  const tetoReq = await requireConfiguredTeto(supabase, digits, creditosBaseCents);
  if (!tetoReq.ok) {
    return {
      atual: { limiteLiberadoCents: 0, valorUsadoCents: 0, valorDisponivelCents: 0 },
      novo: novoLimiteCents,
      totalDistribuidoApos: 0,
      tetoGlobal: 0,
      tetoGlobalPercent: 0,
      ok: false,
      error: tetoReq.error,
    };
  }
  const teto = tetoReq;
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
  actorUserId: string,
  partnerDiscountPercent?: number
): Promise<ContaCoopParceiro | null> {
  const digits = normalizeCnpj(cnpj);
  const { data: before } = await supabase
    .from("hb_credit_partners")
    .select("*")
    .eq("id", parceiroId)
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  const dbStatus = partnerStatusToDb(status);
  const patch: Record<string, unknown> = { status: dbStatus, updated_at: new Date().toISOString() };
  if (partnerDiscountPercent !== undefined) {
    const pct = Math.min(100, Math.max(0, Math.round(partnerDiscountPercent * 100) / 100));
    patch.partner_discount_percent = pct;
  }

  const { data, error } = await supabase
    .from("hb_credit_partners")
    .update(patch)
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
      novo: { status, partnerDiscountPercent: patch.partner_discount_percent ?? undefined },
    },
  });

  return mapParceiroRow(data as Record<string, unknown>);
}

export async function updateParceiroDiscount(
  supabase: SupabaseClient,
  cnpj: string,
  parceiroId: string,
  partnerDiscountPercent: number,
  actorUserId: string
): Promise<ContaCoopParceiro | null> {
  const digits = normalizeCnpj(cnpj);
  const pct = Math.min(100, Math.max(0, Math.round(partnerDiscountPercent * 100) / 100));
  const { data, error } = await supabase
    .from("hb_credit_partners")
    .update({ partner_discount_percent: pct, updated_at: new Date().toISOString() })
    .eq("id", parceiroId)
    .eq("cooperative_cnpj", digits)
    .select()
    .single();
  if (error || !data) return null;

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "PARTNER_DISCOUNT_UPDATED",
    resource_type: "partner",
    resource_id: parceiroId,
    metadata: { partnerDiscountPercent: pct },
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
    pixKey: readStoredField(row.pix_key as string | undefined),
    pixHolderName: readStoredField(row.pix_holder_name as string | undefined),
    pixUpdatedAt: row.pix_updated_at ? String(row.pix_updated_at) : null,
    appUserId: row.app_user_id ? String(row.app_user_id) : null,
    partnerDiscountPercent: Number(row.partner_discount_percent ?? 0),
    partnerTermsVersion: row.partner_terms_version ? String(row.partner_terms_version) : null,
    partnerTermsAcceptedAt: row.partner_terms_accepted_at ? String(row.partner_terms_accepted_at) : null,
    partnerTermsAcceptedBy: row.partner_terms_accepted_by ? String(row.partner_terms_accepted_by) : null,
    partnerTermsDiscountSnapshot:
      row.partner_terms_discount_snapshot != null ? Number(row.partner_terms_discount_snapshot) : null,
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
  if (!data) return null;
  const cashback = await getCashbackDisponivel(supabase, digits, cooperadoId);
  return mapLimiteRow(data as Record<string, unknown>, cashback);
}

export async function setFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pinHash = await hashPassword(pin);
  const digits = normalizeCnpj(cnpj);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("hb_credit_accounts")
    .select("id, limit_released_cents, amount_used_cents, status")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("hb_credit_accounts")
      .update({
        pin_hash: pinHash,
        pin_updated_at: now,
        pin_failed_attempts: 0,
        pin_locked_until: null,
        updated_at: now,
      })
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", cooperadoId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("hb_credit_accounts").insert({
    cooperative_cnpj: digits,
    cooperado_id: cooperadoId,
    limit_released_cents: 0,
    amount_used_cents: 0,
    status: "active",
    pin_hash: pinHash,
    pin_updated_at: now,
    pin_failed_attempts: 0,
    updated_at: now,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function recordPinFailure(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("pin_failed_attempts")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const attempts = Number(data?.pin_failed_attempts ?? 0) + 1;
  const lockedUntil =
    attempts >= PIN_MAX_ATTEMPTS
      ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString()
      : null;

  await supabase
    .from("hb_credit_accounts")
    .update({
      pin_failed_attempts: attempts,
      pin_locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId);

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "PIN_FAILED",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: { attempts, locked: Boolean(lockedUntil) },
  });
}

async function resetPinFailures(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  await supabase
    .from("hb_credit_accounts")
    .update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId);
}

export async function verifyFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  pin: string,
  actorUserId = cooperadoId
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("pin_hash, pin_locked_until")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (!data?.pin_hash) {
    return { ok: false, error: "PIN financeiro não definido." };
  }

  if (data.pin_locked_until && new Date(String(data.pin_locked_until)).getTime() > Date.now()) {
    return {
      ok: false,
      error: `PIN bloqueado temporariamente. Tente novamente em alguns minutos.`,
    };
  }

  const valid = await verifyPassword(pin, String(data.pin_hash));
  if (!valid) {
    await recordPinFailure(supabase, cnpj, cooperadoId, actorUserId);
    return { ok: false, error: "PIN financeiro inválido." };
  }

  await resetPinFailures(supabase, cnpj, cooperadoId);
  return { ok: true };
}

async function recordPartnerPinFailure(
  supabase: SupabaseClient,
  partnerId: string,
  actorUserId: string
): Promise<void> {
  const { data } = await supabase
    .from("hb_credit_partners")
    .select("pin_failed_attempts, cooperative_cnpj")
    .eq("id", partnerId)
    .maybeSingle();

  const attempts = Number(data?.pin_failed_attempts ?? 0) + 1;
  const lockedUntil =
    attempts >= PIN_MAX_ATTEMPTS
      ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString()
      : null;

  await supabase
    .from("hb_credit_partners")
    .update({
      pin_failed_attempts: attempts,
      pin_locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (data?.cooperative_cnpj) {
    await supabase.from("hb_credit_audit_log").insert({
      cooperative_cnpj: String(data.cooperative_cnpj),
      actor: actorUserId,
      action: "PARTNER_PIN_FAILED",
      resource_type: "partner",
      resource_id: partnerId,
      metadata: { attempts },
    });
  }
}

async function resetPartnerPinFailures(supabase: SupabaseClient, partnerId: string): Promise<void> {
  await supabase
    .from("hb_credit_partners")
    .update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);
}

export async function setPartnerFinancialPin(
  supabase: SupabaseClient,
  partnerId: string,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pinHash = await hashPassword(pin);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("hb_credit_partners")
    .update({
      pin_hash: pinHash,
      pin_updated_at: now,
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: now,
    })
    .eq("id", partnerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function hasPartnerFinancialPin(
  supabase: SupabaseClient,
  partnerId: string
): Promise<boolean> {
  const { data } = await supabase.from("hb_credit_partners").select("pin_hash").eq("id", partnerId).maybeSingle();
  return Boolean(data?.pin_hash);
}

export async function verifyPartnerFinancialPin(
  supabase: SupabaseClient,
  partnerId: string,
  pin: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase
    .from("hb_credit_partners")
    .select("pin_hash, pin_locked_until")
    .eq("id", partnerId)
    .maybeSingle();

  if (!data?.pin_hash) {
    return { ok: false, error: "PIN financeiro não definido. Cadastre seu PIN no painel do mercado." };
  }

  if (data.pin_locked_until && new Date(String(data.pin_locked_until)).getTime() > Date.now()) {
    return {
      ok: false,
      error: "PIN bloqueado temporariamente. Tente novamente em alguns minutos.",
    };
  }

  const valid = await verifyPassword(pin, String(data.pin_hash));
  if (!valid) {
    await recordPartnerPinFailure(supabase, partnerId, actorUserId);
    return {
      ok: false,
      error:
        "PIN financeiro incorreto. Use o PIN numérico cadastrado na aba Mais do mercado (mínimo 4 dígitos) — não é a senha de login.",
    };
  }

  await resetPartnerPinFailures(supabase, partnerId);
  return { ok: true };
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
  const nonce = secureNonce();
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
  const gross = Number(intent.amount_cents);
  const cashback = limite.cashbackDisponivelCents ?? 0;
  const effective = limite.valorDisponivelCents + cashback;
  if (effective < gross) {
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
    cooperadoNome?: string;
    useCashback?: boolean;
  }
): Promise<
  | {
      ok: true;
      transacaoId: string;
      receiptCode: string;
      disponivelAposCents: number;
      cashbackAppliedCents?: number;
      duplicate?: boolean;
    }
  | { ok: false; error: string }
> {
  const pinCheck = await verifyFinancialPin(
    supabase,
    input.cooperativaCnpj,
    input.cooperadoId,
    input.pin,
    input.actorUserId
  );
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  let cashbackAppliedCents = 0;
  if (input.useCashback) {
    const limite = await getLimiteCooperado(supabase, input.cooperativaCnpj, input.cooperadoId);
    cashbackAppliedCents = limite?.cashbackDisponivelCents ?? 0;
  }

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
    p_cashback_applied_cents: cashbackAppliedCents,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration HB Credit não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; error?: string; duplicate?: boolean; transacao_id?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: result?.error ?? "Pagamento recusado." };

  const txId = result.transacao_id ?? transacaoId;
  let finalReceiptCode = receiptCode;
  if (result.duplicate) {
    const { data: existingTx } = await supabase
      .from("hb_credit_transactions")
      .select("receipt_code")
      .eq("id", txId)
      .maybeSingle();
    if (existingTx?.receipt_code) {
      finalReceiptCode = String(existingTx.receipt_code);
    }
  } else {
    try {
      const { ensureFiscalNoteForTransaction } = await import("@/lib/supabase/hbCreditFiscalNotesStorage");
      await ensureFiscalNoteForTransaction(supabase, txId, input.cooperadoNome);
    } catch {
      /* tabela fiscal opcional até migration aplicada */
    }
  }

  return {
    ok: true,
    transacaoId: txId,
    receiptCode: finalReceiptCode,
    disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0),
    cashbackAppliedCents: Number((result as { cashback_applied_cents?: number }).cashback_applied_cents ?? 0),
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

export function partnerNeedsTermsAcceptance(parceiro: ContaCoopParceiro): boolean {
  if (parceiro.status !== "ativo") return false;
  if (!parceiro.partnerTermsAcceptedAt) return true;
  if (parceiro.partnerTermsVersion !== TERMO_MERCADO_CONTA_COOP_VERSAO) return true;
  return false;
}

export async function acceptPartnerTerms(
  supabase: SupabaseClient,
  partnerId: string,
  appUserId: string
): Promise<ContaCoopParceiro | null> {
  const { data: before } = await supabase
    .from("hb_credit_partners")
    .select("cooperative_cnpj, partner_discount_percent, status")
    .eq("id", partnerId)
    .maybeSingle();

  if (!before || String(before.status) !== "ACTIVE") return null;

  const now = new Date().toISOString();
  const discountSnapshot = Number(before.partner_discount_percent ?? 0);

  const { data, error } = await supabase
    .from("hb_credit_partners")
    .update({
      partner_terms_version: TERMO_MERCADO_CONTA_COOP_VERSAO,
      partner_terms_accepted_at: now,
      partner_terms_accepted_by: appUserId,
      partner_terms_discount_snapshot: discountSnapshot,
      updated_at: now,
    })
    .eq("id", partnerId)
    .select()
    .single();

  if (error || !data) return null;

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: String(before.cooperative_cnpj),
    actor: appUserId,
    action: "PARTNER_TERMS_ACCEPTED",
    resource_type: "partner",
    resource_id: partnerId,
    metadata: {
      termsVersion: TERMO_MERCADO_CONTA_COOP_VERSAO,
      discountPercent: discountSnapshot,
    },
  });

  return mapParceiroRow(data as Record<string, unknown>);
}

export async function getCooperativaNomeByCnpj(
  supabase: SupabaseClient,
  cnpj: string
): Promise<string | null> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase.from("cooperativas").select("nome").eq("cnpj", digits).maybeSingle();
  return data?.nome ? String(data.nome) : null;
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
  const tetoReq = await requireConfiguredTeto(supabase, digits, creditosBaseCents);
  if (!tetoReq.ok) {
    return {
      limiteAtualTotal: 0,
      novoLimiteTotal: 0,
      totalApos: 0,
      tetoGlobal: 0,
      tetoGlobalPercent: 0,
      ok: false,
      error: tetoReq.error,
    };
  }
  const teto = tetoReq;
  const distribuido = await sumLimitesDistribuidos(supabase, digits);
  const novoLimiteTotal = cooperadoIds.length * valorPorCooperadoCents;
  const totalApos = (await sumLimitesForaSelecao(supabase, digits, cooperadoIds)) + novoLimiteTotal;

  if (totalApos > teto.cents) {
    return {
      limiteAtualTotal: distribuido,
      novoLimiteTotal,
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
  const tetoReq = await requireConfiguredTeto(supabase, digits, creditosBaseCents);
  if (!tetoReq.ok) {
    return {
      limiteAtualTotal: 0,
      novoLimiteTotal: 0,
      totalApos: 0,
      tetoGlobal: 0,
      tetoGlobalPercent: 0,
      ok: false,
      error: tetoReq.error,
      percentual,
      itens: [],
    };
  }
  const teto = tetoReq;
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
  let novoLimiteTotal = 0;

  for (const cooperadoId of cooperadoIds) {
    const creditoBaseCents = Math.max(0, Math.round(Number(creditosBaseCents[cooperadoId] ?? 0)));
    const { limiteAtualCents, valorUsadoCents } = await readLimiteAtualCooperado(supabase, digits, cooperadoId);

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

  const totalApos = (await sumLimitesForaSelecao(supabase, digits, cooperadoIds)) + novoLimiteTotal;

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

export async function listRefundablePayments(
  supabase: SupabaseClient,
  cnpj: string,
  options?: { limit?: number; cooperadoId?: string; partnerId?: string }
): Promise<ContaCoopCompraEstornavel[]> {
  const digits = normalizeCnpj(cnpj);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);

  let query = supabase
    .from("hb_credit_transactions")
    .select("id, cooperado_id, partner_id, amount_cents, receipt_code, payment_intent_id, created_at")
    .eq("cooperative_cnpj", digits)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.cooperadoId) query = query.eq("cooperado_id", options.cooperadoId);
  if (options?.partnerId) query = query.eq("partner_id", options.partnerId);

  const { data: txs, error } = await query;
  if (error) throw error;
  if (!txs?.length) return [];

  const txIds = txs.map((t) => String(t.id));
  const partnerIds = [...new Set(txs.map((t) => String(t.partner_id)).filter(Boolean))];
  const intentIds = txs.map((t) => t.payment_intent_id).filter(Boolean) as string[];

  const [{ data: refunds }, { data: partners }, { data: intents }, { data: recebiveis }, pendingRequestsResult] =
    await Promise.all([
    supabase.from("hb_credit_refunds").select("original_transaction_id").in("original_transaction_id", txIds),
    partnerIds.length
      ? supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    intentIds.length
      ? supabase.from("hb_credit_payment_intents").select("id, description").in("id", intentIds)
      : Promise.resolve({ data: [] as { id: string; description: string | null }[] }),
    supabase.from("hb_credit_receivables").select("transaction_id, status").in("transaction_id", txIds),
    supabase
      .from("hb_credit_refund_requests")
      .select("id, transaction_id")
      .in("transaction_id", txIds)
      .eq("status", "PENDING"),
  ]);

  const pendingByTx: Record<string, string> = {};
  if (!pendingRequestsResult.error) {
    for (const row of pendingRequestsResult.data ?? []) {
      pendingByTx[String(row.transaction_id)] = String(row.id);
    }
  }

  const refundedIds = new Set((refunds ?? []).map((r) => String(r.original_transaction_id)));
  const partnerNames: Record<string, string> = {};
  for (const p of partners ?? []) partnerNames[String(p.id)] = String(p.name);
  const intentDesc: Record<string, string> = {};
  for (const intent of intents ?? []) {
    if (intent.description) intentDesc[String(intent.id)] = String(intent.description);
  }
  const recebivelByTx: Record<string, string> = {};
  for (const r of recebiveis ?? []) {
    recebivelByTx[String(r.transaction_id)] = String(r.status);
  }

  return txs
    .filter((t) => !refundedIds.has(String(t.id)))
    .filter((t) => isReceivableRefundableDbStatus(recebivelByTx[String(t.id)]))
    .map((t) => {
      const intentId = t.payment_intent_id ? String(t.payment_intent_id) : "";
      const recebivelDb = recebivelByTx[String(t.id)];
      return {
        id: String(t.id),
        cooperadoId: String(t.cooperado_id ?? ""),
        parceiroId: String(t.partner_id ?? ""),
        parceiroNome: partnerNames[String(t.partner_id)] ?? "Mercado",
        amountCents: Number(t.amount_cents),
        receiptCode: t.receipt_code ? String(t.receipt_code) : null,
        descricao: intentDesc[intentId] ?? null,
        recebivelStatus: recebivelDb ? receivableStatusFromDb(recebivelDb) : undefined,
        createdAt: String(t.created_at),
        solicitacaoPendenteId: pendingByTx[String(t.id)] ?? null,
      };
    });
}

function refundRequestStatusFromDb(status: string): SolicitacaoEstornoStatus {
  if (status === "APPROVED") return "aprovado";
  if (status === "DENIED") return "negado";
  if (status === "CANCELLED") return "cancelado";
  return "pendente";
}

function mapRefundRequestRow(
  row: Record<string, unknown>,
  extras?: { parceiroNome?: string; cooperadoId?: string; receiptCode?: string | null; descricao?: string | null }
): ContaCoopSolicitacaoEstorno {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id),
    cooperadoId: extras?.cooperadoId ?? String(row.cooperado_id ?? ""),
    parceiroId: String(row.partner_id),
    parceiroNome: extras?.parceiroNome ?? "Mercado",
    amountCents: Number(row.amount_cents),
    motivo: String(row.motivo),
    status: refundRequestStatusFromDb(String(row.status)),
    receiptCode: extras?.receiptCode ?? null,
    descricao: extras?.descricao ?? null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewNote: row.review_note ? String(row.review_note) : null,
  };
}

export async function listRefundRequests(
  supabase: SupabaseClient,
  filters: {
    cooperativeCnpj?: string;
    partnerId?: string;
    status?: SolicitacaoEstornoStatus | "pendente";
    limit?: number;
  }
): Promise<ContaCoopSolicitacaoEstorno[]> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  let query = supabase
    .from("hb_credit_refund_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.cooperativeCnpj) {
    query = query.eq("cooperative_cnpj", normalizeCnpj(filters.cooperativeCnpj));
  }
  if (filters.partnerId) query = query.eq("partner_id", filters.partnerId);
  if (filters.status === "pendente") query = query.eq("status", "PENDING");

  const { data, error } = await query;
  if (error) {
    if (/hb_credit_refund_requests/i.test(error.message ?? "")) return [];
    throw error;
  }
  if (!data?.length) return [];

  const txIds = data.map((r) => String(r.transaction_id));
  const partnerIds = [...new Set(data.map((r) => String(r.partner_id)))];
  const [{ data: txs }, { data: partners }] = await Promise.all([
    supabase
      .from("hb_credit_transactions")
      .select("id, cooperado_id, receipt_code, payment_intent_id")
      .in("id", txIds),
    supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds),
  ]);

  const txById: Record<string, { cooperadoId: string; receiptCode?: string | null; intentId?: string }> = {};
  const intentIds: string[] = [];
  for (const tx of txs ?? []) {
    const intentId = tx.payment_intent_id ? String(tx.payment_intent_id) : undefined;
    if (intentId) intentIds.push(intentId);
    txById[String(tx.id)] = {
      cooperadoId: String(tx.cooperado_id ?? ""),
      receiptCode: tx.receipt_code ? String(tx.receipt_code) : null,
      intentId,
    };
  }

  const intentDesc: Record<string, string> = {};
  if (intentIds.length) {
    const { data: intents } = await supabase
      .from("hb_credit_payment_intents")
      .select("id, description")
      .in("id", intentIds);
    for (const intent of intents ?? []) {
      if (intent.description) intentDesc[String(intent.id)] = String(intent.description);
    }
  }

  const partnerNames: Record<string, string> = {};
  for (const p of partners ?? []) partnerNames[String(p.id)] = String(p.name);

  return data.map((row) => {
    const tx = txById[String(row.transaction_id)];
    const descricao = tx?.intentId ? intentDesc[tx.intentId] ?? null : null;
    return mapRefundRequestRow(row as Record<string, unknown>, {
      parceiroNome: partnerNames[String(row.partner_id)] ?? "Mercado",
      cooperadoId: tx?.cooperadoId,
      receiptCode: tx?.receiptCode ?? null,
      descricao,
    });
  });
}

export async function createRefundRequest(
  supabase: SupabaseClient,
  params: {
    partnerId: string;
    transactionId: string;
    motivo: string;
    pin: string;
    requestedByUserId: string;
  }
): Promise<{ ok: true; solicitacao: ContaCoopSolicitacaoEstorno } | { ok: false; error: string }> {
  const motivo = params.motivo.trim();
  if (motivo.length < 5) {
    return { ok: false, error: "Descreva o motivo do estorno (mínimo 5 caracteres)." };
  }

  const pinCheck = await verifyPartnerFinancialPin(
    supabase,
    params.partnerId,
    params.pin,
    params.requestedByUserId
  );
  if (!pinCheck.ok) return pinCheck;

  const { data: tx, error: txError } = await supabase
    .from("hb_credit_transactions")
    .select("id, cooperative_cnpj, partner_id, cooperado_id, amount_cents, receipt_code, payment_intent_id, status, event_type")
    .eq("id", params.transactionId)
    .eq("partner_id", params.partnerId)
    .maybeSingle();

  if (txError) {
    if (/hb_credit_refund_requests/i.test(txError.message ?? "")) {
      return { ok: false, error: "Migration de solicitações de estorno não aplicada na nuvem." };
    }
    return { ok: false, error: txError.message };
  }
  if (!tx) return { ok: false, error: "Compra não encontrada para este mercado." };
  if (tx.event_type !== "PAYMENT" || tx.status !== "posted") {
    return { ok: false, error: "Esta compra não pode ser estornada." };
  }

  const { data: existingRefund } = await supabase
    .from("hb_credit_refunds")
    .select("id")
    .eq("original_transaction_id", params.transactionId)
    .maybeSingle();
  if (existingRefund) return { ok: false, error: "Esta compra já foi estornada." };

  const { data: recebivel } = await supabase
    .from("hb_credit_receivables")
    .select("status")
    .eq("transaction_id", params.transactionId)
    .maybeSingle();
  if (recebivel && !isReceivableRefundableDbStatus(String(recebivel.status))) {
    return {
      ok: false,
      error: "Compra já em liquidação ou liquidada — estorno não permitido.",
    };
  }

  const { data: pending } = await supabase
    .from("hb_credit_refund_requests")
    .select("id")
    .eq("transaction_id", params.transactionId)
    .eq("status", "PENDING")
    .maybeSingle();
  if (pending) return { ok: false, error: "Já existe uma solicitação pendente para esta compra." };

  const requestId = genId("refreq");
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("hb_credit_refund_requests")
    .insert({
      id: requestId,
      cooperative_cnpj: String(tx.cooperative_cnpj),
      partner_id: params.partnerId,
      transaction_id: params.transactionId,
      amount_cents: Number(tx.amount_cents),
      motivo,
      status: "PENDING",
      requested_by_user_id: params.requestedByUserId,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "Não foi possível registrar a solicitação." };
  }

  let descricao: string | null = null;
  if (tx.payment_intent_id) {
    const { data: intent } = await supabase
      .from("hb_credit_payment_intents")
      .select("description")
      .eq("id", String(tx.payment_intent_id))
      .maybeSingle();
    if (intent?.description) descricao = String(intent.description);
  }

  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("name")
    .eq("id", params.partnerId)
    .maybeSingle();

  return {
    ok: true,
    solicitacao: mapRefundRequestRow(inserted as Record<string, unknown>, {
      parceiroNome: partner?.name ? String(partner.name) : "Mercado",
      cooperadoId: String(tx.cooperado_id ?? ""),
      receiptCode: tx.receipt_code ? String(tx.receipt_code) : null,
      descricao,
    }),
  };
}

export async function approveRefundRequest(
  supabase: SupabaseClient,
  requestId: string,
  cooperativeCnpj: string,
  reviewerUserId: string,
  reviewNote?: string
): Promise<{ ok: true; disponivelAposCents: number } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const refundTxId = genId("tx");
  const refundId = genId("refund");

  const { data: reqRow } = await supabase
    .from("hb_credit_refund_requests")
    .select("transaction_id")
    .eq("id", requestId)
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  const { data, error } = await supabase.rpc("hb_credit_approve_refund_request", {
    p_request_id: requestId,
    p_cooperative_cnpj: digits,
    p_reviewer_user_id: reviewerUserId,
    p_review_note: reviewNote?.trim() || null,
    p_refund_transaction_id: refundTxId,
    p_refund_id: refundId,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: "Migration Fase 1 (hb_credit_phase1_security) não aplicada na nuvem.",
      };
    }
    if (/payment_intent_id.*already exists|23505/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: humanizeCreditRefundError(error.message ?? ""),
      };
    }
    return { ok: false, error: humanizeCreditRefundError(error.message) };
  }

  const result = data as { ok?: boolean; error?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: humanizeCreditRefundError(result?.error ?? "Aprovação recusada.") };

  const transacaoId = reqRow?.transaction_id ? String(reqRow.transaction_id) : null;
  if (transacaoId) {
    try {
      const { cancelFiscalNoteForTransaction } = await import("@/lib/supabase/hbCreditFiscalNotesStorage");
      await cancelFiscalNoteForTransaction(supabase, transacaoId, reviewerUserId);
    } catch {
      /* tabela fiscal opcional até migration aplicada */
    }
  }

  return { ok: true, disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0) };
}

export async function denyRefundRequest(
  supabase: SupabaseClient,
  requestId: string,
  cooperativeCnpj: string,
  reviewerUserId: string,
  reviewNote?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hb_credit_refund_requests")
    .update({
      status: "DENIED",
      reviewed_by_user_id: reviewerUserId,
      review_note: reviewNote?.trim() || null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", requestId)
    .eq("cooperative_cnpj", digits)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Solicitação não encontrada ou já analisada." };
  return { ok: true };
}

export async function cancelRefundRequest(
  supabase: SupabaseClient,
  requestId: string,
  partnerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hb_credit_refund_requests")
    .update({ status: "CANCELLED", updated_at: now })
    .eq("id", requestId)
    .eq("partner_id", partnerId)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Solicitação não encontrada ou já analisada." };
  return { ok: true };
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
  const { data: recebivel } = await supabase
    .from("hb_credit_receivables")
    .select("status")
    .eq("transaction_id", transacaoId)
    .maybeSingle();
  if (recebivel && !isReceivableRefundableDbStatus(String(recebivel.status))) {
    return {
      ok: false,
      error: "Compra já em liquidação ou liquidada — estorno não permitido.",
    };
  }

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
    if (/payment_intent_id.*already exists|23505/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: humanizeCreditRefundError(error.message ?? ""),
      };
    }
    return { ok: false, error: humanizeCreditRefundError(error.message) };
  }

  const result = data as { ok?: boolean; error?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: humanizeCreditRefundError(result?.error ?? "Estorno recusado.") };

  try {
    const { cancelFiscalNoteForTransaction } = await import("@/lib/supabase/hbCreditFiscalNotesStorage");
    await cancelFiscalNoteForTransaction(supabase, transacaoId, actorUserId);
  } catch {
    /* tabela fiscal opcional até migration aplicada */
  }

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

export type PartnerIntentPaymentStatus = {
  status: IntentStatus;
  intentId: string;
  amountCents: number;
  descricao?: string;
  expiresAt: string;
  payment?: {
    transacaoId: string;
    receiptCode: string | null;
    paidAt: string;
    cooperadoId: string;
    cooperadoNome: string;
    cooperadoCpf: string;
  };
};

export async function getPartnerPaymentIntentStatus(
  supabase: SupabaseClient,
  parceiroId: string,
  intentId: string
): Promise<{ ok: true; data: PartnerIntentPaymentStatus } | { ok: false; error: string }> {
  const { data: intent, error } = await supabase
    .from("hb_credit_payment_intents")
    .select("*")
    .eq("id", intentId)
    .eq("partner_id", parceiroId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!intent) return { ok: false, error: "Cobrança não encontrada." };

  const status = intentStatusFromDb(String(intent.status));
  const base: PartnerIntentPaymentStatus = {
    status,
    intentId: String(intent.id),
    amountCents: Number(intent.amount_cents),
    descricao: intent.description ? String(intent.description) : undefined,
    expiresAt: String(intent.expires_at),
  };

  if (status !== "confirmada") {
    return { ok: true, data: base };
  }

  const { data: tx } = await supabase
    .from("hb_credit_transactions")
    .select("id, cooperado_id, receipt_code, created_at")
    .eq("payment_intent_id", intentId)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted")
    .maybeSingle();

  const cooperadoId = String(tx?.cooperado_id ?? intent.cooperado_id ?? "");
  let cooperadoNome = "Cooperado";
  let cooperadoCpf = "";

  if (cooperadoId) {
    const { fetchCooperadoFromStorage } = await import("@/lib/supabase/cooperadosStorage");
    const cooperado = await fetchCooperadoFromStorage(
      supabase,
      String(intent.cooperative_cnpj),
      cooperadoId
    );
    if (cooperado) {
      cooperadoNome = cooperado.nomeCompleto;
      cooperadoCpf = cooperado.cpfCnpj ?? "";
    } else {
      const { data: fiscal } = await supabase
        .from("hb_credit_fiscal_notes")
        .select("cooperado_nome_snapshot")
        .eq("transaction_id", tx?.id ?? "")
        .maybeSingle();
      if (fiscal?.cooperado_nome_snapshot) {
        cooperadoNome = String(fiscal.cooperado_nome_snapshot);
      }
    }
  }

  return {
    ok: true,
    data: {
      ...base,
      payment: {
        transacaoId: String(tx?.id ?? ""),
        receiptCode: tx?.receipt_code ? String(tx.receipt_code) : null,
        paidAt: String(tx?.created_at ?? intent.confirmed_at ?? new Date().toISOString()),
        cooperadoId,
        cooperadoNome,
        cooperadoCpf,
      },
    },
  };
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

export type CreditIntegrityReport = {
  ok: boolean;
  divergences: string[];
};

/** Verificação de integridade — registra divergências sem corrigir dados. */
export async function auditCreditIntegrity(
  supabase: SupabaseClient,
  cnpj: string
): Promise<CreditIntegrityReport> {
  const digits = normalizeCnpj(cnpj);
  const divergences: string[] = [];

  const { data: accounts } = await supabase
    .from("hb_credit_accounts")
    .select("cooperado_id, limit_released_cents, amount_used_cents, available_cents")
    .eq("cooperative_cnpj", digits);

  for (const row of accounts ?? []) {
    const limite = Number(row.limit_released_cents);
    const usado = Number(row.amount_used_cents);
    const disponivel = Number(row.available_cents);
    const esperado = limite - usado;
    if (disponivel !== esperado) {
      divergences.push(
        `Conta ${row.cooperado_id}: disponível (${disponivel}) ≠ limite (${limite}) - usado (${usado}).`
      );
    }
    if (usado > limite) {
      divergences.push(`Conta ${row.cooperado_id}: utilizado (${usado}) > limite (${limite}).`);
    }
  }

  const { data: payments } = await supabase
    .from("hb_credit_transactions")
    .select("id, amount_cents, status, event_type")
    .eq("cooperative_cnpj", digits)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted");

  const paymentTotal = (payments ?? []).reduce((s, r) => s + Number(r.amount_cents), 0);

  const { data: recebiveis } = await supabase
    .from("hb_credit_receivables")
    .select("amount_cents, status")
    .eq("cooperative_cnpj", digits)
    .neq("status", "BLOCKED_FOR_REVIEW");

  const receivableTotal = (recebiveis ?? []).reduce((s, r) => s + Number(r.amount_cents), 0);

  if (paymentTotal !== receivableTotal) {
    const { data: recebiveisGross } = await supabase
      .from("hb_credit_receivables")
      .select("gross_amount_cents, amount_cents, status")
      .eq("cooperative_cnpj", digits)
      .neq("status", "BLOCKED_FOR_REVIEW");

    const receivableGrossTotal = (recebiveisGross ?? []).reduce(
      (s, r) => s + Number(r.gross_amount_cents ?? r.amount_cents),
      0
    );

    if (paymentTotal !== receivableGrossTotal) {
      divergences.push(
        `Compras confirmadas bruto (${paymentTotal}) ≠ recebíveis bruto (${receivableGrossTotal}).`
      );
    }
  }

  const distribuido = (accounts ?? []).reduce((s, r) => s + Number(r.limit_released_cents), 0);
  const usadoTotal = (accounts ?? []).reduce((s, r) => s + Number(r.amount_used_cents), 0);
  const disponivelTotal = (accounts ?? []).reduce(
    (s, r) => s + Number(r.limit_released_cents) - Number(r.amount_used_cents),
    0
  );

  if (distribuido !== usadoTotal + disponivelTotal) {
    divergences.push(
      `Crédito liberado (${distribuido}) ≠ utilizado (${usadoTotal}) + disponível (${disponivelTotal}).`
    );
  }

  return { ok: divergences.length === 0, divergences };
}

function mesReferenciaRange(mesReferencia: string): { start: string; end: string } {
  const [year, month] = mesReferencia.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

function settlementStatusFromDb(status: string): SettlementStatus {
  if (status === "CONFIRMED") return "confirmado";
  if (status === "CANCELLED") return "cancelado";
  return "aguardando_mercado";
}

function settlementStatusToDb(status: SettlementStatus): string {
  if (status === "confirmado") return "CONFIRMED";
  if (status === "cancelado") return "CANCELLED";
  return "AWAITING_PARTNER";
}

function mapSettlementRow(row: Record<string, unknown>, partnerNome?: string): ContaCoopSettlement {
  return {
    id: String(row.id),
    partnerId: String(row.partner_id),
    partnerNome: partnerNome ?? String(row.partner_id),
    mesReferencia: String(row.mes_referencia),
    totalCents: Number(row.total_cents),
    transacoesCount: Number(row.transacoes_count),
    status: settlementStatusFromDb(String(row.status)),
    responsavelNome: row.responsavel_nome ? String(row.responsavel_nome) : null,
    pagoEm: row.pago_em ? String(row.pago_em) : null,
    comprovanteMemo: row.comprovante_memo ? String(row.comprovante_memo) : null,
    relatorioHtml: readStoredField(row.relatorio_html as string | undefined),
    partnerConfirmadoEm: row.partner_confirmado_em ? String(row.partner_confirmado_em) : null,
    createdAt: String(row.created_at),
  };
}

export async function updatePartnerPix(
  supabase: SupabaseClient,
  parceiroId: string,
  pixKey: string,
  pixHolderName: string
): Promise<ContaCoopParceiro | null> {
  const { data, error } = await supabase
    .from("hb_credit_partners")
    .update({
      pix_key: protectStoredField(pixKey),
      pix_holder_name: protectStoredField(pixHolderName),
      pix_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parceiroId)
    .select()
    .single();
  if (error || !data) return null;
  return mapParceiroRow(data as Record<string, unknown>);
}

type SettlementTxRow = {
  id: string;
  recebivelId: string;
  cooperadoId: string;
  tipo: "PAYMENT" | "REFUND";
  amountCents: number;
  receiptCode?: string | null;
  descricao?: string | null;
  createdAt: string;
  recebivelStatus?: string;
};

async function listSettlementTransactions(
  supabase: SupabaseClient,
  cnpj: string,
  partnerId: string,
  mesReferencia: string
): Promise<SettlementTxRow[]> {
  const digits = normalizeCnpj(cnpj);
  const { start, end } = mesReferenciaRange(mesReferencia);

  const { data: txs } = await supabase
    .from("hb_credit_transactions")
    .select("id, cooperado_id, event_type, amount_cents, receipt_code, created_at, status, payment_intent_id")
    .eq("cooperative_cnpj", digits)
    .eq("partner_id", partnerId)
    .in("event_type", ["PAYMENT", "REFUND"])
    .eq("status", "posted")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });

  const intentIds = (txs ?? []).map((t) => t.payment_intent_id).filter(Boolean) as string[];
  const intentDesc: Record<string, string> = {};
  if (intentIds.length) {
    const { data: intents } = await supabase
      .from("hb_credit_payment_intents")
      .select("id, description")
      .in("id", intentIds);
    for (const intent of intents ?? []) {
      if (intent.description) intentDesc[String(intent.id)] = String(intent.description);
    }
  }

  const paymentIds = (txs ?? []).filter((t) => t.event_type === "PAYMENT").map((t) => String(t.id));
  const recebivelByTx: Record<string, { id: string; status: string; netCents: number }> = {};
  if (paymentIds.length) {
    const { data: recebiveis } = await supabase
      .from("hb_credit_receivables")
      .select("id, transaction_id, status, amount_cents, net_amount_cents")
      .in("transaction_id", paymentIds);
    for (const r of recebiveis ?? []) {
      recebivelByTx[String(r.transaction_id)] = {
        id: String(r.id),
        status: String(r.status),
        netCents: Number(r.net_amount_cents ?? r.amount_cents),
      };
    }
  }

  return (txs ?? []).map((t) => {
    const intentId = t.payment_intent_id ? String(t.payment_intent_id) : "";
    const recebivel = recebivelByTx[String(t.id)];
    const gross = Number(t.amount_cents);
    const settlementAmount = t.event_type === "PAYMENT" ? (recebivel?.netCents ?? gross) : gross;
    return {
      id: String(t.id),
      recebivelId: recebivel?.id ?? "",
      cooperadoId: String(t.cooperado_id ?? ""),
      tipo: String(t.event_type) as "PAYMENT" | "REFUND",
      amountCents: settlementAmount,
      grossAmountCents: gross,
      receiptCode: t.receipt_code ? String(t.receipt_code) : null,
      descricao: intentDesc[intentId] ?? null,
      createdAt: String(t.created_at),
      recebivelStatus: recebivel?.status,
    };
  });
}

function buildCooperadoLiquidacao(transacoes: SettlementTxRow[]): ContaCoopCooperadoLiquidacao[] {
  const byCooperado = new Map<string, ContaCoopCooperadoLiquidacao>();
  for (const tx of transacoes) {
    const cooperadoId = tx.cooperadoId || "sem_cooperado";
    const current =
      byCooperado.get(cooperadoId) ??
      ({
        cooperadoId,
        totalComprasCents: 0,
        totalEstornosCents: 0,
        saldoCents: 0,
        transacoes: [],
      } satisfies ContaCoopCooperadoLiquidacao);

    const item: ContaCoopSettlementTransacao = {
      id: tx.id,
      recebivelId: tx.recebivelId,
      cooperadoId: tx.cooperadoId,
      tipo: tx.tipo,
      amountCents: tx.amountCents,
      receiptCode: tx.receiptCode,
      descricao: tx.descricao,
      createdAt: tx.createdAt,
    };
    current.transacoes.push(item);
    if (tx.tipo === "PAYMENT") current.totalComprasCents += tx.amountCents;
    if (tx.tipo === "REFUND") current.totalEstornosCents += tx.amountCents;
    current.saldoCents = current.totalComprasCents - current.totalEstornosCents;
    byCooperado.set(cooperadoId, current);
  }
  return [...byCooperado.values()].sort((a, b) => a.cooperadoId.localeCompare(b.cooperadoId));
}

export async function previewPartnerSettlement(
  supabase: SupabaseClient,
  cnpj: string,
  partnerId: string,
  mesReferencia: string
): Promise<ContaCoopLiquidacaoPreview | null> {
  const digits = normalizeCnpj(cnpj);
  const { data: partnerRow } = await supabase
    .from("hb_credit_partners")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("id", partnerId)
    .maybeSingle();
  if (!partnerRow) return null;

  const transacoes = await listSettlementTransactions(supabase, digits, partnerId, mesReferencia);
  const cooperados = buildCooperadoLiquidacao(transacoes);
  const eligibleRecebiveis = transacoes.filter(
    (tx) => tx.tipo === "PAYMENT" && tx.recebivelStatus === "ELIGIBLE"
  );
  const totalCents = eligibleRecebiveis.reduce((sum, tx) => sum + tx.amountCents, 0);

  let fiscalResumo;
  let pagamentoAprovado = false;
  let bloqueioPagamento: string | null = null;
  try {
    const { summarizeFiscalNotesMonth, evaluatePartnerFiscalSettlementGate } = await import(
      "@/lib/supabase/hbCreditFiscalNotesStorage"
    );
    fiscalResumo = await summarizeFiscalNotesMonth(supabase, digits, partnerId, mesReferencia);
    const gate = evaluatePartnerFiscalSettlementGate(fiscalResumo);
    pagamentoAprovado = gate.ready && totalCents > 0;
    bloqueioPagamento = gate.message;
  } catch {
    bloqueioPagamento = "Módulo fiscal indisponível — aplique a migration de NFs Conta Coop.";
  }

  return {
    partnerId,
    partnerNome: String(partnerRow.name),
    mesReferencia,
    pixKey: readStoredField(partnerRow.pix_key as string | undefined),
    pixHolderName: readStoredField(partnerRow.pix_holder_name as string | undefined),
    totalCents,
    transacoesCount: eligibleRecebiveis.length,
    cooperados,
    fiscalResumo,
    pagamentoAprovado,
    bloqueioPagamento,
  };
}

export async function registerPartnerSettlementPayment(
  supabase: SupabaseClient,
  params: {
    cnpj: string;
    partnerId: string;
    mesReferencia: string;
    responsavelUserId: string;
    responsavelNome: string;
    comprovanteMemo?: string;
    relatorioHtml: string;
  }
): Promise<{ ok: boolean; error?: string; settlement?: ContaCoopSettlement }> {
  const preview = await previewPartnerSettlement(supabase, params.cnpj, params.partnerId, params.mesReferencia);
  if (!preview) return { ok: false, error: "Mercado não encontrado." };
  if (preview.totalCents <= 0) {
    return {
      ok: false,
      error: preview.bloqueioPagamento ?? "Não há recebíveis elegíveis neste mês para liquidar.",
    };
  }
  if (!preview.pagamentoAprovado) {
    return {
      ok: false,
      error: preview.bloqueioPagamento ?? "Conferência fiscal incompleta — finalize as NFs antes do pagamento.",
    };
  }
  if (!preview.pixKey?.trim()) return { ok: false, error: "Mercado ainda não cadastrou chave PIX." };

  const { data: existing } = await supabase
    .from("hb_credit_settlements")
    .select("id")
    .eq("cooperative_cnpj", normalizeCnpj(params.cnpj))
    .eq("partner_id", params.partnerId)
    .eq("mes_referencia", params.mesReferencia)
    .eq("status", "AWAITING_PARTNER")
    .maybeSingle();
  if (existing) return { ok: false, error: "Já existe um pagamento aguardando confirmação do mercado neste mês." };

  const settlementId = genId("settle");
  const now = new Date().toISOString();
  const openRecebivelIds = (await listSettlementTransactions(supabase, params.cnpj, params.partnerId, params.mesReferencia))
    .filter((tx) => tx.tipo === "PAYMENT" && tx.recebivelStatus === "ELIGIBLE" && tx.recebivelId)
    .map((tx) => tx.recebivelId);

  const { error: insertError } = await supabase.from("hb_credit_settlements").insert({
    id: settlementId,
    cooperative_cnpj: normalizeCnpj(params.cnpj),
    partner_id: params.partnerId,
    mes_referencia: params.mesReferencia,
    total_cents: preview.totalCents,
    transacoes_count: preview.transacoesCount,
    status: "AWAITING_PARTNER",
    responsavel_user_id: params.responsavelUserId,
    responsavel_nome: params.responsavelNome,
    pago_em: now,
    comprovante_memo: params.comprovanteMemo ?? null,
    relatorio_html: protectStoredField(params.relatorioHtml),
    created_at: now,
    updated_at: now,
  });
  if (insertError) return { ok: false, error: insertError.message };

  if (openRecebivelIds.length) {
    const { error: recvError } = await supabase
      .from("hb_credit_receivables")
      .update({
        status: "PROCESSING",
        settlement_id: settlementId,
        updated_at: now,
      })
      .in("id", openRecebivelIds);
    if (recvError) {
      await supabase.from("hb_credit_settlements").delete().eq("id", settlementId);
      return { ok: false, error: recvError.message };
    }
  }

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: normalizeCnpj(params.cnpj),
    actor: params.responsavelUserId,
    action: "SETTLEMENT_REGISTERED",
    resource_type: "settlement",
    resource_id: settlementId,
    metadata: {
      partnerId: params.partnerId,
      mesReferencia: params.mesReferencia,
      totalCents: preview.totalCents,
    },
  });

  await supabase.rpc("hb_credit_liquidate_discount_pool", {
    p_cooperative_cnpj: normalizeCnpj(params.cnpj),
    p_mes_referencia: params.mesReferencia,
    p_settlement_id: settlementId,
    p_actor_user_id: params.responsavelUserId,
  });

  return {
    ok: true,
    settlement: {
      id: settlementId,
      partnerId: params.partnerId,
      partnerNome: preview.partnerNome,
      mesReferencia: params.mesReferencia,
      totalCents: preview.totalCents,
      transacoesCount: preview.transacoesCount,
      status: "aguardando_mercado",
      responsavelNome: params.responsavelNome,
      pagoEm: now,
      comprovanteMemo: params.comprovanteMemo ?? null,
      relatorioHtml: params.relatorioHtml,
      createdAt: now,
    },
  };
}

export async function confirmPartnerSettlement(
  supabase: SupabaseClient,
  settlementId: string,
  parceiroId: string,
  assinaturaDataUrl: string
): Promise<{ ok: boolean; error?: string; settlement?: ContaCoopSettlement }> {
  const { data: row } = await supabase
    .from("hb_credit_settlements")
    .select("*")
    .eq("id", settlementId)
    .eq("partner_id", parceiroId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Liquidação não encontrada." };
  if (String(row.status) !== "AWAITING_PARTNER") return { ok: false, error: "Esta liquidação já foi processada." };

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("hb_credit_settlements")
    .update({
      status: "CONFIRMED",
      partner_assinatura_data_url: protectStoredField(assinaturaDataUrl),
      partner_confirmado_em: now,
      updated_at: now,
    })
    .eq("id", settlementId);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase
    .from("hb_credit_receivables")
    .update({ status: "SETTLED", updated_at: now })
    .eq("settlement_id", settlementId);

  const { data: partnerRow } = await supabase
    .from("hb_credit_partners")
    .select("name")
    .eq("id", parceiroId)
    .maybeSingle();

  const updatedRow = {
    ...(row as Record<string, unknown>),
    status: "CONFIRMED",
    partner_assinatura_data_url: protectStoredField(assinaturaDataUrl),
    partner_confirmado_em: now,
    updated_at: now,
  };

  return {
    ok: true,
    settlement: mapSettlementRow(
      updatedRow,
      partnerRow?.name ? String(partnerRow.name) : undefined
    ),
  };
}

export async function listSettlementsForPartner(
  supabase: SupabaseClient,
  parceiroId: string,
  limit = 12
): Promise<ContaCoopSettlement[]> {
  const { data } = await supabase
    .from("hb_credit_settlements")
    .select("*")
    .eq("partner_id", parceiroId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => mapSettlementRow(row as Record<string, unknown>));
}

export async function getSettlementById(
  supabase: SupabaseClient,
  settlementId: string
): Promise<(ContaCoopSettlement & { partnerAssinatura?: string | null }) | null> {
  const { data } = await supabase.from("hb_credit_settlements").select("*").eq("id", settlementId).maybeSingle();
  if (!data) return null;
  const mapped = mapSettlementRow(data as Record<string, unknown>);
  return {
    ...mapped,
    partnerAssinatura: readStoredField(data.partner_assinatura_data_url as string | undefined),
  };
}

type CooperadoContaCoopDescontoRow = {
  motivo: string;
  valorReais: number;
  tipo: "conta_coop";
  createdAt: string;
};

async function listCooperadoContaCoopDescontosIntervalo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  startIso: string,
  endIso: string
): Promise<CooperadoContaCoopDescontoRow[]> {
  const digits = normalizeCnpj(cnpj);
  const { data: txs } = await supabase
    .from("hb_credit_transactions")
    .select("id, event_type, amount_cents, created_at, partner_id, receipt_code")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .in("event_type", ["PAYMENT", "REFUND"])
    .eq("status", "posted")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: true });

  if (!txs?.length) return [];

  const partnerIds = [...new Set(txs.map((t) => String(t.partner_id)).filter(Boolean))];
  const partnerNames: Record<string, string> = {};
  if (partnerIds.length) {
    const { data: partners } = await supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds);
    for (const p of partners ?? []) partnerNames[String(p.id)] = String(p.name);
  }

  return txs.map((t) => {
    const cents = Number(t.amount_cents);
    const partnerNome = partnerNames[String(t.partner_id)] ?? "Mercado parceiro";
    const isRefund = String(t.event_type) === "REFUND";
    const receipt = t.receipt_code ? ` (${String(t.receipt_code)})` : "";
    return {
      motivo: isRefund
        ? `Estorno Conta Coop — ${partnerNome}${receipt}`
        : `Compra Conta Coop — ${partnerNome}${receipt}`,
      valorReais: cents / 100,
      tipo: "conta_coop" as const,
      createdAt: String(t.created_at),
    };
  });
}

/** Compras/estornos confirmados no mês calendário (liquidação mercado, relatórios). */
export async function listCooperadoContaCoopDescontosMes(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  mesReferencia: string
): Promise<CooperadoContaCoopDescontoRow[]> {
  const { start, end } = mesReferenciaRange(mesReferencia);
  return listCooperadoContaCoopDescontosIntervalo(supabase, cnpj, cooperadoId, start, end);
}

/**
 * Compras que abatem o valor a receber enquanto a ficha do mês ainda está aberta:
 * do 1º dia do mês da ficha até agora (inclui compras no mês calendário seguinte).
 */
export async function listCooperadoContaCoopDescontosAbateValorReceber(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  mesReferenciaFicha: string
): Promise<CooperadoContaCoopDescontoRow[]> {
  const { start } = mesReferenciaRange(mesReferenciaFicha);
  return listCooperadoContaCoopDescontosIntervalo(
    supabase,
    cnpj,
    cooperadoId,
    start,
    new Date().toISOString()
  );
}

export async function getDiscountPoolResumo(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string
): Promise<ContaCoopDiscountPoolResumo> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_discount_allocations")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("mes_referencia", mesReferencia)
    .neq("cashback_status", "REVERSED");

  const rows = data ?? [];
  let appLiquidado = 0;
  let coopLiquidado = 0;
  let appPendente = 0;
  let coopPendente = 0;
  let appRepassePendente = 0;
  let appRepassePago = 0;
  let totalGross = 0;
  let totalDiscount = 0;
  let totalNet = 0;
  let totalCashback = 0;
  let totalApp = 0;
  let totalCoop = 0;

  for (const row of rows) {
    totalGross += Number(row.gross_cents);
    totalDiscount += Number(row.discount_cents);
    totalNet += Number(row.net_partner_cents);
    totalCashback += Number(row.cashback_cents);
    totalApp += Number(row.app_cents);
    totalCoop += Number(row.coop_cents);
    if (row.app_pool_status === "LIQUIDATED") appLiquidado += Number(row.app_cents);
    else if (row.app_pool_status === "PENDING") appPendente += Number(row.app_cents);
    if (row.app_repasse_id) appRepassePago += Number(row.app_cents);
    else if (row.app_pool_status === "LIQUIDATED") appRepassePendente += Number(row.app_cents);
    if (row.coop_pool_status === "LIQUIDATED") coopLiquidado += Number(row.coop_cents);
    else if (row.coop_pool_status === "PENDING") coopPendente += Number(row.coop_cents);
  }

  return {
    mesReferencia,
    totalGrossCents: totalGross,
    totalDiscountCents: totalDiscount,
    totalNetPartnerCents: totalNet,
    totalCashbackCents: totalCashback,
    totalAppCents: totalApp,
    totalCoopCents: totalCoop,
    appLiquidadoCents: appLiquidado,
    coopLiquidadoCents: coopLiquidado,
    appPendenteCents: appPendente,
    coopPendenteCents: coopPendente,
    appRepassePendenteCents: appRepassePendente,
    appRepassePagoCents: appRepassePago,
    transacoesCount: rows.length,
  };
}

function mapAppRepasseRow(row: Record<string, unknown>): ContaCoopAppRepasse {
  return {
    id: String(row.id),
    mesReferencia: String(row.mes_referencia),
    amountCents: Number(row.amount_cents),
    responsavelNome: String(row.responsavel_nome),
    comprovanteMemo: row.comprovante_memo ? String(row.comprovante_memo) : null,
    livroCaixaOrigemId: String(row.livro_caixa_origem_id),
    paidAt: String(row.paid_at ?? row.created_at),
  };
}

export async function getAppRepassePreview(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string
): Promise<ContaCoopAppRepassePreview> {
  const digits = normalizeCnpj(cnpj);

  const { data: existing } = await supabase
    .from("hb_credit_app_repasse")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("mes_referencia", mesReferencia)
    .maybeSingle();

  if (existing) {
    return {
      mesReferencia,
      amountCents: 0,
      allocCount: 0,
      alreadyPaid: true,
      repasse: mapAppRepasseRow(existing),
    };
  }

  const { data: rows } = await supabase
    .from("hb_credit_discount_allocations")
    .select("app_cents")
    .eq("cooperative_cnpj", digits)
    .eq("mes_referencia", mesReferencia)
    .eq("app_pool_status", "LIQUIDATED")
    .is("app_repasse_id", null)
    .neq("cashback_status", "REVERSED")
    .gt("app_cents", 0);

  const amountCents = (rows ?? []).reduce((sum, row) => sum + Number(row.app_cents), 0);
  return {
    mesReferencia,
    amountCents,
    allocCount: rows?.length ?? 0,
    alreadyPaid: false,
    repasse: null,
  };
}

export async function confirmAppRepasse(
  supabase: SupabaseClient,
  params: {
    cnpj: string;
    mesReferencia: string;
    responsavelUserId: string;
    responsavelNome: string;
    comprovanteMemo?: string;
  }
): Promise<{
  ok: boolean;
  error?: string;
  repasse?: ContaCoopAppRepasse;
  livroCaixaOrigemId?: string;
}> {
  const repasseId = genId("apprep");
  const { data, error } = await supabase.rpc("hb_credit_confirm_app_repasse", {
    p_cooperative_cnpj: normalizeCnpj(params.cnpj),
    p_mes_referencia: params.mesReferencia,
    p_repasse_id: repasseId,
    p_responsavel_user_id: params.responsavelUserId,
    p_responsavel_nome: params.responsavelNome,
    p_comprovante_memo: params.comprovanteMemo ?? null,
  });

  if (error) {
    if (/hb_credit_app_repasse|app_repasse_id|hb_credit_confirm_app_repasse/i.test(error.message)) {
      return { ok: false, error: "Migration de repasse HB não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    repasse_id?: string;
    amount_cents?: number;
    livro_caixa_origem_id?: string;
  };

  if (!payload?.ok) {
    return { ok: false, error: payload?.error ?? "Não foi possível confirmar o repasse." };
  }

  const { data: row } = await supabase
    .from("hb_credit_app_repasse")
    .select("*")
    .eq("id", payload.repasse_id ?? repasseId)
    .maybeSingle();

  if (!row) {
    return {
      ok: true,
      livroCaixaOrigemId: payload.livro_caixa_origem_id,
      repasse: {
        id: payload.repasse_id ?? repasseId,
        mesReferencia: params.mesReferencia,
        amountCents: Number(payload.amount_cents ?? 0),
        responsavelNome: params.responsavelNome,
        comprovanteMemo: params.comprovanteMemo ?? null,
        livroCaixaOrigemId: String(payload.livro_caixa_origem_id ?? `hb_app_${repasseId}`),
        paidAt: new Date().toISOString(),
      },
    };
  }

  return {
    ok: true,
    livroCaixaOrigemId: String(payload.livro_caixa_origem_id ?? row.livro_caixa_origem_id),
    repasse: mapAppRepasseRow(row),
  };
}

export async function listDiscountAllocations(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string
): Promise<ContaCoopDiscountAllocation[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_discount_allocations")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("mes_referencia", mesReferencia)
    .order("created_at", { ascending: false });

  const partnerIds = [...new Set((data ?? []).map((r) => String(r.partner_id)))];
  const partnerNames: Record<string, string> = {};
  if (partnerIds.length) {
    const { data: partners } = await supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds);
    for (const p of partners ?? []) partnerNames[String(p.id)] = String(p.name);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    transactionId: String(row.transaction_id),
    cooperadoId: String(row.cooperado_id),
    partnerId: String(row.partner_id),
    partnerNome: partnerNames[String(row.partner_id)],
    mesReferencia: String(row.mes_referencia),
    grossCents: Number(row.gross_cents),
    discountCents: Number(row.discount_cents),
    netPartnerCents: Number(row.net_partner_cents),
    cashbackCents: Number(row.cashback_cents),
    appCents: Number(row.app_cents),
    coopCents: Number(row.coop_cents),
    cashbackStatus: String(row.cashback_status),
    appPoolStatus: String(row.app_pool_status),
    coopPoolStatus: String(row.coop_pool_status),
    createdAt: String(row.created_at),
  }));
}

export async function sweepUnusedCashbackToCredit(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string,
  actorUserId: string
): Promise<{ ok: boolean; error?: string; totalCents?: number; cooperados?: number }> {
  const { data, error } = await supabase.rpc("hb_credit_sweep_cashback_to_credit", {
    p_cooperative_cnpj: normalizeCnpj(cnpj),
    p_mes_referencia: mesReferencia,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration de desconto/cashback não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }
  const result = data as { ok?: boolean; total_cents?: number; cooperados?: number };
  return {
    ok: Boolean(result?.ok),
    totalCents: Number(result?.total_cents ?? 0),
    cooperados: Number(result?.cooperados ?? 0),
  };
}
