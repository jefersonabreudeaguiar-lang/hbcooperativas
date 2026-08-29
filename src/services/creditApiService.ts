import { secureApiFetch, mensagemErroAuthApi } from "@/lib/security/clientSession";
import type {
  ContaCoopDashboard,
  ContaCoopIntent,
  ContaCoopLedgerEntry,
  ContaCoopLimiteCooperado,
  ContaCoopParceiro,
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

export async function postCreditParceiroStatus(cnpj: string, parceiroId: string, status: "ativo" | "bloqueado") {
  const res = await secureApiFetch("/api/credit/parceiros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, parceiroId, status }),
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
  intentId: string;
  nonce: string;
  pin: string;
  idempotencyKey: string;
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

export async function fetchMercadoParceiroData() {
  const res = await secureApiFetch("/api/credit/mercado");
  const data = await parseJson<{
    ok?: boolean;
    error?: string;
    parceiro?: ContaCoopParceiro;
    intents?: ContaCoopIntent[];
    recebiveis?: { id: string; amountCents: number; status: string; createdAt: string }[];
  }>(res);
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao carregar mercado.");
  return data;
}
