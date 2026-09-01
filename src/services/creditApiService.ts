import { secureApiFetch, mensagemErroAuthApi } from "@/lib/security/clientSession";
import type {
  ContaCoopCompraEstornavel,
  ContaCoopDashboard,
  ContaCoopIntent,
  ContaCoopLedgerEntry,
  ContaCoopLimiteCooperado,
  ContaCoopLiquidacaoPreview,
  ContaCoopParceiro,
  ContaCoopSettlement,
  ContaCoopSolicitacaoEstorno,
} from "@/modules/hb-credit/types";

async function parseJson<T>(res: Response): Promise<T & { error?: string }> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok && data.error) {
    throw new Error(mensagemErroAuthApi(res.status, data.error));
  }
  return data;
}

export async function fetchCreditDashboard(
  cnpj: string,
  creditosBaseCents: Record<string, number> = {}
): Promise<ContaCoopDashboard | null> {
  const res = await secureApiFetch("/api/credit/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, creditosBaseCents }),
  });
  const data = await parseJson<{ ok?: boolean; dashboard?: ContaCoopDashboard }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar painel.");
  return data.dashboard ?? null;
}

export async function fetchCreditLimites(cnpj: string): Promise<ContaCoopLimiteCooperado[]> {
  const res = await secureApiFetch(`/api/credit/limites?cnpj=${encodeURIComponent(cnpj)}`);
  const data = await parseJson<{ ok?: boolean; limites?: ContaCoopLimiteCooperado[] }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar limites.");
  return data.limites ?? [];
}

export async function fetchCreditParceiros(cnpj: string): Promise<ContaCoopParceiro[]> {
  const res = await secureApiFetch(`/api/credit/parceiros?cnpj=${encodeURIComponent(cnpj)}`);
  const data = await parseJson<{ ok?: boolean; parceiros?: ContaCoopParceiro[] }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar mercados.");
  return data.parceiros ?? [];
}

export async function postCreditLimites(body: Record<string, unknown>) {
  const res = await secureApiFetch("/api/credit/limites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Operação recusada.");
  return data;
}

export async function postCreditParceiroStatus(
  cnpj: string,
  parceiroId: string,
  status: "ativo" | "bloqueado",
  partnerDiscountPercent?: number
) {
  const res = await secureApiFetch("/api/credit/parceiros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, parceiroId, status, partnerDiscountPercent }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível atualizar mercado.");
  return data;
}

export async function fetchCreditAccount(cnpj: string, cooperadoId: string) {
  const res = await secureApiFetch(
    `/api/credit/account?cnpj=${encodeURIComponent(cnpj)}&cooperadoId=${encodeURIComponent(cooperadoId)}`
  );
  const data = await parseJson<{ ok?: boolean; account?: ContaCoopLimiteCooperado; updatedAt?: string | null }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar conta.");
  return data;
}

export async function fetchCreditLedger(cnpj: string, cooperadoId: string): Promise<ContaCoopLedgerEntry[]> {
  const res = await secureApiFetch(
    `/api/credit/account?cnpj=${encodeURIComponent(cnpj)}&cooperadoId=${encodeURIComponent(cooperadoId)}&view=ledger`
  );
  const data = await parseJson<{ ok?: boolean; ledger?: ContaCoopLedgerEntry[] }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar extrato.");
  return data.ledger ?? [];
}

export async function setCreditFinancialPin(cnpj: string, cooperadoId: string, pin: string) {
  const res = await secureApiFetch("/api/credit/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_pin", cnpj, cooperadoId, pin }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível salvar PIN.");
  return data;
}

export async function validateCreditQr(cnpj: string, cooperadoId: string, qrPayload: string) {
  const res = await secureApiFetch("/api/credit/payment-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "validate", cnpj, cooperadoId, qrPayload }),
  });
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    intent?: ContaCoopIntent;
    parceiroNome?: string;
    limite?: ContaCoopLimiteCooperado;
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Cobrança inválida.");
  return data;
}

export async function authorizeCreditPayment(input: {
  cnpj: string;
  cooperadoId: string;
  cooperadoNome?: string;
  intentId: string;
  nonce: string;
  pin: string;
  idempotencyKey: string;
  useCashback?: boolean;
}) {
  const res = await secureApiFetch("/api/credit/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; receiptCode?: string; disponivelAposCents?: number }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Pagamento recusado.");
  return data;
}

export async function createCreditIntent(amountReais: number, descricao?: string) {
  const res = await secureApiFetch("/api/credit/payment-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", amountReais, descricao }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; intent?: ContaCoopIntent; qrPayload?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao criar cobrança.");
  return data;
}

export async function cancelCreditIntent(intentId: string) {
  const res = await secureApiFetch("/api/credit/payment-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel", intentId }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao cancelar.");
  return data;
}

