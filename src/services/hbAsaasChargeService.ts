import type { SupabaseClient } from "@supabase/supabase-js";
import type { CobrancaSaasCooperativa, LivroCaixaLancamento } from "@/types";
import type {
  HbChargeCooperadoLine,
  HbChargeLineItem,
  HbChargeRepasseLine,
  HbUnifiedChargeBreakdown,
} from "@/services/hbAsaasChargeTypes";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { PROPRIETARIO_APP } from "@/config/contratoServicoApp";
import { getAsaasConfig, isAsaasConfigured } from "@/lib/asaas/config";
import {
  createAsaasCustomer,
  createAsaasPixPayment,
  deleteAsaasPayment,
  getAsaasPixQrCode,
} from "@/lib/asaas/client";
import type { AsaasWebhookPayload } from "@/lib/asaas/types";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { confirmAppRepasse } from "@/lib/supabase/contaCoopStorage";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";
import {
  findChargeByAsaasPaymentId,
  findChargeById,
  findChargeByKey,
  getAsaasCustomerId,
  insertHbAsaasCharge,
  markWebhookEventProcessed,
  updateHbAsaasCharge,
  upsertAsaasCustomerId,
  type HbAsaasChargeRow,
} from "@/lib/supabase/hbAsaasStorage";
import { fetchCobrancaSaasPlatformSettings } from "@/lib/supabase/platformSettingsStorage";
import {
  calcularValorCobrancaSaas,
  getPeriodoCobrancaSaas,
  type CobrancaSaasPricing,
} from "@/services/cobrancaSaasService";
import { normalizeCnpj } from "@/utils/cooperativa";
import { generateId } from "@/utils/generateId";
import { getCurrentMesReferencia } from "@/utils/format";

export type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function formatDueDate(isoDay: string): string {
  return isoDay;
}

