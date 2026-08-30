import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import type {
  ContaCoopCooperadoLiquidacao,
  ContaCoopCompraEstornavel,
  ContaCoopDashboard,
  ContaCoopIntent,
  ContaCoopLedgerEntry,
  ContaCoopLimiteCooperado,
  ContaCoopLiquidacaoPreview,
  ContaCoopParceiro,
  ContaCoopSettlement,
  ContaCoopSettlementTransacao,
  ContaCoopSolicitacaoEstorno,
  ContaCoopTresValores,
  SolicitacaoEstornoStatus,
  ParceiroStatus,
  SettlementStatus,
} from "@/modules/hb-credit/types";
import { computeDisponivel, formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { calcLimiteFromPercentual, calcTetoGlobalCents, sumCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { INTENT_EXPIRY_MINUTES } from "@/modules/hb-credit/config";
import { decryptSensitiveField, encryptSensitiveField } from "@/lib/security/fieldCrypto";
import {
  intentStatusFromDb,
  intentStatusToDb,
  partnerStatusFromDb,
  partnerStatusToDb,
  receivableStatusFromDb,
} from "@/modules/hb-credit/infrastructure/mappers/statusMapper";

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
    .gte("created_at", since);

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
    pixKey: readStoredField(row.pix_key as string | undefined),
    pixHolderName: readStoredField(row.pix_holder_name as string | undefined),
    pixUpdatedAt: row.pix_updated_at ? String(row.pix_updated_at) : null,
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
    return { ok: false, error: "PIN financeiro inválido." };
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
    cooperadoNome?: string;
  }
): Promise<
  | { ok: true; transacaoId: string; receiptCode: string; disponivelAposCents: number; duplicate?: boolean }
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

  const txId = result.transacao_id ?? transacaoId;
  try {
    const { ensureFiscalNoteForTransaction } = await import("@/lib/supabase/hbCreditFiscalNotesStorage");
    await ensureFiscalNoteForTransaction(supabase, txId, input.cooperadoNome);
  } catch {
    /* tabela fiscal opcional até migration aplicada */
  }

  return {
    ok: true,
    transacaoId: txId,
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
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; error?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: result?.error ?? "Aprovação recusada." };

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
    divergences.push(
      `Utilizações confirmadas (${paymentTotal}) ≠ recebíveis criados (${receivableTotal}).`
    );
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
  const recebivelByTx: Record<string, { id: string; status: string }> = {};
  if (paymentIds.length) {
    const { data: recebiveis } = await supabase
      .from("hb_credit_receivables")
      .select("id, transaction_id, status")
      .in("transaction_id", paymentIds);
    for (const r of recebiveis ?? []) {
      recebivelByTx[String(r.transaction_id)] = { id: String(r.id), status: String(r.status) };
    }
  }

  return (txs ?? []).map((t) => {
    const intentId = t.payment_intent_id ? String(t.payment_intent_id) : "";
    const recebivel = recebivelByTx[String(t.id)];
    return {
      id: String(t.id),
      recebivelId: recebivel?.id ?? "",
      cooperadoId: String(t.cooperado_id ?? ""),
      tipo: String(t.event_type) as "PAYMENT" | "REFUND",
      amountCents: Number(t.amount_cents),
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
    if (recvError) return { ok: false, error: recvError.message };
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

  return {
    ok: true,
    settlement: mapSettlementRow(row as Record<string, unknown>, partnerRow?.name ? String(partnerRow.name) : undefined),
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

export async function listCooperadoContaCoopDescontosMes(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  mesReferencia: string
): Promise<Array<{ motivo: string; valorReais: number; tipo: "conta_coop"; createdAt: string }>> {
  const digits = normalizeCnpj(cnpj);
  const { start, end } = mesReferenciaRange(mesReferencia);
  const { data: txs } = await supabase
    .from("hb_credit_transactions")
    .select("id, event_type, amount_cents, created_at, partner_id, receipt_code")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .in("event_type", ["PAYMENT", "REFUND"])
    .eq("status", "posted")
    .gte("created_at", start)
    .lt("created_at", end)
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