export type CreditIntentPaymentPoll = {
  status: ContaCoopIntent["status"];
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

export async function pollCreditIntentPayment(intentId: string): Promise<CreditIntentPaymentPoll> {
  const res = await secureApiFetch(
    `/api/credit/payment-intents?intentId=${encodeURIComponent(intentId)}`
  );
  const data = await parseJson<CreditIntentPaymentPoll & { ok?: boolean; error?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao consultar cobrança.");
  return data;
}

export async function fetchMercadoParceiroData() {
  const res = await secureApiFetch("/api/credit/mercado");
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    parceiro?: ContaCoopParceiro;
    intents?: ContaCoopIntent[];
    recebiveis?: { id: string; amountCents: number; status: string; createdAt: string }[];
    settlements?: ContaCoopSettlement[];
    hasPin?: boolean;
    fiscalPendentes?: number;
    cooperativaNome?: string;
    needsTermsAcceptance?: boolean;
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar mercado.");
  return data;
}

export async function acceptMercadoContaCoopTermos() {
  const res = await secureApiFetch("/api/credit/mercado", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept_terms" }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; parceiro?: ContaCoopParceiro; needsTermsAcceptance?: boolean }>(
    res
  );
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível registrar o aceite.");
  return data;
}

export async function saveMercadoPix(pixKey: string, pixHolderName: string) {
  const res = await secureApiFetch("/api/credit/mercado", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pixKey, pixHolderName }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; parceiro?: ContaCoopParceiro }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao salvar PIX.");
  return data.parceiro;
}

export async function setMercadoFinancialPin(pin: string) {
  const res = await secureApiFetch("/api/credit/mercado", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_pin", pin }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; hasPin?: boolean }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível salvar PIN.");
  return data;
}

export async function fetchLiquidacaoPreview(cnpj: string, partnerId: string, mesReferencia: string) {
  const res = await secureApiFetch(
    `/api/credit/settlements?cnpj=${encodeURIComponent(cnpj)}&partnerId=${encodeURIComponent(partnerId)}&mesReferencia=${encodeURIComponent(mesReferencia)}`
  );
  const data = await parseJson<{ ok?: boolean; error?: string; preview?: ContaCoopLiquidacaoPreview }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar prévia.");
  return data.preview ?? null;
}

export async function registrarPagamentoMercado(input: {
  cnpj: string;
  partnerId: string;
  mesReferencia: string;
  cooperativaNome: string;
  comprovanteMemo?: string;
}) {
  const res = await secureApiFetch("/api/credit/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register_payment", ...input }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; settlement?: ContaCoopSettlement }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Pagamento não registrado.");
  return data.settlement;
}

export async function confirmarLiquidacaoMercado(settlementId: string, assinaturaDataUrl: string) {
  const res = await secureApiFetch("/api/credit/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm_partner", settlementId, assinaturaDataUrl }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; settlement?: ContaCoopSettlement }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Confirmação recusada.");
  return data.settlement;
}

export async function fetchCreditRefundablePayments(
  cnpj: string,
  filters?: { cooperadoId?: string; partnerId?: string; limit?: number }
): Promise<ContaCoopCompraEstornavel[]> {
  const params = new URLSearchParams({ cnpj });
  if (filters?.cooperadoId) params.set("cooperadoId", filters.cooperadoId);
  if (filters?.partnerId) params.set("partnerId", filters.partnerId);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const res = await secureApiFetch(`/api/credit/refund?${params.toString()}`);
  const data = await parseJson<{ ok?: boolean; compras?: ContaCoopCompraEstornavel[] }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar compras para estorno.");
  return data.compras ?? [];
}

export async function postCreditRefund(cnpj: string, transacaoId: string) {
  const res = await secureApiFetch("/api/credit/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, transacaoId }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; disponivelAposCents?: number }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Estorno recusado.");
  return data;
}

export async function fetchRefundRequests(
  cnpj: string,
  status?: "pendente"
): Promise<ContaCoopSolicitacaoEstorno[]> {
  const params = new URLSearchParams({ cnpj });
  if (status) params.set("status", status);
  const res = await secureApiFetch(`/api/credit/refund-requests?${params.toString()}`);
  const data = await parseJson<{ ok?: boolean; solicitacoes?: ContaCoopSolicitacaoEstorno[] }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar solicitações.");
  return data.solicitacoes ?? [];
}

