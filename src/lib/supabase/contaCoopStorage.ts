import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadSettlementComprovante } from "@/lib/supabase/hbCreditSettlementStorage";
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
  ContaCoopPinResetRequest,
  ContaCoopCooperadoPinResetRequest,
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
import {
  mapAuthorizeRpcError,
  markHbCreditLimitStale,
  markHbCreditLimitSynced,
} from "@/modules/hb-credit/engine/hbCreditLimitSyncState";
import { validateHbFinancialLimitRow } from "@/modules/hb-credit/engine/hbCreditFinancialLimitInvariants";
import { computeDisponivel, formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { signedLedgerAmountCentsForExtrato } from "@/lib/hb-credit/ledgerLabels";
import { calcLimiteFromPercentual, calcTetoGlobalCents, sumCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import type { AuthoritativeCreditBaseErrorPayload } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { pickCreditosBaseForLimitSync } from "@/modules/hb-credit/engine/creditBaseValidation";
import { capContaCoopLimiteToAuthoritativeBase, projetarLimitesListaCooperados } from "@/modules/hb-credit/engine/creditBaseHbGuard";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  canAffordHbPaymentScanPreview,
  canAffordHbPaymentWithLimite,
  HB_CREDIT_INSUFFICIENT_CODE,
  HB_CREDIT_SALDO_INSUFICIENTE_MSG,
  hbCreditEffectiveDisponivelCents,
} from "@/modules/hb-credit/engine/paymentAffordability";
import { INTENT_EXPIRY_MINUTES } from "@/modules/hb-credit/config";
import { getCurrentMesReferencia, mesReferenciaUtcRange, normalizeMesReferencia } from "@/utils/format";
import {
  impactoAReceberReais,
  statusResumoFromTx,
  valorReaisLinhaResumoCooperado,
  type HbUtilizacaoResumoLancamento,
} from "@/lib/hb-credit/utilizacaoResumo";
import { dedupeDescontosContaCoopRemotos } from "@/lib/hb-credit/mergeFichaDescontos";
import { buildHbCreditQrPayload, parseHbCreditQrPayload } from "@/lib/hb-credit/hbCreditQrPayload";
import { decryptSensitiveField, encryptSensitiveField } from "@/lib/security/fieldCrypto";
import {
  intentStatusFromDb,
  intentStatusToDb,
  partnerStatusFromDb,
  partnerStatusToDb,
  receivableStatusFromDb,
} from "@/modules/hb-credit/infrastructure/mappers/statusMapper";
import { humanizeCreditRefundError } from "@/lib/supabase/hbCreditRefundFixSchema";
import {
  reconcileCooperadoAmountUsedCents,
  reconcileCooperadosAmountUsedCentsBatch,
  resolveExpectedAmountUsedCentsForCooperado,
} from "@/lib/supabase/creditAmountUsedReconcile";
import { TERMO_MERCADO_CONTA_COOP_VERSAO } from "@/config/termoUsoMercadoContaCoop";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import {
  pickBestHbCreditAccountRow,
  titularCooperadoIds,
} from "@/lib/hb-credit/hbCreditLimiteTitularPick";
import { cooperadosUnicosParaCobranca } from "@/utils/cooperadoDedupe";
import { mesCicloEntregasPagamentosCompletos } from "@/services/repasseCicloEntregasGateService";

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
  return buildHbCreditQrPayload(intentId, nonce);
}