function buildChargeKey(cnpj: string, periodoId: string | null, mesReferencia: string): string {
  return `${cnpj}:saas:${periodoId ?? "none"}:repasse:${mesReferencia}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function buildUnifiedHbChargeBreakdown(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  mesReferenciaContaCoop?: string
): Promise<{ ok: true; breakdown: HbUnifiedChargeBreakdown } | { ok: false; error: string }> {
  const cnpj = normalizeCnpj(cooperativeCnpj);
  if (cnpj.length !== 14) return { ok: false, error: "CNPJ inválido." };

  const mesReferencia = mesReferenciaContaCoop?.trim() || getCurrentMesReferencia();

  const { data: coopRow, error: coopError } = await supabase
    .from("cooperativas")
    .select("id, nome, email, cnpj, cobranca_saas")
    .eq("cnpj", cnpj)
    .maybeSingle();

  if (coopError || !coopRow) {
    return { ok: false, error: "Cooperativa não encontrada na nuvem." };
  }

  const pricingSettings = await fetchCobrancaSaasPlatformSettings(supabase);
  const pricing: CobrancaSaasPricing = {
    precoCooperado: pricingSettings.precoCooperado,
    minimoMes: pricingSettings.minimoMes,
  };

  const cooperadosRaw = await fetchCooperadosFromStorage(supabase, cnpj);
  const cooperadosAtivos = cooperadosRaw.filter((c) => c.status !== "desligado");
  const saasCalc = calcularValorCobrancaSaas(cooperadosAtivos.length, pricing);

  const cob = (coopRow.cobranca_saas ?? null) as CobrancaSaasCooperativa | null;
  let periodoSaas: HbUnifiedChargeBreakdown["periodoSaas"] = null;
  let saasDue = false;

  if (cob?.cicloInicioEm) {
    const periodo = getPeriodoCobrancaSaas(cob.cicloInicioEm);
    periodoSaas = {
      periodoId: periodo.periodoId,
      label: periodo.label,
      vencimento: periodo.vencimento,
      mesReferencia: periodo.mesReferencia,
    };
    const jaPago = cob.ultimoPeriodoPago === periodo.periodoId;
    const lancAtual = (cob.historico ?? []).find((h) => h.periodoId === periodo.periodoId);
    const aguardandoConfirmacao = lancAtual?.status === "aguardando_confirmacao";
    saasDue = !jaPago && saasCalc.valorTotal > 0 && !aguardandoConfirmacao;
  }

  const unitCents = Math.round(pricing.precoCooperado * 100);
  const cooperadoLines: HbChargeCooperadoLine[] = cooperadosAtivos.map((c) => ({
    id: c.id,
    nome: c.nomeCompleto,
    status: c.status,
    valorUnitarioCents: unitCents,
  }));

  const { data: repasseAllocRows } = await supabase
    .from("hb_credit_discount_allocations")
    .select(
      "id, transaction_id, partner_id, gross_cents, discount_cents, app_cents, created_at"
    )
    .eq("cooperative_cnpj", cnpj)
    .eq("mes_referencia", mesReferencia)
    .eq("app_pool_status", "LIQUIDATED")
    .is("app_repasse_id", null)
    .neq("cashback_status", "REVERSED")
    .gt("app_cents", 0)
    .order("created_at", { ascending: false });

  const partnerIds = [...new Set((repasseAllocRows ?? []).map((r) => String(r.partner_id)))];
  const partnerNames: Record<string, string> = {};
  if (partnerIds.length) {
    const { data: partners } = await supabase.from("hb_credit_partners").select("id, name").in("id", partnerIds);
    for (const p of partners ?? []) partnerNames[String(p.id)] = String(p.name);
  }

  const repasseCompras: HbChargeRepasseLine[] = (repasseAllocRows ?? []).map((row) => ({
    allocationId: String(row.id),
    transactionId: String(row.transaction_id),
    partnerNome: partnerNames[String(row.partner_id)] ?? "Mercado",
    grossCents: Number(row.gross_cents),
    discountCents: Number(row.discount_cents),
    appCents: Number(row.app_cents),
    createdAt: String(row.created_at),
  }));

  const repasseSubtotalCents = repasseCompras.reduce((s, r) => s + r.appCents, 0);

  const { data: repasseExisting } = await supabase
    .from("hb_credit_app_repasse")
    .select("id")
    .eq("cooperative_cnpj", cnpj)
    .eq("mes_referencia", mesReferencia)
    .maybeSingle();

  const repasseDue = !repasseExisting && repasseSubtotalCents > 0;
  const saasSubtotalCents = saasDue ? Math.round(saasCalc.valorTotal * 100) : 0;
  const totalCents = saasSubtotalCents + (repasseDue ? repasseSubtotalCents : 0);

  const lineItems: HbChargeLineItem[] = [];

  if (saasDue) {
    lineItems.push({
      kind: "saas_mensalidade",
      label: "Mensalidade HB · cooperados cadastrados",
      detail: `${cooperadosAtivos.length} cooperado(s) × R$ ${pricing.precoCooperado.toFixed(2).replace(".", ",")} (mín. R$ ${pricing.minimoMes.toFixed(2).replace(".", ",")}) · ciclo ${periodoSaas?.label ?? ""}`,
      amountCents: saasSubtotalCents,
    });
  }

  if (repasseDue) {
    lineItems.push({
      kind: "conta_coop_repasse",
      label: `Conta Coop · repasse HB (${CONTA_COOP_DESCONTO_SPLIT.appPercent}% do desconto)`,
      detail: `${repasseCompras.length} compra(s) liquidada(s) em ${mesReferencia} — somente movimento real apurado na nuvem`,
      amountCents: repasseSubtotalCents,
    });
  }

  const breakdown: HbUnifiedChargeBreakdown = {
    generatedAt: new Date().toISOString(),
    cooperativeCnpj: cnpj,
    cooperativeNome: String(coopRow.nome ?? cnpj),
    cooperativeId: String(coopRow.id),
    mesReferenciaContaCoop: mesReferencia,
    periodoSaas,
    saasDue,
    repasseDue,
    pricing,
    cooperados: cooperadoLines,
    repasseCompras,
    lineItems,
    saasSubtotalCents,
    repasseSubtotalCents: repasseDue ? repasseSubtotalCents : 0,
    totalCents,
    receiver: {
      cpf: PROPRIETARIO_APP.pixChave,
      nome: PROPRIETARIO_APP.pixNome,
    },
  };

  return { ok: true, breakdown };
}

async function ensureAsaasCustomer(
  supabase: SupabaseClient,
  breakdown: HbUnifiedChargeBreakdown,
  email?: string | null
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const config = getAsaasConfig();
  if (!config) return { ok: false, error: "Asaas não configurado (ASAAS_API_KEY)." };

  const existing = await getAsaasCustomerId(supabase, breakdown.cooperativeCnpj);
  if (existing) return { ok: true, customerId: existing };

  const created = await createAsaasCustomer(config, {
    name: breakdown.cooperativeNome,
    cpfCnpj: breakdown.cooperativeCnpj,
    email: email ?? undefined,
    externalReference: breakdown.cooperativeCnpj,
  });
  if (!created.ok) return created;

  await upsertAsaasCustomerId(supabase, breakdown.cooperativeCnpj, created.customer.id);
  return { ok: true, customerId: created.customer.id };
}

function buildAsaasDescription(breakdown: HbUnifiedChargeBreakdown): string {
  const parts = breakdown.lineItems.map((item) => `${item.label}: ${(item.amountCents / 100).toFixed(2)}`);
  return `HB Cooperativas · ${breakdown.cooperativeNome.slice(0, 40)} · ${parts.join(" | ")}`.slice(0, 480);
}

export async function createUnifiedHbAsaasCharge(input: {
  supabase: SupabaseClient;
  cooperativeCnpj: string;
  mesReferenciaContaCoop?: string;
  userId?: string;
  userName?: string;
  coopEmail?: string | null;
}): Promise<
  | {
      ok: true;
      charge: HbAsaasChargeRow;
      breakdown: HbUnifiedChargeBreakdown;
      pix: { payload: string; encodedImage: string; invoiceUrl?: string };
    }
  | { ok: false; error: string }
> {
  if (!isAsaasConfigured()) {
    return { ok: false, error: "Integração Asaas não configurada. Defina ASAAS_API_KEY no servidor." };
  }

  const config = getAsaasConfig();
  if (!config) return { ok: false, error: "Asaas indisponível." };

  const built = await buildUnifiedHbChargeBreakdown(
    input.supabase,
    input.cooperativeCnpj,
    input.mesReferenciaContaCoop
  );
  if (!built.ok) return built;
  const breakdown = built.breakdown;

  if (breakdown.totalCents <= 0) {
    return {
      ok: false,
      error: breakdown.saasDue || breakdown.repasseDue
        ? "Não há valor a cobrar no momento."
        : "Nenhuma mensalidade ou repasse Conta Coop pendente com base nos movimentos reais.",
    };
  }

  const chargeKey = buildChargeKey(
    breakdown.cooperativeCnpj,
    breakdown.periodoSaas?.periodoId ?? null,
    breakdown.mesReferenciaContaCoop
  );

  const existingByKey = await findChargeByKey(input.supabase, chargeKey);
  const pending = existingByKey && ["draft", "pending"].includes(existingByKey.status) ? existingByKey : null;

  if (pending && pending.total_cents === breakdown.totalCents && pending.asaas_payment_id) {
    return {
      ok: true,
      charge: pending,
      breakdown: pending.breakdown as HbUnifiedChargeBreakdown,
      pix: {
        payload: pending.pix_payload ?? "",
        encodedImage: pending.pix_qr_base64 ?? "",
        invoiceUrl: pending.asaas_invoice_url ?? undefined,
      },
    };
  }

  if (pending?.asaas_payment_id && pending.total_cents !== breakdown.totalCents) {
    await deleteAsaasPayment(config, pending.asaas_payment_id).catch(() => undefined);
    await updateHbAsaasCharge(input.supabase, pending.id, { status: "cancelled" });
  }

  const customer = await ensureAsaasCustomer(input.supabase, breakdown, input.coopEmail);
  if (!customer.ok) return customer;

  const dueDate =
    breakdown.periodoSaas?.vencimento && breakdown.saasDue
      ? formatDueDate(breakdown.periodoSaas.vencimento)
      : new Date().toISOString().slice(0, 10);

  const chargeId = existingByKey?.id ?? crypto.randomUUID();
  const paymentCreated = await createAsaasPixPayment(config, {
    customer: customer.customerId,
    billingType: "PIX",
    value: centsToReais(breakdown.totalCents),
    dueDate,
    description: buildAsaasDescription(breakdown),
    externalReference: chargeId,
  });
  if (!paymentCreated.ok) return paymentCreated;

  const pixResult = await getAsaasPixQrCode(config, paymentCreated.payment.id);
  if (!pixResult.ok) return pixResult;

  const chargeRow = {
    id: chargeId,
    cooperative_cnpj: breakdown.cooperativeCnpj,
    charge_key: chargeKey,
    periodo_saas_id: breakdown.periodoSaas?.periodoId ?? null,
    mes_referencia_conta_coop: breakdown.mesReferenciaContaCoop,
    saas_cooperados_count: breakdown.cooperados.length,
    saas_subtotal_cents: breakdown.saasSubtotalCents,
    repasse_alloc_count: breakdown.repasseCompras.length,
    repasse_subtotal_cents: breakdown.repasseSubtotalCents,
    total_cents: breakdown.totalCents,
    breakdown,
    asaas_payment_id: paymentCreated.payment.id,
    asaas_invoice_url: paymentCreated.payment.invoiceUrl ?? null,
    pix_payload: pixResult.pix.payload,
    pix_qr_base64: pixResult.pix.encodedImage,
    status: "pending" as const,
    created_by_user_id: input.userId ?? null,
    created_by_name: input.userName ?? null,
  };

  let charge: HbAsaasChargeRow | null;
  if (existingByKey) {
    await updateHbAsaasCharge(input.supabase, existingByKey.id, chargeRow);
    charge = { ...existingByKey, ...chargeRow, updated_at: new Date().toISOString() };
  } else {
    charge = await insertHbAsaasCharge(input.supabase, chargeRow);
  }

  if (!charge) return { ok: false, error: "Não foi possível registrar a cobrança na nuvem." };

  return {
    ok: true,
    charge,
    breakdown,
    pix: {
      payload: pixResult.pix.payload,
      encodedImage: pixResult.pix.encodedImage,
      invoiceUrl: paymentCreated.payment.invoiceUrl,
    },
  };
}

async function confirmSaasOnCloud(
  supabase: SupabaseClient,
  breakdown: HbUnifiedChargeBreakdown,
  confirmedBy: string
): Promise<{ ok: boolean; error?: string }> {
  if (!breakdown.saasDue || breakdown.saasSubtotalCents <= 0) return { ok: true };

  const { data: coopRow } = await supabase
    .from("cooperativas")
    .select("cobranca_saas")
    .eq("cnpj", breakdown.cooperativeCnpj)
    .maybeSingle();

  const cob = (coopRow?.cobranca_saas ?? {}) as CobrancaSaasCooperativa;
  if (!cob.cicloInicioEm || !breakdown.periodoSaas) return { ok: false, error: "Ciclo SaaS não iniciado." };

  const now = new Date().toISOString();
  const periodo = breakdown.periodoSaas;
  const historico = [...(cob.historico ?? [])];
  const idx = historico.findIndex((h) => h.periodoId === periodo.periodoId);

  const lancamento = {
    id: idx >= 0 ? historico[idx].id : generateId("cs"),
    periodoId: periodo.periodoId,
    mesReferencia: periodo.mesReferencia,
    qtdCooperados: breakdown.cooperados.length,
    valorUnitario: breakdown.pricing.precoCooperado,
    valorMinimo: breakdown.pricing.minimoMes,
    valorTotal: breakdown.saasSubtotalCents / 100,
    status: "paga" as const,
    criadaEm: idx >= 0 ? historico[idx].criadaEm : now,
    pagaEm: now,
    confirmadoPor: confirmedBy,
    observacao: "Confirmado automaticamente via Asaas",
  };

  if (idx >= 0) historico[idx] = { ...historico[idx], ...lancamento };
  else historico.push(lancamento);

  const nextCob: CobrancaSaasCooperativa = {
    ...cob,
    statusMes: "em_dia",
    ultimoPeriodoPago: periodo.periodoId,
    avisoMensagem: undefined,
    avisoEm: undefined,
    bloqueadoEm: undefined,
    bloqueadoPor: undefined,
    historico,
  };

  const { error } = await supabase
    .from("cooperativas")
    .update({ cobranca_saas: nextCob, updated_at: now })
    .eq("cnpj", breakdown.cooperativeCnpj);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function appendRepasseLivroCaixaCloud(
  supabase: SupabaseClient,
  breakdown: HbUnifiedChargeBreakdown,
  origemId: string,
  valorReais: number,
  responsavelNome: string,
  paidAt: string
): Promise<void> {
  const cnpj = breakdown.cooperativeCnpj;
  const existing = (await fetchOperacionalSync(supabase, cnpj)) as OperacionalSyncPayload | null;
  const payload: OperacionalSyncPayload = existing ?? {
    updatedAt: new Date().toISOString(),
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  };

  const livro = [...(payload.livroCaixa ?? [])];
  if (livro.some((l) => l.origemId === origemId)) return;

  const [ano, mesNum] = breakdown.mesReferenciaContaCoop.split("-");
  const mesCurto = mesNum && ano ? `${mesNum.padStart(2, "0")}/${ano}` : breakdown.mesReferenciaContaCoop;
  const dataLanc = paidAt.split("T")[0];
  const entry: LivroCaixaLancamento = {
    id: generateId("lc"),
    cooperativaId: breakdown.cooperativeId,
    data: dataLanc,
    mesReferencia: breakdown.mesReferenciaContaCoop,
    tipo: "debito",
    valor: round2(valorReais),
    historico: `Repasse HB · taxa Conta Coop ${CONTA_COOP_DESCONTO_SPLIT.appPercent}% · ${mesCurto} · Asaas`,
    origem: "hb_app_repasse",
    origemId,
    categoria: "Conta Coop",
    responsavel: responsavelNome,
    createdAt: paidAt,
    updatedAt: paidAt,
  };

  payload.livroCaixa = [...livro, entry];
  payload.updatedAt = new Date().toISOString();
  await uploadOperacionalSync(supabase, cnpj, payload);
}

export async function processAsaasWebhookPayment(
  supabase: SupabaseClient,
  payload: AsaasWebhookPayload
): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const eventId = payload.id;
  const eventType = payload.event;
  const payment = payload.payment;
  if (!eventId || !payment?.id) return { ok: false, error: "Payload inválido." };

  if (eventType !== "PAYMENT_RECEIVED" && eventType !== "PAYMENT_CONFIRMED") {
    await markWebhookEventProcessed(supabase, eventId, eventType, payment.id, null, payload);
    return { ok: true, duplicate: false };
  }

  const charge = await findChargeByAsaasPaymentId(supabase, payment.id);
  const isNew = await markWebhookEventProcessed(
    supabase,
    eventId,
    eventType,
    payment.id,
    charge?.id ?? null,
    payload
  );
  if (!isNew) return { ok: true, duplicate: true };
  if (!charge) return { ok: false, error: "Cobrança HB não encontrada para este pagamento." };

  const breakdown = charge.breakdown as HbUnifiedChargeBreakdown;
  const paidAt = payment.paymentDate ?? payment.confirmedDate ?? new Date().toISOString();
  const confirmedBy = "Asaas · confirmação automática";

  if (breakdown.saasDue && breakdown.saasSubtotalCents > 0) {
    const saas = await confirmSaasOnCloud(supabase, breakdown, confirmedBy);
    if (!saas.ok) return saas;
  }

  let livroCaixaOrigemId: string | undefined;
  if (breakdown.repasseDue && breakdown.repasseSubtotalCents > 0) {
    const repasse = await confirmAppRepasse(supabase, {
      cnpj: breakdown.cooperativeCnpj,
      mesReferencia: breakdown.mesReferenciaContaCoop,
      responsavelUserId: charge.created_by_user_id ?? "asaas",
      responsavelNome: charge.created_by_name ?? confirmedBy,
      comprovanteMemo: `Asaas ${payment.id}`,
    });
    if (!repasse.ok) return repasse;
    livroCaixaOrigemId = repasse.livroCaixaOrigemId ?? repasse.repasse?.livroCaixaOrigemId;
    if (livroCaixaOrigemId) {
      await appendRepasseLivroCaixaCloud(
        supabase,
        breakdown,
        livroCaixaOrigemId,
        breakdown.repasseSubtotalCents / 100,
        charge.created_by_name ?? confirmedBy,
        paidAt
      );
    }
  }

  await updateHbAsaasCharge(supabase, charge.id, {
    status: "confirmed",
    paid_at: paidAt,
    saas_confirmed_at: breakdown.saasDue ? paidAt : charge.saas_confirmed_at,
    repasse_confirmed_at: breakdown.repasseDue ? paidAt : charge.repasse_confirmed_at,
  });

  return { ok: true };
}

export async function syncLocalFromCloudCharge(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  chargeId?: string
): Promise<{
  cobrancaSaas?: CobrancaSaasCooperativa;
  charge?: HbAsaasChargeRow;
  livroCaixaOrigemId?: string;
}> {
  const cnpj = normalizeCnpj(cooperativeCnpj);
  const { data: coopRow } = await supabase
    .from("cooperativas")
    .select("cobranca_saas")
    .eq("cnpj", cnpj)
    .maybeSingle();

  let charge: HbAsaasChargeRow | null = null;
  if (chargeId) {
    charge = await findChargeById(supabase, chargeId);
    if (charge && normalizeCnpj(charge.cooperative_cnpj) !== cnpj) charge = null;
  } else {
    const { data } = await supabase
      .from("hb_asaas_charges")
      .select("*")
      .eq("cooperative_cnpj", cnpj)
      .eq("status", "confirmed")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    charge = data ? (data as HbAsaasChargeRow) : null;
  }

  let livroCaixaOrigemId: string | undefined;
  if (charge?.repasse_confirmed_at && charge.repasse_subtotal_cents > 0) {
    const { data: repasse } = await supabase
      .from("hb_credit_app_repasse")
      .select("livro_caixa_origem_id")
      .eq("cooperative_cnpj", cnpj)
      .eq("mes_referencia", charge.mes_referencia_conta_coop)
      .maybeSingle();
    livroCaixaOrigemId = repasse?.livro_caixa_origem_id
      ? String(repasse.livro_caixa_origem_id)
      : undefined;
  }

  return {
    cobrancaSaas: coopRow?.cobranca_saas as CobrancaSaasCooperativa | undefined,
    charge: charge ?? undefined,
    livroCaixaOrigemId,
  };
}