export async function fetchPartnerRefundData(): Promise<{
  compras: ContaCoopCompraEstornavel[];
  solicitacoes: ContaCoopSolicitacaoEstorno[];
}> {
  const res = await secureApiFetch("/api/credit/refund-requests");
  const data = await parseJson<{
    ok?: boolean;
    compras?: ContaCoopCompraEstornavel[];
    solicitacoes?: ContaCoopSolicitacaoEstorno[];
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar dados de estorno.");
  return { compras: data.compras ?? [], solicitacoes: data.solicitacoes ?? [] };
}

export async function postRefundRequestAction(body: Record<string, unknown>) {
  const res = await secureApiFetch("/api/credit/refund-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; disponivelAposCents?: number; solicitacao?: ContaCoopSolicitacaoEstorno }>(
    res
  );
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Operação recusada.");
  return data;
}

export async function fetchFichaDescontosContaCoop(cnpj: string, cooperadoId: string, mesReferencia: string) {
  const res = await secureApiFetch(
    `/api/credit/ficha-descontos?cnpj=${encodeURIComponent(cnpj)}&cooperadoId=${encodeURIComponent(cooperadoId)}&mesReferencia=${encodeURIComponent(mesReferencia)}`
  );
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    descontos?: Array<{ motivo: string; valorReais: number; tipo: "conta_coop"; createdAt: string }>;
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar descontos Conta Coop.");
  return data.descontos ?? [];
}

export async function fetchMercadoFiscalVendas(mesReferencia: string) {
  const res = await secureApiFetch(
    `/api/credit/fiscal-notes?mesReferencia=${encodeURIComponent(mesReferencia)}`
  );
  const data = await parseJson<{ ok?: boolean; error?: string; vendas?: import("@/modules/hb-credit/types").ContaCoopFiscalNote[] }>(
    res
  );
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar vendas.");
  return data.vendas ?? [];
}

export async function uploadMercadoFiscalNotePhoto(transactionId: string, file: File) {
  const form = new FormData();
  form.append("foto", file);
  form.append("mimeType", file.type || "image/jpeg");
  const res = await secureApiFetch(`/api/credit/fiscal-notes/${encodeURIComponent(transactionId)}/foto`, {
    method: "POST",
    body: form,
  });
  const data = await parseJson<{ ok?: boolean; error?: string; nota?: import("@/modules/hb-credit/types").ContaCoopFiscalNote }>(
    res
  );
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao enviar NF.");
  return data.nota!;
}

export async function fetchStaffFiscalNotes(input: {
  cnpj: string;
  mesReferencia: string;
  partnerId?: string;
  status?: import("@/modules/hb-credit/types").FiscalNoteStatus;
}) {
  const params = new URLSearchParams({
    cnpj: input.cnpj,
    mesReferencia: input.mesReferencia,
  });
  if (input.partnerId) params.set("partnerId", input.partnerId);
  if (input.status) params.set("status", input.status);
  const res = await secureApiFetch(`/api/credit/fiscal-notes?${params.toString()}`);
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    notas?: import("@/modules/hb-credit/types").ContaCoopFiscalNote[];
    resumo?: import("@/modules/hb-credit/types").ContaCoopFiscalNotesResumo;
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar NFs.");
  return { notas: data.notas ?? [], resumo: data.resumo ?? null };
}

export async function fetchFiscalNotePhotoUrl(cnpj: string, transactionId: string) {
  const res = await secureApiFetch(
    `/api/credit/fiscal-notes?cnpj=${encodeURIComponent(cnpj)}&transactionId=${encodeURIComponent(transactionId)}&view=photo`
  );
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    nota?: import("@/modules/hb-credit/types").ContaCoopFiscalNote;
    photoUrl?: string | null;
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar foto.");
  return data;
}

export async function conferirFiscalNote(input: {
  cnpj: string;
  transactionId: string;
  action: "approve" | "reject";
  nfNumber?: string;
  nfIssuedToName?: string;
  nfDate?: string;
  nfAmountReais?: number;
  reason?: string;
  responsavelNome?: string;
}) {
  const res = await secureApiFetch("/api/credit/fiscal-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; nota?: import("@/modules/hb-credit/types").ContaCoopFiscalNote }>(
    res
  );
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Operação recusada.");
  return data.nota!;
}

export async function fetchCooperativeFiscalPending(cnpj: string, mesReferencia: string) {
  const res = await secureApiFetch(
    `/api/credit/fiscal-notes?cnpj=${encodeURIComponent(cnpj)}&mesReferencia=${encodeURIComponent(mesReferencia)}&view=pending_summary`
  );
  const data = await parseJson<{ ok?: boolean; error?: string; conferir?: number; mercadoPendente?: number }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar pendências fiscais.");
  return { conferir: data.conferir ?? 0, mercadoPendente: data.mercadoPendente ?? 0 };
}

export async function fetchDiscountPool(cnpj: string, mesReferencia?: string) {
  const qs = new URLSearchParams({ cnpj });
  if (mesReferencia) qs.set("mes", mesReferencia);
  const res = await secureApiFetch(`/api/credit/discount-pool?${qs.toString()}`);
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    resumo?: import("@/modules/hb-credit/types").ContaCoopDiscountPoolResumo;
    allocations?: import("@/modules/hb-credit/types").ContaCoopDiscountAllocation[];
    mesReferencia?: string;
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar pool de descontos.");
  return data;
}

export async function postUpdatePartnerDiscount(cnpj: string, parceiroId: string, partnerDiscountPercent: number) {
  const res = await secureApiFetch("/api/credit/discount-pool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update_partner_discount", cnpj, parceiroId, partnerDiscountPercent }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível salvar desconto.");
  return data;
}

export async function postSweepCashback(cnpj: string, mesReferencia: string) {
  const res = await secureApiFetch("/api/credit/discount-pool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sweep_cashback", cnpj, mesReferencia }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string; totalCents?: number; cooperados?: number }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao converter cashback.");
  return data;
}