export function parseQrPayload(raw: string): { intentId: string; nonce: string } | null {
  return parseHbCreditQrPayload(raw);
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

export const TETO_NAO_CONFIGURADO =
  "Configuração financeira da cooperativa ausente. Defina o percentual de compra na aba Limites antes de liberar crédito.";

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

/** Percentual persistido de liberação/compra HB (fallback: teto global). */
export async function getCooperativaLiberacaoPercentConfigured(
  supabase: SupabaseClient,
  cnpj: string
): Promise<number | null> {
  const cap = await getTetoPercentConfigured(supabase, cnpj);
  if (cap == null) return null;
  const digits = normalizeCnpj(cnpj);
  const { data, error } = await supabase
    .from("hb_credit_cooperative_caps")
    .select("cooperativa_liberacao_percent")
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  if (error) {
    if (/cooperativa_liberacao_percent/i.test(error.message ?? "")) {
      return cap;
    }
    throw error;
  }

  if (!data || data.cooperativa_liberacao_percent == null) return cap;
  const lib = Number(data.cooperativa_liberacao_percent);
  if (!Number.isFinite(lib) || lib <= 0 || lib > 100) return cap;
  return lib;
}

async function persistCooperativaLiberacaoPercent(
  supabase: SupabaseClient,
  cnpj: string,
  percent: number,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { ok: false, error: "Percentual de liberação inválido." };
  }
  const digits = normalizeCnpj(cnpj);
  const { error } = await supabase
    .from("hb_credit_cooperative_caps")
    .update({
      cooperativa_liberacao_percent: percent,
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("cooperative_cnpj", digits);
  if (error) {
    if (/cooperativa_liberacao_percent/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: "Migration HB (cooperativa_liberacao_percent) não aplicada na nuvem.",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function resolveCreditosBaseForLiberacaoColetiva(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  clientBases: Record<string, number>
): Promise<Record<string, number>> {
  const auth = await resolveAuthoritativeCreditBase(supabase, cnpj, cooperadoIds);
  if (!auth.ok) return clientBases;
  return pickCreditosBaseForLimitSync({
    authoritative: auth.creditosBaseCents,
    cooperadoIds,
    clientPreview: clientBases,
  }).creditosBaseCents;
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

  /** Não altera cooperativa_liberacao_percent — liberação coletiva persiste o % de compra. */
  const row = {
    cooperative_cnpj: digits,
    global_credit_cap_percent: tetoPercent,
    global_credit_cap_cents: tetoCents,
    updated_by: actorUserId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("hb_credit_cooperative_caps").upsert(row);
  if (error && /global_credit_cap_percent|cooperativa_liberacao_percent/i.test(error.message ?? "")) {
    const { global_credit_cap_percent: _p, ...legacyRow } = row;
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
  return `Ultrapassa o teto global (${tetoPercent}% = ${formatCentsBRL(tetoCents)}). Total após liberação: ${formatCentsBRL(totalAposCents)}. Aumente o percentual na aba Limites.`;
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
  const liberacaoColetivaPercent =
    tetoResult.configured
      ? (await getCooperativaLiberacaoPercentConfigured(supabase, digits)) ?? tetoPercent
      : 0;

  const limitesEfetivos = await listLimitesCooperadosAlinhadosAEntregas(supabase, digits, {
    resyncIfInflated: false,
  });
  let limiteDistribuido = 0;
  let usadoTotal = 0;
  for (const l of limitesEfetivos) {
    limiteDistribuido += l.limiteLiberadoCents;
    usadoTotal += l.valorUsadoCents;
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
      liberacaoColetivaPercent,
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

/** Lista de limites exibida ao responsável — capada pela base autoritativa e re-sync se DB inflado. */
export async function listLimitesCooperadosAlinhadosAEntregas(
  supabase: SupabaseClient,
  cnpj: string,
  opts?: { resyncIfInflated?: boolean; actorUserId?: string }
): Promise<ContaCoopLimiteCooperado[]> {
  const { limites } = await listLimitesCooperadosAlinhadosComBase(supabase, cnpj, opts);
  return limites;
}

export async function listLimitesCooperadosAlinhadosComBase(
  supabase: SupabaseClient,
  cnpj: string,
  opts?: {
    resyncIfInflated?: boolean;
    actorUserId?: string;
    /** Só contas HB na nuvem — sem operacional/notas (resposta rápida). */
    fast?: boolean;
    /** Reconcilia “usado” e persiste liberado = teto% × base (somente com persist=1). */
    persistFichaSync?: boolean;
    /** Força reconcile de usado (só quando persistFichaSync). */
    reconcileUsed?: boolean;
    /** Inclui bases autoritativas para todos os ativos (valor a receber na nuvem). */
    authoritativeCooperadoIds?: string[];
  }
): Promise<{
  limites: ContaCoopLimiteCooperado[];
  creditosBaseCents: Record<string, number>;
  authoritativeError?: AuthoritativeCreditBaseErrorPayload;
}> {
  const digits = normalizeCnpj(cnpj);
  const limitesRaw = await listLimitesCooperados(supabase, cnpj);
  if (opts?.fast) {
    return { limites: limitesRaw, creditosBaseCents: {} };
  }

  const persistFichaSync = opts?.persistFichaSync === true;
  const heavyListSync = persistFichaSync || opts?.resyncIfInflated === true;
  /** GET padrão = só hb_credit_accounts (rápido). BIC/autoritativo só em persist/resync explícitos. */
  if (!heavyListSync) {
    return { limites: limitesRaw, creditosBaseCents: {} };
  }

  /** Reconcile em lote só no sync explícito — GET leve evita timeout/resposta vazia. */
  const reconcileUsed = persistFichaSync;

  const idsReconcile = [
    ...new Set([
      ...limitesRaw.map((l) => l.cooperadoId),
      ...(opts?.authoritativeCooperadoIds ?? []),
    ]),
  ].filter(Boolean);
  if (reconcileUsed && idsReconcile.length) {
    const actor = opts?.actorUserId ?? "system:hb_limites_amount_used_sync";
    await reconcileCooperadosAmountUsedCentsBatch(supabase, digits, idsReconcile, actor);
  }

  let limitesPosSync =
    reconcileUsed && idsReconcile.length
      ? await listLimitesCooperados(supabase, cnpj)
      : limitesRaw;

  const idsParaBase = [
    ...new Set([
      ...limitesPosSync.map((l) => l.cooperadoId),
      ...(opts?.authoritativeCooperadoIds ?? []),
    ]),
  ].filter(Boolean);

  if (!idsParaBase.length) {
    return { limites: limitesPosSync, creditosBaseCents: {} };
  }

  const authoritative = await resolveAuthoritativeCreditBase(supabase, cnpj, idsParaBase);
  if (!authoritative.ok) {
    return {
      limites: limitesPosSync,
      creditosBaseCents: {},
      authoritativeError: { code: authoritative.code, message: authoritative.message },
    };
  }

  if (persistFichaSync) {
    const actorSync = opts?.actorUserId ?? "system:hb_limites_ficha_sync";
    const pickedBase = pickCreditosBaseForLimitSync({
      authoritative: authoritative.creditosBaseCents,
      cooperadoIds: idsParaBase,
    });
    await syncLimitesCooperadosFromCreditoBase(
      supabase,
      cnpj,
      idsParaBase,
      pickedBase.creditosBaseCents,
      actorSync
    );
    limitesPosSync = await listLimitesCooperados(supabase, cnpj);
  }

  const teto = await resolveTetoGlobal(supabase, cnpj, authoritative.creditosBaseCents);
  const tetoPercent = teto.configured ? teto.percent : 0;
  const liberacaoPercent = teto.configured
    ? (await getCooperativaLiberacaoPercentConfigured(supabase, cnpj)) ?? tetoPercent
    : null;

  const resolverCanonico = (id: string) =>
    resolverCooperadoIdCanonico(authoritative.creditoBaseAppData, id, authoritative.cooperativaId);

  const capped = limitesPosSync.map((limite) => {
    const canon = resolverCanonico(limite.cooperadoId);
    const base = Math.max(
      authoritative.creditosBaseCents[limite.cooperadoId] ?? 0,
      authoritative.creditosBaseCents[canon] ?? 0
    );
    return capContaCoopLimiteToAuthoritativeBase(limite, base, tetoPercent, liberacaoPercent);
  });

  let limitesParaUi = capped;
  if (opts?.authoritativeCooperadoIds?.length) {
    limitesParaUi = projetarLimitesListaCooperados(
      capped,
      opts.authoritativeCooperadoIds,
      authoritative.creditosBaseCents,
      tetoPercent,
      resolverCanonico,
      liberacaoPercent
    );
  }

  if (opts?.resyncIfInflated && opts.actorUserId) {
    const toSync: string[] = [];
    const creditosBaseCents: Record<string, number> = {};
    for (let i = 0; i < limitesPosSync.length; i++) {
      const raw = limitesPosSync[i];
      const cap = capped[i];
      if (cap.limiteLiberadoCents >= raw.limiteLiberadoCents) continue;
      toSync.push(raw.cooperadoId);
      creditosBaseCents[raw.cooperadoId] = authoritative.creditosBaseCents[raw.cooperadoId] ?? 0;
    }
    if (toSync.length) {
      await syncLimitesCooperadosFromCreditoBase(
        supabase,
        cnpj,
        toSync,
        creditosBaseCents,
        opts.actorUserId
      ).catch(() => {});
      limitesPosSync = await listLimitesCooperados(supabase, cnpj);
      const cappedAfter = limitesPosSync.map((limite) => {
        const canon = resolverCanonico(limite.cooperadoId);
        const base = Math.max(
          authoritative.creditosBaseCents[limite.cooperadoId] ?? 0,
          authoritative.creditosBaseCents[canon] ?? 0
        );
        return capContaCoopLimiteToAuthoritativeBase(limite, base, tetoPercent, liberacaoPercent);
      });
      limitesParaUi = opts?.authoritativeCooperadoIds?.length
        ? projetarLimitesListaCooperados(
            cappedAfter,
            opts.authoritativeCooperadoIds,
            authoritative.creditosBaseCents,
            tetoPercent,
            resolverCanonico,
            liberacaoPercent
          )
        : cappedAfter;
    }
  }

  return { limites: limitesParaUi, creditosBaseCents: authoritative.creditosBaseCents };
}

function mapLimiteRow(row: Record<string, unknown>, cashbackDisponivelCents = 0): ContaCoopLimiteCooperado {
  const limite = Number(row.limit_released_cents);
  const usado = Number(row.amount_used_cents);
  const capRaw = row.financial_limit_cap_cents;
  const cap = capRaw == null || capRaw === "" ? null : Number(capRaw);
  const status = String(row.status ?? "active");
  return {
    id: String(row.id),
    cooperativaCnpj: String(row.cooperative_cnpj),
    cooperadoId: String(row.cooperado_id),
    limiteLiberadoCents: limite,
    valorUsadoCents: usado,
    valorDisponivelCents: hbCreditEffectiveDisponivelCents(limite, cap, usado),
    bloqueado: status === "blocked",
    hasFinancialPin: Boolean(row.pin_hash),
    pinLockedUntil: row.pin_locked_until ? String(row.pin_locked_until) : null,
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

/** Rebaixa limit_released após quitação (base M6 = 0) — bypass teto global; só reduz ou mantém ≥ usado. */
async function persistLimiteReleasedAfterCreditoBaseZero(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  novoLimiteCents: number,
  actorUserId: string
): Promise<{ ok: true; limite: ContaCoopLimiteCooperado } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const alvo = Math.max(0, Math.round(novoLimiteCents));
  const { data: existing } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const usado = existing ? Number(existing.amount_used_cents) : 0;
  if (alvo < usado) {
    return { ok: false, error: "Novo limite não pode ser menor que o valor já usado." };
  }

  const anterior = existing ? Number(existing.limit_released_cents) : 0;
  const now = new Date().toISOString();

  const upsertPayload: Record<string, unknown> = {
    cooperative_cnpj: digits,
    cooperado_id: cooperadoId,
    limit_released_cents: alvo,
    financial_limit_cap_cents: alvo,
    financial_limit_base_cents: 0,
    financial_limit_ceiling_cents: alvo,
    amount_used_cents: usado,
    status: existing?.status ?? "active",
    updated_at: now,
    updated_by: actorUserId,
  };

  let { data, error } = await supabase
    .from("hb_credit_accounts")
    .upsert(upsertPayload, { onConflict: "cooperative_cnpj,cooperado_id" })
    .select()
    .single();

  if (error && /financial_limit_(base|ceiling|cap)_cents/i.test(error.message ?? "")) {
    const {
      financial_limit_base_cents: _b,
      financial_limit_ceiling_cents: _c,
      financial_limit_cap_cents: _cap,
      ...legacyPayload
    } = upsertPayload;
    ({ data, error } = await supabase
      .from("hb_credit_accounts")
      .upsert(legacyPayload, { onConflict: "cooperative_cnpj,cooperado_id" })
      .select()
      .single());
  }

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "LIMIT_TIGHTENED_BASE_ZERO",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: {
      anterior: { limiteLiberadoCents: anterior, valorUsadoCents: usado },
      novo: { limiteLiberadoCents: alvo, baseSnapshotCents: 0, ceilingSnapshotCents: alvo },
    },
  });

  return { ok: true, limite: mapLimiteRow(data as Record<string, unknown>) };
}

/** Grava limite na nuvem (sem revalidar teto — use após preview coletivo ou preview individual). */
async function writeLimiteCooperadoCents(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  novoLimiteCents: number,
  actorUserId: string,
  auditMetadata: { anterior?: ContaCoopTresValores; novo: { limiteLiberadoCents: number } },
  auditAction: "LIMIT_CHANGED" | "LIMIT_COLLECTIVE" = "LIMIT_CHANGED"
): Promise<{ ok: true; limite: ContaCoopLimiteCooperado } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data: existing } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const usado = existing ? Number(existing.amount_used_cents) : 0;
  if (novoLimiteCents < usado) {
    return { ok: false, error: "Novo limite não pode ser menor que o valor já usado." };
  }

  const now = new Date().toISOString();
  const upsertPayload: Record<string, unknown> = {
    cooperative_cnpj: digits,
    cooperado_id: cooperadoId,
    limit_released_cents: novoLimiteCents,
    financial_limit_cap_cents: novoLimiteCents,
    amount_used_cents: usado,
    status: existing?.status ?? "active",
    updated_at: now,
    updated_by: actorUserId,
  };

  let { data, error } = await supabase
    .from("hb_credit_accounts")
    .upsert(upsertPayload, { onConflict: "cooperative_cnpj,cooperado_id" })
    .select()
    .single();

  if (error && /financial_limit_cap_cents/i.test(error.message ?? "")) {
    const { financial_limit_cap_cents: _c, ...legacyPayload } = upsertPayload;
    ({ data, error } = await supabase
      .from("hb_credit_accounts")
      .upsert(legacyPayload, { onConflict: "cooperative_cnpj,cooperado_id" })
      .select()
      .single());
  }

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: auditAction,
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: auditMetadata,
  });

  await markHbCreditLimitStale(supabase, {
    cnpj,
    cooperadoId,
    actorUserId,
    reason: "manual_limit_write_without_authoritative_snapshot",
  }).catch(() => {});

  return { ok: true, limite: mapLimiteRow(data as Record<string, unknown>) };
}

/** Sync autoritativo: persiste L + snapshot B/teto sem promover SYNCED (caller valida via RPC). */
async function writeLimiteCooperadoAuthoritativeSync(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  opts: {
    limitReleasedCents: number;
    baseSnapshotCents: number;
    ceilingSnapshotCents: number;
    actorUserId: string;
    auditMetadata: Record<string, unknown>;
  }
): Promise<{ ok: true; limite: ContaCoopLimiteCooperado } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const novoLimiteCents = Math.max(0, Math.round(opts.limitReleasedCents));
  const baseSnapshot = Math.max(0, Math.round(opts.baseSnapshotCents));
  const ceilingSnapshot = Math.max(0, Math.round(opts.ceilingSnapshotCents));

  const { data: existing } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const usado = existing ? Number(existing.amount_used_cents) : 0;
  if (novoLimiteCents < usado) {
    return { ok: false, error: "Novo limite não pode ser menor que o valor já usado." };
  }

  const now = new Date().toISOString();
  const upsertPayload: Record<string, unknown> = {
    cooperative_cnpj: digits,
    cooperado_id: cooperadoId,
    limit_released_cents: novoLimiteCents,
    financial_limit_cap_cents: novoLimiteCents,
    financial_limit_base_cents: baseSnapshot,
    financial_limit_ceiling_cents: ceilingSnapshot,
    amount_used_cents: usado,
    status: existing?.status ?? "active",
    updated_at: now,
    updated_by: opts.actorUserId,
  };

  let { data, error } = await supabase
    .from("hb_credit_accounts")
    .upsert(upsertPayload, { onConflict: "cooperative_cnpj,cooperado_id" })
    .select()
    .single();

  if (error && /financial_limit_(base|ceiling|cap)_cents/i.test(error.message ?? "")) {
    const {
      financial_limit_base_cents: _b,
      financial_limit_ceiling_cents: _c,
      financial_limit_cap_cents: _cap,
      ...legacyPayload
    } = upsertPayload;
    ({ data, error } = await supabase
      .from("hb_credit_accounts")
      .upsert(legacyPayload, { onConflict: "cooperative_cnpj,cooperado_id" })
      .select()
      .single());
  }

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: opts.actorUserId,
    action: "LIMIT_AUTHORITATIVE_SYNC",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: opts.auditMetadata,
  });

  return { ok: true, limite: mapLimiteRow(data as Record<string, unknown>) };
}

function hbCreditAccountRowSnapshotCoherent(row: Record<string, unknown>): boolean {
  const capRaw = row.financial_limit_cap_cents;
  const cap = capRaw == null || capRaw === "" ? null : Number(capRaw);
  const baseRaw = row.financial_limit_base_cents;
  const base = baseRaw == null || baseRaw === "" ? null : Number(baseRaw);
  const ceilingRaw = row.financial_limit_ceiling_cents;
  const ceiling = ceilingRaw == null || ceilingRaw === "" ? null : Number(ceilingRaw);
  return validateHbFinancialLimitRow({
    limitReleasedCents: Number(row.limit_released_cents ?? 0),
    capCents: cap,
    amountUsedCents: Number(row.amount_used_cents ?? 0),
    baseSnapshotCents: base,
    ceilingSnapshotCents: ceiling,
  }).ok;
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

  return writeLimiteCooperadoCents(
    supabase,
    cnpj,
    cooperadoId,
    novoLimiteCents,
    actorUserId,
    { anterior: preview.atual, novo: { limiteLiberadoCents: novoLimiteCents } },
    "LIMIT_CHANGED"
  );
}

/** Zera limite e valor usado após liquidação (cooperado ou mercado). */
export async function resetContaCoopCooperadoCredit(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string,
  metadata?: Record<string, unknown>
): Promise<{ ok: true; limite: ContaCoopLimiteCooperado } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("hb_credit_accounts")
    .upsert(
      {
        cooperative_cnpj: digits,
        cooperado_id: cooperadoId,
        limit_released_cents: 0,
        amount_used_cents: 0,
        status: "active",
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
    action: "CREDIT_RESET",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: metadata ?? { motivo: "liquidacao" },
  });

  return { ok: true, limite: mapLimiteRow(data as Record<string, unknown>) };
}

