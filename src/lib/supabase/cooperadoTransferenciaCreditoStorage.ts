import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COOPERADO_TRANSFER_INTENT_ID_PREFIX,
  isCooperadoTransferIntentId,
} from "@/config/cooperadoTransferenciaCredito";
import { INTENT_EXPIRY_MINUTES } from "@/modules/hb-credit/config";
import { buildHbCreditQrPayload } from "@/lib/hb-credit/hbCreditQrPayload";
import { getLimiteCooperadoAlinhadoAEntregas } from "@/lib/supabase/contaCoopStorage";
import type { ContaCoopIntent, ContaCoopLimiteCooperado, IntentStatus } from "@/modules/hb-credit/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { verifyFinancialPin } from "@/lib/supabase/contaCoopStorage";

export type CooperadoTransferIntent = {
  id: string;
  cooperativeCnpj: string;
  receiverCooperadoId: string;
  receiverNome: string;
  amountCents: number;
  descricao?: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  nonce: string;
  expiresAt: string;
  createdAt: string;
  payerCooperadoId?: string;
  receiptCode?: string;
  confirmedAt?: string;
};

function genTransferId(): string {
  return `${COOPERADO_TRANSFER_INTENT_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function secureNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function mapRow(row: Record<string, unknown>, receiverNome: string): CooperadoTransferIntent {
  return {
    id: String(row.id),
    cooperativeCnpj: String(row.cooperative_cnpj),
    receiverCooperadoId: String(row.receiver_cooperado_id),
    receiverNome,
    amountCents: Number(row.amount_cents),
    descricao: row.description ? String(row.description) : undefined,
    status: String(row.status) as CooperadoTransferIntent["status"],
    nonce: String(row.nonce),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    payerCooperadoId: row.payer_cooperado_id ? String(row.payer_cooperado_id) : undefined,
    receiptCode: row.receipt_code ? String(row.receipt_code) : undefined,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : undefined,
  };
}

export { isCooperadoTransferIntentId };

export type CooperadoTransferPaymentPoll = {
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

function transferIntentStatusFromDb(raw: string): IntentStatus {
  switch (String(raw).toUpperCase()) {
    case "CONFIRMED":
      return "confirmada";
    case "CANCELLED":
      return "cancelada";
    case "EXPIRED":
      return "expirada";
    default:
      return "pendente";
  }
}

export async function resolveCooperadoNomeForTransfer(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  cooperadoId: string,
  fallback = "Cooperado"
): Promise<string> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const id = cooperadoId.trim();
  if (!id) return fallback;
  const { fetchCooperadoFromStorage } = await import("@/lib/supabase/cooperadosStorage");
  const cooperado = await fetchCooperadoFromStorage(supabase, digits, id);
  const nome = cooperado?.nomeCompleto?.trim();
  return nome || fallback;
}

export async function pollCooperadoTransferIntentForReceiver(
  supabase: SupabaseClient,
  intentId: string,
  receiverCooperadoId: string,
  cooperativeCnpj: string,
  opts?: { includeCpf?: boolean }
): Promise<{ ok: true; data: CooperadoTransferPaymentPoll } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const { data: row } = await supabase
    .from("hb_credit_cooperado_transfer_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Cobrança não encontrada." };
  if (String(row.cooperative_cnpj) !== digits) return { ok: false, error: "Cooperativa inválida." };
  if (String(row.receiver_cooperado_id) !== receiverCooperadoId) {
    return { ok: false, error: "Sem permissão." };
  }

  const status = transferIntentStatusFromDb(String(row.status));
  const base: CooperadoTransferPaymentPoll = {
    status,
    intentId: String(row.id),
    amountCents: Number(row.amount_cents),
    descricao: row.description ? String(row.description) : undefined,
    expiresAt: String(row.expires_at),
  };

  if (status !== "confirmada") {
    return { ok: true, data: base };
  }

  const payerId = String(row.payer_cooperado_id ?? "");
  const { fetchCooperadoFromStorage } = await import("@/lib/supabase/cooperadosStorage");
  const cooperado = payerId
    ? await fetchCooperadoFromStorage(supabase, digits, payerId)
    : null;
  const cooperadoNome = cooperado?.nomeCompleto?.trim() || "Cooperado";
  const cooperadoCpf =
    opts?.includeCpf !== false && cooperado?.cpfCnpj ? String(cooperado.cpfCnpj) : "";

  return {
    ok: true,
    data: {
      ...base,
      payment: {
        transacaoId: String(row.id),
        receiptCode: row.receipt_code ? String(row.receipt_code) : null,
        paidAt: String(row.confirmed_at ?? row.updated_at ?? new Date().toISOString()),
        cooperadoId: payerId,
        cooperadoNome,
        cooperadoCpf,
      },
    },
  };
}

export async function createCooperadoTransferIntent(
  supabase: SupabaseClient,
  input: {
    cooperativeCnpj: string;
    receiverCooperadoId: string;
    receiverNome: string;
    amountCents: number;
    descricao?: string;
    idempotencyKey?: string;
  }
): Promise<{ intent: CooperadoTransferIntent; qrPayload: string }> {
  const digits = normalizeCnpj(input.cooperativeCnpj);
  if (digits.length !== 14 || input.amountCents <= 0) {
    throw new Error("Dados inválidos.");
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("hb_credit_cooperado_transfer_intents")
      .select("*")
      .eq("cooperative_cnpj", digits)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing && String(existing.status) === "PENDING") {
      const intent = mapRow(existing as Record<string, unknown>, input.receiverNome);
      return { intent, qrPayload: buildHbCreditQrPayload(intent.id, intent.nonce) };
    }
  }

  const id = genTransferId();
  const nonce = secureNonce();
  const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MINUTES * 60_000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("hb_credit_cooperado_transfer_intents")
    .insert({
      id,
      cooperative_cnpj: digits,
      receiver_cooperado_id: input.receiverCooperadoId,
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

  if (error || !data) {
    throw new Error(error?.message ?? "Não foi possível criar a cobrança.");
  }

  const intent = mapRow(data as Record<string, unknown>, input.receiverNome);
  return { intent, qrPayload: buildHbCreditQrPayload(intent.id, intent.nonce) };
}

export async function cancelCooperadoTransferIntent(
  supabase: SupabaseClient,
  intentId: string,
  receiverCooperadoId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isCooperadoTransferIntentId(intentId)) {
    return { ok: false, error: "Cobrança inválida." };
  }
  const { data } = await supabase
    .from("hb_credit_cooperado_transfer_intents")
    .select("receiver_cooperado_id, status")
    .eq("id", intentId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Cobrança não encontrada." };
  if (String(data.receiver_cooperado_id) !== receiverCooperadoId) {
    return { ok: false, error: "Sem permissão." };
  }
  if (String(data.status) !== "PENDING") {
    return { ok: false, error: "Cobrança já encerrada." };
  }
  await supabase
    .from("hb_credit_cooperado_transfer_intents")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", intentId);
  return { ok: true };
}

export async function getCooperadoTransferIntentStatus(
  supabase: SupabaseClient,
  intentId: string,
  receiverCooperadoId: string,
  receiverNome: string
): Promise<
  | {
      ok: true;
      intent: CooperadoTransferIntent;
      payment?: {
        receiptCode: string | null;
        paidAt: string;
        payerCooperadoId: string;
      };
    }
  | { ok: false; error: string }
> {
  const { data } = await supabase
    .from("hb_credit_cooperado_transfer_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Cobrança não encontrada." };
  if (String(data.receiver_cooperado_id) !== receiverCooperadoId) {
    return { ok: false, error: "Sem permissão." };
  }
  const intent = mapRow(data as Record<string, unknown>, receiverNome);
  if (intent.status === "CONFIRMED" && intent.confirmedAt) {
    return {
      ok: true,
      intent,
      payment: {
        receiptCode: intent.receiptCode ?? null,
        paidAt: intent.confirmedAt,
        payerCooperadoId: intent.payerCooperadoId ?? "",
      },
    };
  }
  return { ok: true, intent };
}

export async function validateCooperadoTransferForPayer(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    nonce: string;
    payerCooperadoId: string;
    cooperativeCnpj: string;
    receiverNome: string;
  }
): Promise<
  | {
      ok: true;
      intent: ContaCoopIntent;
      parceiroNome: string;
      limite: ContaCoopLimiteCooperado;
      receiverCooperadoId: string;
    }
  | { ok: false; error: string; code?: string }
> {
  const digits = normalizeCnpj(input.cooperativeCnpj);
  const { data: row } = await supabase
    .from("hb_credit_cooperado_transfer_intents")
    .select("*")
    .eq("id", input.intentId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Cobrança não encontrada." };
  if (String(row.cooperative_cnpj) !== digits) return { ok: false, error: "Cooperativa inválida." };
  if (String(row.nonce) !== input.nonce) return { ok: false, error: "QR inválido." };
  if (String(row.receiver_cooperado_id) === input.payerCooperadoId) {
    return { ok: false, error: "Você não pode pagar para si mesmo." };
  }
  if (String(row.status) !== "PENDING") {
    return { ok: false, error: "Cobrança já utilizada." };
  }
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "Cobrança expirada." };
  }

  const limite = await getLimiteCooperadoAlinhadoAEntregas(supabase, digits, input.payerCooperadoId);
  if (!limite) {
    return { ok: false, error: "Cooperado sem limite HB." };
  }
  if ((limite.valorDisponivelCents ?? 0) < Number(row.amount_cents)) {
    return { ok: false, error: "Saldo HB insuficiente." };
  }

  const intent: ContaCoopIntent = {
    id: String(row.id),
    cooperativaCnpj: digits,
    parceiroId: "cooperado_transfer",
    parceiroNome: input.receiverNome,
    amountCents: Number(row.amount_cents),
    descricao: row.description ? String(row.description) : undefined,
    status: "pendente",
    nonce: String(row.nonce),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };

  return {
    ok: true,
    intent,
    parceiroNome: `Cooperado · ${input.receiverNome}`,
    limite,
    receiverCooperadoId: String(row.receiver_cooperado_id),
  };
}

export async function authorizeCooperadoTransferPayment(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    nonce: string;
    payerCooperadoId: string;
    cooperativeCnpj: string;
    idempotencyKey: string;
    pin: string;
    actorUserId: string;
  }
): Promise<
  | {
      ok: true;
      receiptCode: string;
      disponivelAposCents: number;
      duplicate?: boolean;
      cooperadoTransfer: true;
    }
  | { ok: false; error: string; code?: string }
> {
  const pinCheck = await verifyFinancialPin(
    supabase,
    input.cooperativeCnpj,
    input.payerCooperadoId,
    input.pin,
    input.actorUserId
  );
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  const receiptCode = `T${Date.now().toString(36).toUpperCase().slice(-7)}`;

  const { data, error } = await supabase.rpc("hb_credit_authorize_cooperado_transfer", {
    p_intent_id: input.intentId,
    p_nonce: input.nonce,
    p_payer_cooperado_id: input.payerCooperadoId,
    p_cooperative_cnpj: normalizeCnpj(input.cooperativeCnpj),
    p_idempotency_key: input.idempotencyKey,
    p_receipt_code: receiptCode,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: "Transferência entre cooperados ainda não está ativa na nuvem (migration pendente).",
      };
    }
    return { ok: false, error: error.message };
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    duplicate?: boolean;
    receipt_code?: string;
    disponivel_apos_centavos?: number;
  };

  if (!result?.ok) {
    return { ok: false, error: result?.error ?? "Transferência recusada." };
  }

  return {
    ok: true,
    receiptCode: result.receipt_code ?? receiptCode,
    disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0),
    duplicate: Boolean(result.duplicate),
    cooperadoTransfer: true,
  };
}
