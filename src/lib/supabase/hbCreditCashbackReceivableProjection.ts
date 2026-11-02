import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValorAvulsoReceber } from "@/types";
import type { OperacionalSyncPayload } from "./cooperativaSyncStorage";

const failure = "Não foi possível conferir os créditos de cashback na nuvem. Tente novamente.";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function isCashbackLedgerProjectionEnabled() {
  return process.env.HB_HOMOLOGATION_ONLY === "true" || process.env.HB_CASHBACK_LEDGER_PROJECTION === "true";
}

/** Reconstrói a cópia operacional pelo registro financeiro permanente, sem duplicar. */
export function mergeCashbackLedgerReceivables(
  payload: OperacionalSyncPayload | null, raw: unknown, previousPayload?: OperacionalSyncPayload | null,
): OperacionalSyncPayload | null {
  if (!object(raw) || !Array.isArray(raw.entries)) throw new Error(failure);
  if (!raw.entries.length) return payload;
  if (!payload || typeof raw.cooperativaId !== "string" || !raw.cooperativaId) throw new Error(failure);
  const coopId = raw.cooperativaId;
  const byId = new Map((payload.valoresAvulsosReceber ?? []).map(v => [v.id, v]));
  const paidBefore = new Map((previousPayload?.valoresAvulsosReceber ?? [])
    .filter(v => v.status === "pago" && v.cooperativaId === coopId && v.motivo === "Cashback HB Crédito")
    .map(v => [v.id, v]));
  const ids = new Set<string>();
  for (const row of raw.entries) {
    if (!object(row) || typeof row.id !== "string" || !row.id || ids.has(row.id)
      || typeof row.cooperadoId !== "string" || !row.cooperadoId
      || typeof row.mesReferencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.mesReferencia)
      || typeof row.amountCents !== "number" || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0
      || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) throw new Error(failure);
    ids.add(row.id);
    const previous = paidBefore.get(row.id) ?? byId.get(row.id);
    if (previous && (previous.cooperativaId !== coopId || previous.motivo !== "Cashback HB Crédito")) throw new Error(failure);
    // Pagamento de outro lançamento no mesmo mês não prova quitação deste crédito.
    const paid = previous?.status === "pago";
    const value: ValorAvulsoReceber = {
      id: row.id, cooperativaId: coopId, cooperadoId: row.cooperadoId,
      mesReferencia: row.mesReferencia, motivo: "Cashback HB Crédito", valor: row.amountCents / 100,
      natureza: "credito", status: paid ? "pago" : "pendente", responsavel: previous?.responsavel ?? "HB Créditos",
      dataLancamento: row.createdAt.split("T")[0], createdAt: row.createdAt,
      updatedAt: paid ? previous?.updatedAt ?? row.createdAt : row.createdAt,
      ...(paid ? { dataPagamento: previous?.dataPagamento } : {}),
    };
    byId.set(row.id, value);
  }
  return { ...payload, valoresAvulsosReceber: [...byId.values()] };
}

export async function projectCashbackLedgerReceivables(
  supabase: SupabaseClient, cnpj: string, payload: OperacionalSyncPayload | null,
  previousPayload?: OperacionalSyncPayload | null,
): Promise<OperacionalSyncPayload | null> {
  if (!isCashbackLedgerProjectionEnabled()) return payload;
  if (!/^\d{14}$/.test(cnpj)) throw new Error(failure);
  const { data, error } = await supabase.rpc("hb_credit_cashback_receivables_snapshot", { p_cnpj: cnpj });
  if (error) throw new Error(failure);
  return mergeCashbackLedgerReceivables(payload, data, previousPayload);
}