async function cooperadoTemComprasContaCoopAtivas(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  const { data: payments } = await supabase
    .from("hb_credit_transactions")
    .select("amount_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted");

  const { data: refunds } = await supabase
    .from("hb_credit_transactions")
    .select("amount_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .eq("event_type", "REFUND")
    .eq("status", "posted");

  const pago = (payments ?? []).reduce((s, r) => s + Number(r.amount_cents), 0);
  const estornado = (refunds ?? []).reduce((s, r) => s + Number(r.amount_cents), 0);
  return pago - estornado > 0;
}

/** Sincroniza limite liberado = teto% × crédito base (valor a receber pendente, alinhado ao cooperado). */
export async function syncLimiteCooperadoFromCreditoBase(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  creditoBaseCents: number,
  actorUserId: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<
  | { ok: true; limite: ContaCoopLimiteCooperado; action?: "reset" | "tightened" | "synced" | "unchanged" }
  | { ok: false; error: string }
> {
  const base = Math.max(0, Math.round(Number(creditoBaseCents) || 0));
  if (base === 0) {
    const foundRow = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
    const atual = await getLimiteCooperado(supabase, cnpj, cooperadoId);
    if (!atual) {
      const digits = normalizeCnpj(cnpj);
      return {
        ok: true,
        limite: {
          id: "",
          cooperativaCnpj: digits,
          cooperadoId,
          limiteLiberadoCents: 0,
          valorUsadoCents: 0,
          valorDisponivelCents: 0,
          bloqueado: false,
          hasFinancialPin: false,
          pinLockedUntil: null,
          cashbackDisponivelCents: 0,
          updatedAt: new Date().toISOString(),
        },
        action: "unchanged",
      };
    }
    const alvoCents = Math.max(0, atual.valorUsadoCents);
    const snapshotOk = foundRow ? hbCreditAccountRowSnapshotCoherent(foundRow.row) : false;
    const limitAlreadyAligned = atual.limiteLiberadoCents === alvoCents;
    if (limitAlreadyAligned && snapshotOk) {
      return {
        ok: true,
        limite: {
          ...atual,
          valorDisponivelCents: computeDisponivel(atual.limiteLiberadoCents, atual.valorUsadoCents),
        },
        action: "unchanged",
      };
    }
    const tightened = await persistLimiteReleasedAfterCreditoBaseZero(
      supabase,
      cnpj,
      cooperadoId,
      alvoCents,
      actorUserId
    );
    if (!tightened.ok) return tightened;
    return { ...tightened, action: limitAlreadyAligned ? ("unchanged" as const) : ("tightened" as const) };
  }

  const teto = await requireConfiguredTeto(supabase, cnpj, creditosBaseCents);
  if (!teto.ok) return { ok: false, error: teto.error };

  const releasePercent =
    (await getCooperativaLiberacaoPercentConfigured(supabase, cnpj)) ?? teto.percent;

  let novoLimiteCents = calcLimiteFromPercentual(base, releasePercent);
  const tetoMaxCents = calcLimiteFromPercentual(base, teto.percent);
  if (novoLimiteCents > tetoMaxCents) {
    novoLimiteCents = tetoMaxCents;
  }
  const { valorUsadoCents } = await readLimiteAtualCooperado(supabase, cnpj, cooperadoId);
  if (novoLimiteCents < valorUsadoCents) {
    novoLimiteCents = valorUsadoCents;
  }

  const preview = await previewLimiteAlteracao(
    supabase,
    cnpj,
    cooperadoId,
    novoLimiteCents,
    creditosBaseCents
  );
  if (!preview.ok) return { ok: false, error: preview.error! };

  const synced = await writeLimiteCooperadoAuthoritativeSync(supabase, cnpj, cooperadoId, {
    limitReleasedCents: novoLimiteCents,
    baseSnapshotCents: base,
    ceilingSnapshotCents: tetoMaxCents,
    actorUserId,
    auditMetadata: {
      anterior: preview.atual,
      novo: { limiteLiberadoCents: novoLimiteCents, baseSnapshotCents: base, ceilingSnapshotCents: tetoMaxCents },
      creditoBaseCents: base,
    },
  });
  if (!synced.ok) return synced;
  return { ...synced, action: "synced" as const };
}

export async function syncLimitesCooperadosFromCreditoBase(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  creditosBaseCents: Record<string, number>,
  actorUserId: string
): Promise<
  | {
      ok: true;
      updated: number;
      reset: number;
      tightened: number;
      synced: number;
      unchanged: number;
      errors: string[];
    }
  | { ok: false; error: string }
> {
  if (!cooperadoIds.length) return { ok: false, error: "Informe ao menos um cooperado." };

  const digits = normalizeCnpj(cnpj);
  const bases: Record<string, number> = { ...creditosBaseCents };
  const selected = new Set(cooperadoIds);

  const { data: accountRows } = await supabase
    .from("hb_credit_accounts")
    .select("cooperado_id")
    .eq("cooperative_cnpj", digits);

  const orphanIds: string[] = [];
  for (const row of accountRows ?? []) {
    const id = String(row.cooperado_id ?? "");
    if (!id || selected.has(id)) continue;
    orphanIds.push(id);
    if (bases[id] === undefined) bases[id] = 0;
  }

  const allIds = [...new Set([...orphanIds, ...cooperadoIds])];
  const ordered = allIds.sort((a, b) => {
    const ba = Math.max(0, Math.round(Number(bases[a] ?? 0)));
    const bb = Math.max(0, Math.round(Number(bases[b] ?? 0)));
    if (ba === 0 && bb > 0) return -1;
    if (bb === 0 && ba > 0) return 1;
    return 0;
  });

  let updated = 0;
  let reset = 0;
  let tightened = 0;
  let synced = 0;
  let unchanged = 0;
  const errors: string[] = [];
  for (const cooperadoId of ordered) {
    const base = Math.max(0, Math.round(Number(bases[cooperadoId] ?? 0)));
    const result = await syncLimiteCooperadoFromCreditoBase(
      supabase,
      cnpj,
      cooperadoId,
      base,
      actorUserId,
      bases
    );
    if (!result.ok) {
      errors.push(`${cooperadoId}: ${result.error}`);
      continue;
    }
    updated++;
    switch (result.action) {
      case "reset":
        reset++;
        break;
      case "tightened":
        tightened++;
        break;
      case "synced":
        synced++;
        break;
      case "unchanged":
        unchanged++;
        break;
      default:
        if (base > 0) synced++;
        else reset++;
        break;
    }
  }

  if (updated === 0 && errors.length) {
    return { ok: false, error: errors[0] };
  }

  return { ok: true, updated, reset, tightened, synced, unchanged, errors };
}

/** Zera crédito dos cooperados envolvidos numa liquidação de mercado confirmada. */
export async function resetContaCoopCooperadosFromSettlement(
  supabase: SupabaseClient,
  settlementId: string,
  actorUserId: string
): Promise<void> {
  const { data: receivables } = await supabase
    .from("hb_credit_receivables")
    .select("cooperative_cnpj, cooperado_id")
    .eq("settlement_id", settlementId);

  const seen = new Set<string>();
  for (const row of receivables ?? []) {
    const cnpj = String(row.cooperative_cnpj ?? "");
    const cooperadoId = String(row.cooperado_id ?? "");
    if (!cnpj || !cooperadoId) continue;
    const key = `${cnpj}:${cooperadoId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await resetContaCoopCooperadoCredit(supabase, cnpj, cooperadoId, actorUserId, {
      source: "partner_settlement",
      settlementId,
    });
  }
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
    hasFinancialPin: Boolean(row.pin_hash),
    pinLockedUntil: row.pin_locked_until ? String(row.pin_locked_until) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function fetchHbCreditAccountRowForCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<{ row: Record<string, unknown>; accountCooperadoId: string } | null> {
  const digits = normalizeCnpj(cnpj);
  const cooperados = await fetchCooperadosFromStorage(supabase, digits).catch(() => []);
  const titularIds = cooperados.length ? titularCooperadoIds(cooperados, cooperadoId) : [cooperadoId];

  const { data: rows } = await supabase
    .from("hb_credit_accounts")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .in("cooperado_id", titularIds);

  if (!rows?.length) return null;

  const best = pickBestHbCreditAccountRow(rows as Record<string, unknown>[]);
  if (!best) return null;
  return {
    row: best,
    accountCooperadoId: String(best.cooperado_id ?? cooperadoId),
  };
}

export type HbCreditAccountRevision = {
  updatedAt: string | null;
  limitReleasedCents: number;
  amountUsedCents: number;
  /** Assinatura estável para poll cross-device (responsável → cooperado). */
  revision: string;
};

export async function getHbCreditAccountRevision(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<HbCreditAccountRevision | null> {
  const found = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  if (!found) return null;
  const updatedAt = found.row.updated_at ? String(found.row.updated_at) : null;
  const limitReleasedCents = Math.max(0, Math.round(Number(found.row.limit_released_cents ?? 0)));
  const amountUsedCents = Math.max(0, Math.round(Number(found.row.amount_used_cents ?? 0)));
  return {
    updatedAt,
    limitReleasedCents,
    amountUsedCents,
    revision: `${updatedAt ?? ""}|${limitReleasedCents}|${amountUsedCents}`,
  };
}

export type HbCreditLimitesRevision = {
  revision: string;
  accountCount: number;
};

/** Assinatura leve para poll do responsável (pagamentos cooperado, liberações, usado). */
export async function getHbCreditLimitesRevision(
  supabase: SupabaseClient,
  cnpj: string
): Promise<HbCreditLimitesRevision> {
  const digits = normalizeCnpj(cnpj);
  const { data, error } = await supabase
    .from("hb_credit_accounts")
    .select("cooperado_id, updated_at, limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits);
  if (error || !data?.length) {
    return { revision: error ? `err:${error.message}` : "empty", accountCount: 0 };
  }
  const parts = [...data]
    .sort((a, b) => String(a.cooperado_id).localeCompare(String(b.cooperado_id)))
    .map((row) => {
      const id = String(row.cooperado_id ?? "");
      const at = row.updated_at ? String(row.updated_at) : "";
      const lim = Math.max(0, Math.round(Number(row.limit_released_cents ?? 0)));
      const used = Math.max(0, Math.round(Number(row.amount_used_cents ?? 0)));
      return `${id}:${at}:${lim}:${used}`;
    });
  return { revision: parts.join(";"), accountCount: data.length };
}

export type HbCreditPrepareAuthorizeResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export async function getLimiteCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  opts?: { skipAmountUsedReconcile?: boolean; fastPreview?: boolean }
): Promise<ContaCoopLimiteCooperado | null> {
  const digits = normalizeCnpj(cnpj);
  let titularIds = [cooperadoId];
  if (!opts?.fastPreview) {
    const cooperados = await fetchCooperadosFromStorage(supabase, digits).catch(() => []);
    titularIds = cooperados.length ? titularCooperadoIds(cooperados, cooperadoId) : [cooperadoId];
    if (!opts?.skipAmountUsedReconcile) {
      await reconcileCooperadosAmountUsedCentsBatch(supabase, digits, titularIds).catch(() => {});
    }
  }

  const found = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  if (!found) return null;
  const cashback = await getCashbackDisponivel(supabase, digits, found.accountCooperadoId);
  const mapped = mapLimiteRow(found.row, cashback);

  const liberado = mapped.limiteLiberadoCents;
  const usado = opts?.fastPreview
    ? Math.max(0, Math.round(Number(found.row.amount_used_cents ?? 0)))
    : Math.min(
        Math.max(0, await resolveExpectedAmountUsedCentsForCooperado(supabase, digits, cooperadoId)),
        liberado >= 0 ? liberado : Math.max(0, Math.round(Number(found.row.amount_used_cents ?? 0)))
      );
  const capRaw = found.row.financial_limit_cap_cents;
  const cap = capRaw == null || capRaw === "" ? null : Number(capRaw);
  const withUsado = {
    ...mapped,
    valorUsadoCents: usado,
    valorDisponivelCents: hbCreditEffectiveDisponivelCents(liberado, cap, usado),
  };

  if (withUsado.cooperadoId !== cooperadoId) {
    return { ...withUsado, cooperadoId };
  }
  return withUsado;
}

/**
 * Grava na nuvem limit_released alinhado à base M6 quando STALE ou inflado acima do teto autoritativo.
 * Garante paridade entre aba Limites (staff) e Minha Conta HB (cooperado).
 */
export async function ensureHbCreditLimiteAutoritativoPersistido(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<HbCreditPrepareAuthorizeResult> {
  const digits = normalizeCnpj(cnpj);
  const found = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  if (!found) return { ok: true };

  const syncState = String(found.row.financial_limit_sync_state ?? "SYNCED");
  const accountCooperadoId = found.accountCooperadoId;
  const snapshotOk = hbCreditAccountRowSnapshotCoherent(found.row);

  /** Pagamento: não bloquear em M6 quando a conta já está coerente na nuvem. */
  if (syncState === "SYNCED" && snapshotOk) {
    void reconcileCooperadosAmountUsedCentsBatch(supabase, digits, [accountCooperadoId]).catch(() => {});
    return { ok: true };
  }

  if (syncState !== "SYNCED" && snapshotOk) {
    const markOnly = await markHbCreditLimitSynced(supabase, {
      cnpj: digits,
      cooperadoId: accountCooperadoId,
      actorUserId,
    });
    if (markOnly.ok) {
      void reconcileCooperadosAmountUsedCentsBatch(supabase, digits, [accountCooperadoId]).catch(() => {});
      return { ok: true };
    }
  }

  const cooperados = await fetchCooperadosFromStorage(supabase, digits).catch(() => []);
  const titularIds = cooperados.length ? titularCooperadoIds(cooperados, cooperadoId) : [cooperadoId];

  await reconcileCooperadosAmountUsedCentsBatch(supabase, digits, titularIds).catch(() => {});

  const limite = await getLimiteCooperado(supabase, cnpj, cooperadoId, {
    skipAmountUsedReconcile: true,
  });
  if (!limite) return { ok: true };

  const authoritative = await resolveAuthoritativeCreditBase(supabase, cnpj, titularIds);
  if (!authoritative.ok) {
    return { ok: false, error: authoritative.message, code: authoritative.code };
  }

  const canon = resolverCooperadoIdCanonico(
    authoritative.creditoBaseAppData,
    cooperadoId,
    authoritative.cooperativaId
  );
  const creditoBaseCents = Math.max(
    authoritative.creditosBaseCents[cooperadoId] ?? 0,
    authoritative.creditosBaseCents[canon] ?? 0
  );
  const teto = await resolveTetoGlobal(supabase, cnpj, authoritative.creditosBaseCents);
  const tetoPercent = teto.configured ? teto.percent : 0;
  const liberacaoPercent = teto.configured
    ? (await getCooperativaLiberacaoPercentConfigured(supabase, cnpj)) ?? tetoPercent
    : null;
  const capped = capContaCoopLimiteToAuthoritativeBase(
    limite,
    creditoBaseCents,
    tetoPercent,
    liberacaoPercent
  );

  const inflated = limite.limiteLiberadoCents > capped.limiteLiberadoCents;
  if (syncState === "SYNCED" && !inflated && snapshotOk) {
    return { ok: true };
  }

  const sync = await syncLimitesCooperadosFromCreditoBase(
    supabase,
    digits,
    titularIds,
    authoritative.creditosBaseCents,
    actorUserId
  );

  if (!sync.ok) {
    return { ok: false, error: sync.error, code: "HB_LIMIT_SYNC_FAILED" };
  }

  const titularFailed = sync.errors.some((line) => {
    const id = line.split(":")[0]?.trim();
    return id ? titularIds.includes(id) : false;
  });
  if (titularFailed) {
    return {
      ok: false,
      error: sync.errors.join("; "),
      code: "HB_LIMIT_SYNC_PARTIAL_FAILED",
    };
  }

  const refreshed = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  if (!refreshed || !hbCreditAccountRowSnapshotCoherent(refreshed.row)) {
    return {
      ok: false,
      error: "Snapshot de limite HB não persistido após sincronização.",
      code: "HB_CREDIT_LIMIT_SNAPSHOT_MISSING",
    };
  }

  const mark = await markHbCreditLimitSynced(supabase, {
    cnpj: digits,
    cooperadoId: accountCooperadoId,
    actorUserId,
  });
  if (!mark.ok) {
    return {
      ok: false,
      error: mark.error,
      code: mark.code ?? "HB_LIMIT_SYNC_STATE_UPDATE_FAILED",
    };
  }

  return { ok: true };
}

/** Limite exibido/usado no HB — nunca acima do crédito-base das entregas conferidas na nuvem. */
export async function getLimiteCooperadoAlinhadoAEntregas(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  opts?: {
    resyncIfInflated?: boolean;
    awaitResync?: boolean;
    actorUserId?: string;
    /** Persiste drift STALE/inflado antes de capar (API cooperado). */
    ensurePersisted?: boolean;
  }
): Promise<ContaCoopLimiteCooperado | null> {
  if (opts?.ensurePersisted && opts.actorUserId) {
    await ensureHbCreditLimiteAutoritativoPersistido(
      supabase,
      cnpj,
      cooperadoId,
      opts.actorUserId
    );
  }

  const limite = await getLimiteCooperado(supabase, cnpj, cooperadoId);
  if (!limite) return null;

  const authoritative = await resolveAuthoritativeCreditBase(supabase, cnpj, [cooperadoId]);
  if (!authoritative.ok) return limite;

  const canon = resolverCooperadoIdCanonico(
    authoritative.creditoBaseAppData,
    cooperadoId,
    authoritative.cooperativaId
  );
  const creditoBaseCents = Math.max(
    authoritative.creditosBaseCents[cooperadoId] ?? 0,
    authoritative.creditosBaseCents[canon] ?? 0
  );
  const teto = await resolveTetoGlobal(supabase, cnpj, authoritative.creditosBaseCents);
  const tetoPercent = teto.configured ? teto.percent : 0;
  const liberacaoPercent = teto.configured
    ? (await getCooperativaLiberacaoPercentConfigured(supabase, cnpj)) ?? tetoPercent
    : null;
  const capped = capContaCoopLimiteToAuthoritativeBase(
    limite,
    creditoBaseCents,
    tetoPercent,
    liberacaoPercent
  );

  const accountRow = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  const syncCooperadoId = accountRow?.accountCooperadoId ?? cooperadoId;

  const inflated =
    opts?.resyncIfInflated &&
    capped.limiteLiberadoCents < limite.limiteLiberadoCents &&
    opts.actorUserId;

  if (inflated) {
    const syncPromise = syncLimitesCooperadosFromCreditoBase(
      supabase,
      cnpj,
      [syncCooperadoId],
      { [syncCooperadoId]: creditoBaseCents, [cooperadoId]: creditoBaseCents },
      opts.actorUserId!
    );
    if (opts.awaitResync) {
      try {
        await syncPromise;
      } catch {
        /* exibe cap enquanto re-sync falha */
      }
      return getLimiteCooperadoAlinhadoAEntregas(supabase, cnpj, cooperadoId, {
        resyncIfInflated: false,
        awaitResync: false,
        actorUserId: opts.actorUserId,
      });
    }
    void syncPromise.catch(() => {});
  }

  return capped;
}

/**
 * Saldo HB exibido no cooperado — conta na nuvem (rápido). Pagamento valida com a mesma leitura em modo fast.
 */
export async function getLimiteCooperadoExibicaoParidadeLimites(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<ContaCoopLimiteCooperado | null> {
  return getLimiteCooperado(supabase, cnpj, cooperadoId);
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
  const found = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  const accountCooperadoId = found?.accountCooperadoId ?? cooperadoId;
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("pin_hash, pin_locked_until")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", accountCooperadoId)
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
    await recordPinFailure(supabase, cnpj, accountCooperadoId, actorUserId);
    return { ok: false, error: "PIN financeiro inválido." };
  }

  await resetPinFailures(supabase, cnpj, accountCooperadoId);
  return { ok: true };
}

export async function resetCooperadoFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data: account } = await supabase
    .from("hb_credit_accounts")
    .select("id, cooperado_id")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (!account) {
    return { ok: false, error: "Conta HB Créditos do cooperado não encontrada." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("hb_credit_accounts")
    .update({
      pin_hash: null,
      pin_updated_at: null,
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: now,
    })
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "COOPERADO_PIN_RESET",
    resource_type: "cooperado",
    resource_id: cooperadoId,
    metadata: { cooperadoId },
  });

  return { ok: true };
}

export async function requestCooperadoFinancialPinReset(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data: account } = await supabase
    .from("hb_credit_accounts")
    .select("id, cooperado_id, pin_hash, pin_locked_until")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (!account) {
    return { ok: false, error: "Conta HB Créditos não encontrada." };
  }

  const hasPin = Boolean(account.pin_hash);
  const locked =
    account.pin_locked_until && new Date(String(account.pin_locked_until)).getTime() > Date.now();
  if (!hasPin && !locked) {
    return { ok: false, error: "Cadastre um PIN ou aguarde — não há PIN ativo para resetar." };
  }

  const pending = await listPendingCooperadoPinResetRequests(supabase, digits);
  if (pending.some((r) => r.cooperadoId === cooperadoId)) {
    return { ok: false, error: "Já existe uma solicitação de reset pendente para sua conta." };
  }

  const { error } = await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "COOPERADO_PIN_RESET_REQUESTED",
    resource_type: "cooperado",
    resource_id: cooperadoId,
    metadata: { cooperadoId },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listPendingCooperadoPinResetRequests(
  supabase: SupabaseClient,
  cnpj: string
): Promise<ContaCoopCooperadoPinResetRequest[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_audit_log")
    .select("id, resource_id, action, created_at, metadata")
    .eq("cooperative_cnpj", digits)
    .in("action", ["COOPERADO_PIN_RESET_REQUESTED", "COOPERADO_PIN_RESET"])
    .order("created_at", { ascending: false })
    .limit(500);

  const latest = new Map<
    string,
    { request?: { id: string; createdAt: string }; resetAt?: string }
  >();

  for (const row of data ?? []) {
    const cid = String(row.resource_id ?? "");
    if (!cid) continue;
    const cur = latest.get(cid) ?? {};
    const action = String(row.action);
    const createdAt = String(row.created_at);
    if (action === "COOPERADO_PIN_RESET" && !cur.resetAt) {
      cur.resetAt = createdAt;
    }
    if (action === "COOPERADO_PIN_RESET_REQUESTED" && !cur.request) {
      cur.request = { id: String(row.id), createdAt };
    }
    latest.set(cid, cur);
  }

  const pending: ContaCoopCooperadoPinResetRequest[] = [];
  for (const [cooperadoId, state] of latest) {
    if (!state.request) continue;
    if (state.resetAt && new Date(state.request.createdAt) <= new Date(state.resetAt)) continue;
    pending.push({
      id: state.request.id,
      cooperadoId,
      createdAt: state.request.createdAt,
    });
  }

  pending.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return pending;
}

export async function hasPendingCooperadoPinResetRequest(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<boolean> {
  const pending = await listPendingCooperadoPinResetRequests(supabase, cnpj);
  return pending.some((r) => r.cooperadoId === cooperadoId);
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

export async function requestPartnerFinancialPinReset(
  supabase: SupabaseClient,
  partnerId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("id, name, cooperative_cnpj, pin_hash, pin_locked_until")
    .eq("id", partnerId)
    .maybeSingle();

  if (!partner) return { ok: false, error: "Mercado não encontrado." };

  const digits = String(partner.cooperative_cnpj);
  const pending = await listPendingPartnerPinResetRequests(supabase, digits);
  if (pending.some((r) => r.partnerId === partnerId)) {
    return { ok: false, error: "Já existe uma solicitação de reset pendente para este mercado." };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("hb_credit_audit_log")
    .insert({
      cooperative_cnpj: digits,
      actor: actorUserId,
      action: "PARTNER_PIN_RESET_REQUESTED",
      resource_type: "partner",
      resource_id: partnerId,
      metadata: { nomeMercado: String(partner.name ?? "") },
    })
    .select("id, created_at")
    .single();

  if (error) return { ok: false, error: error.message };
  void inserted;
  void now;
  return { ok: true };
}

export async function listPendingPartnerPinResetRequests(
  supabase: SupabaseClient,
  cnpj: string
): Promise<ContaCoopPinResetRequest[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_audit_log")
    .select("id, resource_id, action, created_at, metadata")
    .eq("cooperative_cnpj", digits)
    .in("action", ["PARTNER_PIN_RESET_REQUESTED", "PARTNER_PIN_RESET"])
    .order("created_at", { ascending: false })
    .limit(500);

  const latest = new Map<
    string,
    { request?: { id: string; createdAt: string; nome?: string }; resetAt?: string }
  >();

  for (const row of data ?? []) {
    const partnerId = String(row.resource_id ?? "");
    if (!partnerId) continue;
    const cur = latest.get(partnerId) ?? {};
    const action = String(row.action);
    const createdAt = String(row.created_at);
    if (action === "PARTNER_PIN_RESET" && !cur.resetAt) {
      cur.resetAt = createdAt;
    }
    if (action === "PARTNER_PIN_RESET_REQUESTED" && !cur.request) {
      const meta = row.metadata as Record<string, unknown> | null;
      cur.request = {
        id: String(row.id),
        createdAt,
        nome: meta?.nomeMercado ? String(meta.nomeMercado) : undefined,
      };
    }
    latest.set(partnerId, cur);
  }

  const pending: ContaCoopPinResetRequest[] = [];
  for (const [partnerId, state] of latest) {
    if (!state.request) continue;
    if (state.resetAt && new Date(state.request.createdAt) <= new Date(state.resetAt)) continue;
    pending.push({
      id: state.request.id,
      partnerId,
      partnerNome: state.request.nome,
      createdAt: state.request.createdAt,
    });
  }

  pending.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return pending;
}

export async function hasPendingPartnerPinResetRequest(
  supabase: SupabaseClient,
  cnpj: string,
  partnerId: string
): Promise<boolean> {
  const pending = await listPendingPartnerPinResetRequests(supabase, cnpj);
  return pending.some((r) => r.partnerId === partnerId);
}

export async function resetPartnerFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  partnerId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("id, name")
    .eq("id", partnerId)
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  if (!partner) return { ok: false, error: "Mercado não encontrado." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("hb_credit_partners")
    .update({
      pin_hash: null,
      pin_updated_at: null,
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: now,
    })
    .eq("id", partnerId)
    .eq("cooperative_cnpj", digits);

  if (error) return { ok: false, error: error.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "PARTNER_PIN_RESET",
    resource_type: "partner",
    resource_id: partnerId,
    metadata: { nomeMercado: String(partner.name ?? "") },
  });

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
    idempotencyKey?: string;
    /** Evita SELECT extra quando o parceiro já foi validado na API. */
    parceiroNome?: string;
  }
): Promise<ContaCoopIntent> {
  const digits = normalizeCnpj(input.cooperativaCnpj);
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  let parceiroNome = input.parceiroNome?.trim() || "";

  if (!parceiroNome) {
    const { data: parceiro } = await supabase
      .from("hb_credit_partners")
      .select("*")
      .eq("id", input.parceiroId)
      .maybeSingle();

    if (!parceiro || parceiro.status !== "ACTIVE") {
      throw new Error("Mercado não autorizado a criar cobranças.");
    }
    parceiroNome = String(parceiro.name);
  }

  const mapRow = (row: Record<string, unknown>): ContaCoopIntent => ({
    id: String(row.id),
    cooperativaCnpj: String(row.cooperative_cnpj),
    parceiroId: input.parceiroId,
    parceiroNome,
    amountCents: Number(row.amount_cents),
    descricao: row.description ? String(row.description) : undefined,
    status: intentStatusFromDb(String(row.status)),
    nonce: String(row.nonce),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  });

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("hb_credit_payment_intents")
      .select("*")
      .eq("cooperative_cnpj", digits)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      if (String(existing.partner_id) !== input.parceiroId) {
        throw new Error("Chave de idempotência já usada por outro mercado.");
      }
      if (Number(existing.amount_cents) !== input.amountCents) {
        throw new Error("Chave de idempotência já usada com outro valor.");
      }
      if (!["PENDING", "CREATED"].includes(String(existing.status))) {
        throw new Error("Cobrança idempotente já utilizada ou encerrada.");
      }
      return mapRow(existing as Record<string, unknown>);
    }
  }

  const id = genId("intent");
  const nonce = secureNonce();
  const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MINUTES * 60_000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("hb_credit_payment_intents")
    .insert({
      id,
      cooperative_cnpj: digits,
      partner_id: input.parceiroId,
      amount_cents: input.amountCents,
      description: input.descricao?.trim() || null,
      status: "PENDING",
      nonce,
      expires_at: expiresAt,
      idempotency_key: idempotencyKey,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    if (idempotencyKey && /23505|duplicate/i.test(error.message)) {
      const { data: raced } = await supabase
        .from("hb_credit_payment_intents")
        .select("*")
        .eq("cooperative_cnpj", digits)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) return mapRow(raced as Record<string, unknown>);
    }
    throw new Error(error.message);
  }

  return mapRow(data as Record<string, unknown>);
}

/** Reserva cobrança ao cooperado que vai pagar (evita dois cooperados pagarem o mesmo QR). */
async function reservePaymentIntentForCooperado(
  supabase: SupabaseClient,
  intentId: string,
  cooperadoId: string,
  cooperativeCnpj: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const { data: intent } = await supabase
    .from("hb_credit_payment_intents")
    .select("cooperado_id, status, cooperative_cnpj")
    .eq("id", intentId)
    .maybeSingle();

  if (!intent) return { ok: false, error: "Cobrança não encontrada." };
  if (String(intent.cooperative_cnpj) !== digits) return { ok: false, error: "Cooperativa inválida." };
  if (!["PENDING", "CREATED"].includes(String(intent.status))) {
    return { ok: false, error: "Cobrança já utilizada." };
  }

  const bound = intent.cooperado_id ? String(intent.cooperado_id) : "";
  if (bound && bound !== cooperadoId) {
    return { ok: false, error: "Esta cobrança já foi vinculada a outro cooperado." };
  }
  if (bound === cooperadoId) return { ok: true };

  const now = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("hb_credit_payment_intents")
    .update({ cooperado_id: cooperadoId, updated_at: now })
    .eq("id", intentId)
    .eq("cooperative_cnpj", digits)
    .in("status", ["PENDING", "CREATED"])
    .is("cooperado_id", null)
    .select("id")
    .maybeSingle();

  if (claimed) return { ok: true };

  const { data: again } = await supabase
    .from("hb_credit_payment_intents")
    .select("cooperado_id, status")
    .eq("id", intentId)
    .maybeSingle();
  if (!again) return { ok: false, error: "Cobrança não encontrada." };
  if (!["PENDING", "CREATED"].includes(String(again.status))) {
    return { ok: false, error: "Cobrança já utilizada." };
  }
  const rebound = again.cooperado_id ? String(again.cooperado_id) : "";
  if (rebound === cooperadoId) return { ok: true };
  if (rebound) return { ok: false, error: "Esta cobrança já foi vinculada a outro cooperado." };
  return { ok: false, error: "Não foi possível reservar esta cobrança. Tente novamente." };
}

export async function validateIntentForCooperado(
  supabase: SupabaseClient,
  intentId: string,
  nonce: string,
  cooperadoId: string,
  cooperativaCnpj: string,
  opts?: { useCashback?: boolean; forAuthorize?: boolean; fast?: boolean }
): Promise<
  | { ok: true; intent: ContaCoopIntent; limite: ContaCoopLimiteCooperado; parceiroNome: string }
  | { ok: false; error: string; code?: string }
> {
  const digits = normalizeCnpj(cooperativaCnpj);
  const { data: intent } = await supabase.from("hb_credit_payment_intents").select("*").eq("id", intentId).maybeSingle();
  if (!intent) return { ok: false, error: "Cobrança não encontrada." };
  if (intent.cooperative_cnpj !== digits) return { ok: false, error: "Cooperativa inválida." };
  if (intent.nonce !== nonce) return { ok: false, error: "QR inválido." };
  const intentCooperadoId = intent.cooperado_id ? String(intent.cooperado_id) : "";
  if (intentCooperadoId && intentCooperadoId !== cooperadoId) {
    return { ok: false, error: "Esta cobrança já foi vinculada a outro cooperado." };
  }
  if (!["PENDING", "CREATED"].includes(intent.status)) return { ok: false, error: "Cobrança já utilizada." };
  if (new Date(intent.expires_at).getTime() < Date.now()) return { ok: false, error: "Cobrança expirada." };

  if (opts?.fast === true) {
    const reserve = await reservePaymentIntentForCooperado(
      supabase,
      intentId,
      cooperadoId,
      digits
    );
    if (!reserve.ok) return { ok: false, error: reserve.error };
  }

  const parceiroQuery = supabase
    .from("hb_credit_partners")
    .select("name, status")
    .eq("id", intent.partner_id)
    .maybeSingle();
  const limiteQuery = getLimiteCooperado(supabase, digits, cooperadoId, {
    skipAmountUsedReconcile: opts?.fast === true,
    fastPreview: opts?.fast === true,
  });

  const [{ data: parceiro }, limite] = await Promise.all([parceiroQuery, limiteQuery]);
  if (!parceiro || parceiro.status !== "ACTIVE") return { ok: false, error: "Mercado bloqueado ou inativo." };
  if (!limite) return { ok: false, error: "Sem limite HB Créditos." };
  if (limite.bloqueado) return { ok: false, error: "Cooperado bloqueado." };
  const gross = Number(intent.amount_cents);
  const affordOk = opts?.forAuthorize
    ? canAffordHbPaymentWithLimite(limite, gross, Boolean(opts.useCashback))
    : canAffordHbPaymentScanPreview(limite, gross);
  if (!affordOk) {
    return {
      ok: false,
      error: HB_CREDIT_SALDO_INSUFICIENTE_MSG,
      code: HB_CREDIT_INSUFFICIENT_CODE,
    };
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

/** Reconcile + sync-limite se STALE/inflado — pagamento não trava na fila operacional. */
export async function prepareHbCreditPaymentAuthorize(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<HbCreditPrepareAuthorizeResult> {
  return ensureHbCreditLimiteAutoritativoPersistido(supabase, cnpj, cooperadoId, actorUserId);
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
  | { ok: false; error: string; code?: string }
> {
  const [pinCheck, intentCheck, accountFound] = await Promise.all([
    verifyFinancialPin(
      supabase,
      input.cooperativaCnpj,
      input.cooperadoId,
      input.pin,
      input.actorUserId
    ),
    validateIntentForCooperado(
      supabase,
      input.intentId,
      input.nonce,
      input.cooperadoId,
      input.cooperativaCnpj,
      { useCashback: Boolean(input.useCashback), forAuthorize: true, fast: true }
    ),
    fetchHbCreditAccountRowForCooperado(supabase, input.cooperativaCnpj, input.cooperadoId),
  ]);

  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };
  if (!intentCheck.ok) return { ok: false, error: intentCheck.error };
  if (!accountFound) {
    return { ok: false, error: "Cooperado sem limite Conta Coop." };
  }
  const accountCooperadoId = accountFound.accountCooperadoId;

  let cashbackAppliedCents = 0;
  if (input.useCashback) {
    cashbackAppliedCents = intentCheck.limite.cashbackDisponivelCents ?? 0;
  }

  const transacaoId = genId("tx");
  const recebivelId = genId("recv");
  const receiptCode = genId("receipt").slice(-8).toUpperCase();

  const { data, error } = await supabase.rpc("hb_credit_authorize_payment", {
    p_intent_id: input.intentId,
    p_nonce: input.nonce,
    p_cooperado_id: accountCooperadoId,
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
    if (/financial_limit_sync_state/i.test(error.message ?? "")) {
      return {
        ok: false,
        error:
          "Pagamento temporariamente indisponível (atualização do servidor). Peça ao responsável HB para aplicar a migration de pagamento ou tente em alguns minutos.",
      };
    }
    return { ok: false, error: error.message };
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    error_code?: string;
    duplicate?: boolean;
    transacao_id?: string;
    disponivel_apos_centavos?: number;
  };
  if (!result?.ok) {
    const mapped = mapAuthorizeRpcError(result);
    return { ok: false, error: mapped.error, code: mapped.code };
  }

  const txId = result.transacao_id ?? transacaoId;
  let finalReceiptCode = receiptCode;
  let disponivelAposCents = Number(result.disponivel_apos_centavos ?? 0);
  if (result.duplicate) {
    const { data: existingTx } = await supabase
      .from("hb_credit_transactions")
      .select("receipt_code")
      .eq("id", txId)
      .maybeSingle();
    if (existingTx?.receipt_code) {
      finalReceiptCode = String(existingTx.receipt_code);
    }
    if (!Number.isFinite(disponivelAposCents) || disponivelAposCents <= 0) {
      const limiteDup = await getLimiteCooperadoAlinhadoAEntregas(
        supabase,
        input.cooperativaCnpj,
        input.cooperadoId
      );
      disponivelAposCents = limiteDup?.valorDisponivelCents ?? 0;
    }
  } else {
    void import("@/lib/supabase/hbCreditFiscalNotesStorage")
      .then(({ ensureFiscalNoteForTransaction }) =>
        ensureFiscalNoteForTransaction(supabase, txId, input.cooperadoNome)
      )
      .catch(() => {});
  }

  return {
    ok: true,
    transacaoId: txId,
    receiptCode: finalReceiptCode,
    disponivelAposCents,
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
  const found = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  if (!found) return [];
  const accountId = String(found.row.id);

  const { data } = await supabase
    .from("hb_credit_ledger_entries")
    .select("*")
    .eq("cooperative_cnpj", normalizeCnpj(cnpj))
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = data ?? [];
  const txIds = [...new Set(rows.map((r) => String(r.transaction_id)).filter(Boolean))];
  const partnerNameByTx = new Map<string, string>();

  if (txIds.length) {
    const { data: txs } = await supabase
      .from("hb_credit_transactions")
      .select("id, partner_id")
      .eq("cooperative_cnpj", normalizeCnpj(cnpj))
      .in("id", txIds);

    const partnerIds = [...new Set((txs ?? []).map((t) => String(t.partner_id)).filter(Boolean))];
    const partnerNameById = new Map<string, string>();

    if (partnerIds.length) {
      const { data: partners } = await supabase
        .from("hb_credit_partners")
        .select("id, name")
        .eq("cooperative_cnpj", normalizeCnpj(cnpj))
        .in("id", partnerIds);
      for (const p of partners ?? []) {
        partnerNameById.set(String(p.id), String(p.name));
      }
    }

    for (const tx of txs ?? []) {
      const nome = partnerNameById.get(String(tx.partner_id));
      if (nome) partnerNameByTx.set(String(tx.id), nome);
    }
  }

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const entryType = String(r.entry_type);
    const signed = signedLedgerAmountCentsForExtrato(entryType, String(r.direction), Number(r.amount_cents));
    const txId = String(r.transaction_id);
    return {
      id: String(r.id),
      tipo: entryType,
      amountCents: signed,
      saldoDisponivelAposCents:
        r.balance_reference_cents != null ? Number(r.balance_reference_cents) : null,
      memo: meta.memo ? String(meta.memo) : null,
      parceiroNome: partnerNameByTx.get(txId) ?? null,
      referenceType: "transaction",
      referenceId: txId,
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
  const map = await readLimitesAtuaisCooperadosMap(supabase, cnpj, [cooperadoId]);
  return map.get(cooperadoId) ?? { limiteAtualCents: 0, valorUsadoCents: 0 };
}

async function readLimitesAtuaisCooperadosMap(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[]
): Promise<Map<string, { limiteAtualCents: number; valorUsadoCents: number }>> {
  const digits = normalizeCnpj(cnpj);
  const map = new Map<string, { limiteAtualCents: number; valorUsadoCents: number }>();
  if (!cooperadoIds.length) return map;

  const uniqueIds = [...new Set(cooperadoIds.filter(Boolean))];
  const { data, error } = await supabase
    .from("hb_credit_accounts")
    .select("cooperado_id, limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits)
    .in("cooperado_id", uniqueIds);

  if (error) throw error;

  for (const row of data ?? []) {
    const id = String(row.cooperado_id);
    map.set(id, {
      limiteAtualCents: Number(row.limit_released_cents),
      valorUsadoCents: Number(row.amount_used_cents),
    });
  }
  for (const id of uniqueIds) {
    if (!map.has(id)) map.set(id, { limiteAtualCents: 0, valorUsadoCents: 0 });
  }
  return map;
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
  const basesEfetivas = await resolveCreditosBaseForLiberacaoColetiva(
    supabase,
    cnpj,
    cooperadoIds,
    creditosBaseCents
  );
  const tetoReq = await requireConfiguredTeto(supabase, digits, basesEfetivas);
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

  const limitesAtuais = await readLimitesAtuaisCooperadosMap(supabase, digits, cooperadoIds);

  for (const cooperadoId of cooperadoIds) {
    const creditoBaseCents = Math.max(0, Math.round(Number(basesEfetivas[cooperadoId] ?? 0)));
    const { limiteAtualCents, valorUsadoCents } =
      limitesAtuais.get(cooperadoId) ?? { limiteAtualCents: 0, valorUsadoCents: 0 };

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
    const result = await writeLimiteCooperadoCents(
      supabase,
      cnpj,
      item.cooperadoId,
      item.novoLimiteCents,
      actorUserId,
      {
        anterior: {
          limiteLiberadoCents: item.limiteAtualCents,
          valorUsadoCents: item.valorUsadoCents,
          valorDisponivelCents: computeDisponivel(item.limiteAtualCents, item.valorUsadoCents),
        },
        novo: { limiteLiberadoCents: item.novoLimiteCents },
      },
      "LIMIT_COLLECTIVE"
    );
    if (!result.ok) return result;
    updated++;
  }
  const persisted = await persistCooperativaLiberacaoPercent(supabase, cnpj, percentual, actorUserId);
  if (!persisted.ok) return persisted;
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
    pin?: string;
    requestedByUserId: string;
  }
): Promise<{ ok: true; solicitacao: ContaCoopSolicitacaoEstorno } | { ok: false; error: string }> {
  const motivo = params.motivo.trim();
  if (motivo.length < 5) {
    return { ok: false, error: "Descreva o motivo do estorno (mínimo 5 caracteres)." };
  }

  const pin = String(params.pin ?? "").trim();
  if (pin.length > 0) {
    const pinCheck = await verifyPartnerFinancialPin(
      supabase,
      params.partnerId,
      pin,
      params.requestedByUserId
    );
    if (!pinCheck.ok) return pinCheck;
  }

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
): Promise<
  { ok: true; disponivelAposCents: number; cooperadoId?: string } | { ok: false; error: string }
> {
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

  if (reqRow?.transaction_id) {
    const { data: txRow } = await supabase
      .from("hb_credit_transactions")
      .select("cooperado_id")
      .eq("id", String(reqRow.transaction_id))
      .maybeSingle();
    if (txRow?.cooperado_id) {
      await reconcileCooperadoAmountUsedCents(supabase, digits, String(txRow.cooperado_id), reviewerUserId);
    }
  }

  const transacaoId = reqRow?.transaction_id ? String(reqRow.transaction_id) : null;
  let cooperadoId: string | undefined;
  if (transacaoId) {
    const { data: txRow } = await supabase
      .from("hb_credit_transactions")
      .select("cooperado_id")
      .eq("id", transacaoId)
      .maybeSingle();
    if (txRow?.cooperado_id) cooperadoId = String(txRow.cooperado_id);
    try {
      const { cancelFiscalNoteForTransaction } = await import("@/lib/supabase/hbCreditFiscalNotesStorage");
      await cancelFiscalNoteForTransaction(supabase, transacaoId, reviewerUserId);
    } catch {
      /* tabela fiscal opcional até migration aplicada */
    }
  }

  return {
    ok: true,
    disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0),
    cooperadoId,
  };
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

  const { data: txRow } = await supabase
    .from("hb_credit_transactions")
    .select("cooperado_id")
    .eq("id", transacaoId)
    .maybeSingle();
  if (txRow?.cooperado_id) {
    await reconcileCooperadoAmountUsedCents(
      supabase,
      cooperativaCnpj,
      String(txRow.cooperado_id),
      actorUserId
    );
  }

  try {
    const { cancelFiscalNoteForTransaction } = await import("@/lib/supabase/hbCreditFiscalNotesStorage");
    await cancelFiscalNoteForTransaction(supabase, transacaoId, actorUserId);
  } catch {
    /* tabela fiscal opcional até migration aplicada */
  }

  const refreshed =
    txRow?.cooperado_id != null
      ? await getLimiteCooperado(supabase, cooperativaCnpj, String(txRow.cooperado_id))
      : null;
  return {
    ok: true,
    disponivelAposCents: refreshed?.valorDisponivelCents ?? Number(result.disponivel_apos_centavos ?? 0),
  };
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

async function resolvePartnerPaymentCooperadoDisplay(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  cooperadoId: string,
  txId: string | undefined,
  opts?: { includeCpf?: boolean }
): Promise<{ cooperadoNome: string; cooperadoCpf: string }> {
  let cooperadoNome = "Cooperado";
  let cooperadoCpf = "";
  const id = cooperadoId.trim();
  if (!id) return { cooperadoNome, cooperadoCpf };

  const { fetchCooperadoFromStorage } = await import("@/lib/supabase/cooperadosStorage");
  const cooperado = await fetchCooperadoFromStorage(supabase, String(cooperativeCnpj), id);
  if (cooperado) {
    const nome = cooperado.nomeCompleto?.trim();
    if (nome) cooperadoNome = nome;
    if (opts?.includeCpf !== false) {
      cooperadoCpf = cooperado.cpfCnpj ?? "";
    }
    return { cooperadoNome, cooperadoCpf };
  }

  if (txId) {
    const { data: fiscal } = await supabase
      .from("hb_credit_fiscal_notes")
      .select("cooperado_nome_snapshot")
      .eq("transaction_id", txId)
      .maybeSingle();
    const snap = fiscal?.cooperado_nome_snapshot ? String(fiscal.cooperado_nome_snapshot).trim() : "";
    if (snap) cooperadoNome = snap;
  }

  return { cooperadoNome, cooperadoCpf };
}

export async function getPartnerPaymentIntentStatus(
  supabase: SupabaseClient,
  parceiroId: string,
  intentId: string,
  opts?: { lite?: boolean }
): Promise<{ ok: true; data: PartnerIntentPaymentStatus } | { ok: false; error: string }> {
  const { data: intent, error } = await supabase
    .from("hb_credit_payment_intents")
    .select(
      "id, status, amount_cents, description, expires_at, cooperative_cnpj, cooperado_id, confirmed_at"
    )
    .eq("id", intentId)
    .eq("partner_id", parceiroId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!intent) return { ok: false, error: "Cobrança não encontrada." };

  const rawStatus = String(intent.status ?? "");
  const status = intentStatusFromDb(rawStatus);
  const paid = status === "confirmada" || rawStatus.toUpperCase() === "CONFIRMED";
  const base: PartnerIntentPaymentStatus = {
    status: paid ? "confirmada" : status,
    intentId: String(intent.id),
    amountCents: Number(intent.amount_cents),
    descricao: intent.description ? String(intent.description) : undefined,
    expiresAt: String(intent.expires_at),
  };

  if (!paid) {
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
  const txId = tx?.id ? String(tx.id) : undefined;
  const cooperativeCnpj = String(intent.cooperative_cnpj);

  const { cooperadoNome, cooperadoCpf } = await resolvePartnerPaymentCooperadoDisplay(
    supabase,
    cooperativeCnpj,
    cooperadoId,
    txId,
    { includeCpf: !opts?.lite }
  );

  return {
    ok: true,
    data: {
      ...base,
      payment: {
        transacaoId: txId ?? "",
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
  const found = await fetchHbCreditAccountRowForCooperado(supabase, cnpj, cooperadoId);
  if (!found) return false;
  return Boolean(found.row.pin_hash);
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
    comprovanteStoragePath: row.comprovante_storage_path ? String(row.comprovante_storage_path) : null,
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
  const { start, end } = mesReferenciaUtcRange(mesReferencia);

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

const SETTLEMENT_RECEIVABLE_CLOSED = new Set(["PROCESSING", "SETTLED"]);

/** Promove recebíveis com NF aprovada e desbloqueia PROCESSING órfão antes da liquidação. */
async function repairReceivablesForPartnerSettlement(
  supabase: SupabaseClient,
  cnpj: string,
  partnerId: string,
  paymentTxIds: string[]
): Promise<void> {
  if (!paymentTxIds.length) return;
  const digits = normalizeCnpj(cnpj);
  const now = new Date().toISOString();

  const { data: notes } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("transaction_id, status")
    .eq("cooperative_cnpj", digits)
    .in("transaction_id", paymentTxIds)
    .neq("status", "CANCELLED");

  const nfApproved = new Set<string>();
  for (const row of notes ?? []) {
    if (String(row.status) === "APPROVED") nfApproved.add(String(row.transaction_id));
  }
  if (!nfApproved.size) return;

  const { ensurePartnerReceivableForTransaction } = await import(
    "@/lib/supabase/hbCreditReceivableStorage"
  );
  for (const txId of nfApproved) {
    await ensurePartnerReceivableForTransaction(supabase, txId, { promoteEligible: true });
  }

  const { data: processingRows } = await supabase
    .from("hb_credit_receivables")
    .select("id, transaction_id, settlement_id")
    .eq("cooperative_cnpj", digits)
    .eq("partner_id", partnerId)
    .in("transaction_id", paymentTxIds)
    .eq("status", "PROCESSING");

  for (const row of processingRows ?? []) {
    const txId = String(row.transaction_id);
    if (!nfApproved.has(txId)) continue;

    const settlementId = row.settlement_id ? String(row.settlement_id) : "";
    if (!settlementId) {
      await supabase
        .from("hb_credit_receivables")
        .update({ status: "ELIGIBLE", settlement_id: null, updated_at: now })
        .eq("id", String(row.id));
      continue;
    }

    const { data: settlement } = await supabase
      .from("hb_credit_settlements")
      .select("status")
      .eq("id", settlementId)
      .maybeSingle();
    const st = settlement ? String(settlement.status) : "";
    if (!settlement || st === "CANCELLED") {
      await supabase
        .from("hb_credit_receivables")
        .update({ status: "ELIGIBLE", settlement_id: null, updated_at: now })
        .eq("id", String(row.id));
    }
  }
}

/** NF conferida mas recebível ainda OPEN — libera para liquidação (repara dados antigos). */
async function resolveLiquidatableSettlementPayments(
  supabase: SupabaseClient,
  cnpj: string,
  transacoes: SettlementTxRow[]
): Promise<SettlementTxRow[]> {
  const digits = normalizeCnpj(cnpj);
  const payments = transacoes.filter((tx) => tx.tipo === "PAYMENT");
  const txIds = payments.map((tx) => tx.id);
  if (!txIds.length) return [];

  const { data: notes } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("transaction_id, status")
    .eq("cooperative_cnpj", digits)
    .in("transaction_id", txIds)
    .neq("status", "CANCELLED");

  const nfApproved = new Set<string>();
  for (const row of notes ?? []) {
    if (String(row.status) === "APPROVED") nfApproved.add(String(row.transaction_id));
  }

  const now = new Date().toISOString();
  const liquidatable: SettlementTxRow[] = [];

  for (const tx of payments) {
    const st = tx.recebivelStatus ?? "";
    if (SETTLEMENT_RECEIVABLE_CLOSED.has(st)) continue;

    if (st === "ELIGIBLE") {
      liquidatable.push(tx);
      continue;
    }

    if (nfApproved.has(tx.id) && (st === "OPEN" || st === "BLOCKED_FOR_REVIEW" || !st)) {
      const { ensurePartnerReceivableForTransaction } = await import(
        "@/lib/supabase/hbCreditReceivableStorage"
      );
      const recebivel = await ensurePartnerReceivableForTransaction(supabase, tx.id, {
        promoteEligible: true,
      });
      if (recebivel?.status === "ELIGIBLE") {
        liquidatable.push({
          ...tx,
          recebivelId: recebivel.id,
          recebivelStatus: "ELIGIBLE",
        });
      }
    }
  }

  return liquidatable;
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
  const mesNorm = normalizeMesReferencia(mesReferencia);
  const { data: partnerRow } = await supabase
    .from("hb_credit_partners")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("id", partnerId)
    .maybeSingle();
  if (!partnerRow) return null;

  let { data: pendingSettlement } = await supabase
    .from("hb_credit_settlements")
    .select("id, total_cents, transacoes_count, comprovante_storage_path")
    .eq("cooperative_cnpj", digits)
    .eq("partner_id", partnerId)
    .eq("mes_referencia", mesNorm)
    .eq("status", "AWAITING_PARTNER")
    .maybeSingle();

  if (pendingSettlement?.comprovante_storage_path) {
    const repaired = await finalizePartnerSettlementPayment(
      supabase,
      String(pendingSettlement.id),
      partnerId,
      "system:settlement_comprovante"
    );
    if (repaired.ok) pendingSettlement = null;
  }

  const transacoes = await listSettlementTransactions(supabase, digits, partnerId, mesNorm);
  const cooperados = buildCooperadoLiquidacao(transacoes);
  const paymentTxIds = transacoes.filter((tx) => tx.tipo === "PAYMENT").map((tx) => tx.id);

  await repairReceivablesForPartnerSettlement(supabase, digits, partnerId, paymentTxIds);

  const eligibleRecebiveis = await resolveLiquidatableSettlementPayments(supabase, digits, transacoes);
  const totalCents = eligibleRecebiveis.reduce((sum, tx) => sum + tx.amountCents, 0);

  let fiscalResumo;
  let pagamentoAprovado = false;
  let bloqueioPagamento: string | null = null;
  try {
    const { summarizeFiscalNotesForSettlement, evaluatePartnerFiscalSettlementGate } = await import(
      "@/lib/supabase/hbCreditFiscalNotesStorage"
    );
    fiscalResumo = await summarizeFiscalNotesForSettlement(
      supabase,
      digits,
      partnerId,
      mesNorm,
      paymentTxIds
    );
    const gate = evaluatePartnerFiscalSettlementGate(fiscalResumo);
    pagamentoAprovado = gate.ready && totalCents > 0;
    bloqueioPagamento =
      gate.message ??
      (gate.ready && totalCents <= 0
        ? paymentTxIds.length > 0
          ? "Há vendas no mês com NF conferida, mas o recebível ainda não liberou — toque em Atualizar resumo."
          : "Nenhuma venda HB Créditos neste mês para este mercado."
        : null);
  } catch {
    bloqueioPagamento = "Módulo fiscal indisponível — aplique a migration de NFs HB Créditos.";
  }

  let totalExibirCents = totalCents;
  let transacoesExibir = eligibleRecebiveis.length;

  if (pendingSettlement) {
    pagamentoAprovado = false;
    totalExibirCents = Number(pendingSettlement.total_cents);
    transacoesExibir = Number(pendingSettlement.transacoes_count);
    bloqueioPagamento =
      "Comprovante enviado, mas a liquidação ainda não foi finalizada — toque em Atualizar resumo.";
  }

  if (!pendingSettlement && totalCents <= 0 && paymentTxIds.length > 0 && !bloqueioPagamento) {
    const allSettled = transacoes
      .filter((tx) => tx.tipo === "PAYMENT")
      .every((tx) => tx.recebivelStatus === "SETTLED");
    bloqueioPagamento = allSettled
      ? "Este mês já foi liquidado para o mercado."
      : "Não há recebíveis elegíveis neste mês — confira NFs conferidas e atualize o resumo.";
  }

  return {
    partnerId,
    partnerNome: String(partnerRow.name),
    mesReferencia: mesNorm,
    pixKey: readStoredField(partnerRow.pix_key as string | undefined),
    pixHolderName: readStoredField(partnerRow.pix_holder_name as string | undefined),
    totalCents: totalExibirCents,
    transacoesCount: transacoesExibir,
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
    comprovanteBuffer?: Buffer;
    relatorioHtml: string;
  }
): Promise<{ ok: boolean; error?: string; settlement?: ContaCoopSettlement }> {
  const mesNorm = normalizeMesReferencia(params.mesReferencia);
  const preview = await previewPartnerSettlement(supabase, params.cnpj, params.partnerId, mesNorm);
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
  if (!params.comprovanteBuffer?.length) {
    return { ok: false, error: "Anexe o comprovante PIX para concluir a liquidação." };
  }

  const { data: existing } = await supabase
    .from("hb_credit_settlements")
    .select("id")
    .eq("cooperative_cnpj", normalizeCnpj(params.cnpj))
    .eq("partner_id", params.partnerId)
    .eq("mes_referencia", mesNorm)
    .eq("status", "AWAITING_PARTNER")
    .maybeSingle();
  if (existing) return { ok: false, error: "Já existe um pagamento aguardando confirmação do mercado neste mês." };

  const settlementId = genId("settle");
  const now = new Date().toISOString();
  const settlementTxs = await listSettlementTransactions(supabase, params.cnpj, params.partnerId, mesNorm);
  const liquidatableTxs = await resolveLiquidatableSettlementPayments(
    supabase,
    normalizeCnpj(params.cnpj),
    settlementTxs
  );
  const openRecebivelIds = liquidatableTxs.filter((tx) => tx.recebivelId).map((tx) => tx.recebivelId);

  const { error: insertError } = await supabase.from("hb_credit_settlements").insert({
    id: settlementId,
    cooperative_cnpj: normalizeCnpj(params.cnpj),
    partner_id: params.partnerId,
    mes_referencia: mesNorm,
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

  let comprovanteStoragePath: string | null = null;
  if (params.comprovanteBuffer) {
    const upload = await uploadSettlementComprovante(supabase, {
      cnpj: params.cnpj,
      settlementId,
      buffer: params.comprovanteBuffer,
    });
    if (!upload.ok) {
      if (openRecebivelIds.length) {
        await supabase
          .from("hb_credit_receivables")
          .update({ status: "ELIGIBLE", settlement_id: null, updated_at: now })
          .in("id", openRecebivelIds);
      }
      await supabase.from("hb_credit_settlements").delete().eq("id", settlementId);
      return { ok: false, error: upload.error ?? "Erro ao anexar comprovante." };
    }
    comprovanteStoragePath = upload.path;
  }

  const finalized = await finalizePartnerSettlementPayment(
    supabase,
    settlementId,
    params.partnerId,
    params.responsavelUserId
  );
  if (!finalized.ok) {
    return { ok: false, error: finalized.error ?? "Erro ao finalizar liquidação." };
  }

  const { data: confirmedRow } = await supabase
    .from("hb_credit_settlements")
    .select("*")
    .eq("id", settlementId)
    .maybeSingle();

  return {
    ok: true,
    settlement: mapSettlementRow(
      (confirmedRow ?? {
        id: settlementId,
        partner_id: params.partnerId,
        mes_referencia: mesNorm,
        total_cents: preview.totalCents,
        transacoes_count: preview.transacoesCount,
        status: "CONFIRMED",
        responsavel_nome: params.responsavelNome,
        pago_em: now,
        comprovante_memo: params.comprovanteMemo ?? null,
        comprovante_storage_path: comprovanteStoragePath,
        relatorio_html: protectStoredField(params.relatorioHtml),
        created_at: now,
        updated_at: now,
      }) as Record<string, unknown>,
      preview.partnerNome
    ),
  };
}

/** Comprovante anexado = liquidação concluída (recebíveis SETTLED, crédito cooperados zerado). */
async function finalizePartnerSettlementPayment(
  supabase: SupabaseClient,
  settlementId: string,
  partnerId: string,
  actorUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await supabase
    .from("hb_credit_settlements")
    .select("id, status, partner_id, cooperative_cnpj")
    .eq("id", settlementId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Liquidação não encontrada." };
  if (String(row.partner_id) !== partnerId) return { ok: false, error: "Liquidação não pertence a este mercado." };
  if (String(row.status) === "CONFIRMED") return { ok: true };
  if (String(row.status) !== "AWAITING_PARTNER") {
    return { ok: false, error: "Esta liquidação não pode ser finalizada." };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("hb_credit_settlements")
    .update({
      status: "CONFIRMED",
      partner_confirmado_em: now,
      updated_at: now,
    })
    .eq("id", settlementId);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase
    .from("hb_credit_receivables")
    .update({ status: "SETTLED", updated_at: now })
    .eq("settlement_id", settlementId);

  await resetContaCoopCooperadosFromSettlement(supabase, settlementId, actorUserId);

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: normalizeCnpj(String(row.cooperative_cnpj ?? "")),
    actor: actorUserId,
    action: "SETTLEMENT_CONFIRMED",
    resource_type: "settlement",
    resource_id: settlementId,
    metadata: { partnerId, via: "comprovante" },
  });

  return { ok: true };
}

export async function confirmPartnerSettlement(
  supabase: SupabaseClient,
  settlementId: string,
  parceiroId: string
): Promise<{ ok: boolean; error?: string; settlement?: ContaCoopSettlement }> {
  const { data: row } = await supabase
    .from("hb_credit_settlements")
    .select("*")
    .eq("id", settlementId)
    .eq("partner_id", parceiroId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Liquidação não encontrada." };
  if (String(row.status) === "CONFIRMED") {
    const { data: partnerRow } = await supabase
      .from("hb_credit_partners")
      .select("name")
      .eq("id", parceiroId)
      .maybeSingle();
    return {
      ok: true,
      settlement: mapSettlementRow(
        row as Record<string, unknown>,
        partnerRow?.name ? String(partnerRow.name) : undefined
      ),
    };
  }

  const finalized = await finalizePartnerSettlementPayment(
    supabase,
    settlementId,
    parceiroId,
    parceiroId
  );
  if (!finalized.ok) return { ok: false, error: finalized.error };

  const { data: updated } = await supabase
    .from("hb_credit_settlements")
    .select("*")
    .eq("id", settlementId)
    .maybeSingle();
  if (!updated) return { ok: false, error: "Liquidação não encontrada." };

  const { data: partnerRow } = await supabase
    .from("hb_credit_partners")
    .select("name")
    .eq("id", parceiroId)
    .maybeSingle();

  return {
    ok: true,
    settlement: mapSettlementRow(
      updated as Record<string, unknown>,
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
  hbTransactionId?: string;
};

const HB_TX_FICHA_SELECT =
  "id, payment_intent_id, cooperado_id, event_type, amount_cents, gross_amount_cents, discount_cents, partner_discount_percent, credit_debited_cents, net_receivable_cents, created_at, partner_id, receipt_code, status";

type HbTxFichaRow = {
  id: string;
  payment_intent_id?: string | null;
  cooperado_id: string;
  event_type: string;
  amount_cents: number;
  gross_amount_cents?: number | null;
  discount_cents?: number | null;
  partner_discount_percent?: number | null;
  credit_debited_cents?: number | null;
  net_receivable_cents?: number | null;
  created_at: string;
  partner_id: string;
  receipt_code?: string | null;
  status: string;
};

function mapHbTxToDescontoRow(t: HbTxFichaRow, partnerNames: Record<string, string>): CooperadoContaCoopDescontoRow {
  const partnerNome = partnerNames[String(t.partner_id)] ?? "Mercado parceiro";
  const isRefund = String(t.event_type) === "REFUND";
  const isReversedPayment = String(t.event_type) === "PAYMENT" && String(t.status) === "reversed";
  const receipt = t.receipt_code ? ` (${String(t.receipt_code)})` : "";
  const valorReais = valorReaisLinhaResumoCooperado(t);
  return {
    motivo: isRefund
      ? `Estorno HB Créditos — ${partnerNome}${receipt}`
      : `Compra HB Créditos — ${partnerNome}${receipt}${isReversedPayment ? " (estornada)" : ""}`,
    valorReais,
    tipo: "conta_coop" as const,
    createdAt: String(t.created_at),
    hbTransactionId: String(t.id),
  };
}

function mapHbTxToUtilizacaoLancamento(
  t: HbTxFichaRow,
  partnerNames: Record<string, string>
): HbUtilizacaoResumoLancamento {
  const grossCents = Number(t.gross_amount_cents ?? t.amount_cents);
  const discountCents = Number(t.discount_cents ?? 0);
  const netCents = Number(t.net_receivable_cents ?? t.amount_cents);
  const debitedCents = Number(t.credit_debited_cents ?? t.amount_cents);
  const partnerNome = partnerNames[String(t.partner_id)] ?? "Mercado parceiro";
  const pct =
    t.partner_discount_percent != null
      ? Number(t.partner_discount_percent)
      : grossCents > 0
        ? Math.round((discountCents / grossCents) * 10000) / 100
        : undefined;

  return {
    hbTransactionId: String(t.id),
    paymentIntentId: t.payment_intent_id ? String(t.payment_intent_id) : undefined,
    cooperadoId: String(t.cooperado_id),
    partnerId: String(t.partner_id),
    partnerNome,
    receiptCode: t.receipt_code ? String(t.receipt_code) : undefined,
    eventType: String(t.event_type) === "REFUND" ? "REFUND" : "PAYMENT",
    transactionStatus: String(t.status),
    statusResumo: statusResumoFromTx(String(t.event_type), String(t.status)),
    createdAt: String(t.created_at),
    valorCompraReais: grossCents / 100,
    descontoMercadoPercent: pct,
    valorDescontoReais: discountCents / 100,
    valorFinalCompraReais: netCents / 100,
    valorHbUtilizadoReais: debitedCents / 100,
    valorImpactoAReceberReais: impactoAReceberReais(t),
    observacao:
      String(t.event_type) === "PAYMENT" && String(t.status) === "reversed"
        ? "Compra estornada — par com crédito de estorno no resumo."
        : undefined,
  };
}

async function queryHbTransacoesFichaIntervalo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string | string[],
  startIso: string,
  endIso: string,
  opts?: { incluirPagamentosEstornados?: boolean }
): Promise<HbTxFichaRow[]> {
  const digits = normalizeCnpj(cnpj);
  const ids = [...new Set((Array.isArray(cooperadoIds) ? cooperadoIds : [cooperadoIds]).filter(Boolean))];
  if (!ids.length) return [];

  let query = supabase
    .from("hb_credit_transactions")
    .select(HB_TX_FICHA_SELECT)
    .eq("cooperative_cnpj", digits)
    .in("cooperado_id", ids)
    .in("event_type", ["PAYMENT", "REFUND"])
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: true });

  if (opts?.incluirPagamentosEstornados) {
    query = query.or("status.eq.posted,and(event_type.eq.PAYMENT,status.eq.reversed)");
  } else {
    query = query.eq("status", "posted");
  }

  const { data: txs, error } = await query;
  if (error) throw new Error(error.message);
  return (txs ?? []) as HbTxFichaRow[];
}

async function partnerNamesById(
  supabase: SupabaseClient,
  txs: HbTxFichaRow[]
): Promise<Record<string, string>> {
  const partnerIds = [...new Set(txs.map((t) => String(t.partner_id)).filter(Boolean))];
  const partnerNames: Record<string, string> = {};
  if (!partnerIds.length) return partnerNames;
  const { data: partners } = await supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds);
  for (const p of partners ?? []) partnerNames[String(p.id)] = String(p.name);
  return partnerNames;
}

async function listCooperadoContaCoopDescontosIntervalo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string | string[],
  startIso: string,
  endIso: string,
  opts?: { incluirPagamentosEstornados?: boolean }
): Promise<CooperadoContaCoopDescontoRow[]> {
  const txs = await queryHbTransacoesFichaIntervalo(supabase, cnpj, cooperadoIds, startIso, endIso, opts);
  if (!txs.length) return [];

  const partnerNames = await partnerNamesById(supabase, txs);

  return txs
    .filter((t) => {
      if (opts?.incluirPagamentosEstornados) return true;
      if (String(t.event_type) === "PAYMENT" && String(t.status) === "reversed") return false;
      return true;
    })
    .map((t) => mapHbTxToDescontoRow(t, partnerNames));
}

/** Histórico auditável HB → resumo cooperado (fonte: hb_credit_transactions). */
export async function listCooperadoHbUtilizacaoResumoAbateValorReceber(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string | string[],
  mesReferenciaFicha: string
): Promise<HbUtilizacaoResumoLancamento[]> {
  const { start } = mesReferenciaRange(mesReferenciaFicha);
  const txs = await queryHbTransacoesFichaIntervalo(
    supabase,
    cnpj,
    cooperadoIds,
    start,
    new Date().toISOString(),
    { incluirPagamentosEstornados: true }
  );
  if (!txs.length) return [];
  const partnerNames = await partnerNamesById(supabase, txs);
  return txs.map((t) => mapHbTxToUtilizacaoLancamento(t, partnerNames));
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
  cooperadoId: string | string[],
  mesReferenciaFicha: string
): Promise<CooperadoContaCoopDescontoRow[]> {
  const { start } = mesReferenciaRange(mesReferenciaFicha);
  const rows = await listCooperadoContaCoopDescontosIntervalo(
    supabase,
    cnpj,
    cooperadoId,
    start,
    new Date().toISOString(),
    { incluirPagamentosEstornados: true }
  );
  const remotos = rows.map((r) => ({
    motivo: r.motivo,
    valorReais: r.valorReais,
    tipo: "conta_coop" as const,
    createdAt: r.createdAt,
    hbTransactionId: r.hbTransactionId,
  }));
  const deduped = dedupeDescontosContaCoopRemotos(remotos);
  return deduped.map((d) => ({
    motivo: d.motivo,
    valorReais: d.valorReais,
    tipo: "conta_coop" as const,
    createdAt: d.createdAt,
    hbTransactionId: d.hbTransactionId,
  }));
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
  const allocCount = rows?.length ?? 0;

  if (amountCents <= 0) {
    return {
      mesReferencia,
      amountCents: 0,
      allocCount: 0,
      alreadyPaid: false,
      repasse: null,
    };
  }

  const { data: coopRow } = await supabase.from("cooperativas").select("id").eq("cnpj", digits).maybeSingle();
  const cooperativeId = coopRow?.id ? String(coopRow.id) : "";
  const operacional = cooperativeId ? await fetchOperacionalSync(supabase, digits) : null;
  const cooperadosRaw = cooperativeId ? await fetchCooperadosFromStorage(supabase, digits) : [];
  const { data: loginRows } = cooperativeId
    ? await supabase
        .from("app_users")
        .select("cooperado_id")
        .eq("cooperativa_cnpj", digits)
        .eq("active", true)
        .not("cooperado_id", "is", null)
    : { data: [] as { cooperado_id: string }[] };
  const loginCooperadoIds = new Set(
    (loginRows ?? []).map((r) => String(r.cooperado_id)).filter(Boolean)
  );
  const cooperadosAtivos = cooperadosUnicosParaCobranca(cooperadosRaw, loginCooperadoIds);

  const pagamentos = mesCicloEntregasPagamentosCompletos(
    operacional,
    cooperativeId,
    mesReferencia,
    cooperadosAtivos
  );

  if (!pagamentos.ok) {
    return {
      mesReferencia,
      amountCents: 0,
      allocCount,
      alreadyPaid: false,
      repasse: null,
      aguardandoPagamentosCooperados: true,
      cooperadosPendentes: pagamentos.pendentes.length,
      bloqueioMensagem: `Aguardando pagamento de ${pagamentos.pendentes.length} cooperado(s) no ciclo de entregas ${mesReferencia}.`,
    };
  }

  return {
    mesReferencia,
    amountCents,
    allocCount,
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

export async function convertCashbackToReceivable(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  mesReferencia: string,
  actorUserId: string,
  valorAvulsoId: string
): Promise<{ ok: boolean; error?: string; amountCents?: number; idempotent?: boolean }> {
  const { data, error } = await supabase.rpc("hb_credit_cashback_to_receivable", {
    p_cooperative_cnpj: normalizeCnpj(cnpj),
    p_cooperado_id: cooperadoId,
    p_mes_referencia: mesReferencia,
    p_actor_user_id: actorUserId,
    p_valor_avulso_id: valorAvulsoId,
  });
  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration cashback → a receber não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }
  const result = data as { ok?: boolean; error?: string; amount_cents?: number; idempotent?: boolean };
  if (!result?.ok) {
    const code = String(result?.error ?? "");
    if (code === "sem_cashback") return { ok: false, error: "Não há cashback disponível." };
    if (code === "conta_nao_encontrada") return { ok: false, error: "Conta HB não encontrada." };
    return { ok: false, error: code || "Não foi possível converter cashback." };
  }
  return {
    ok: true,
    amountCents: Number(result.amount_cents ?? 0),
    idempotent: Boolean(result.idempotent),
  };
}
