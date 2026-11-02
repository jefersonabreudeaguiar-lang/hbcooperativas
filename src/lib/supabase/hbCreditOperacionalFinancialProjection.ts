import type { SupabaseClient } from "@supabase/supabase-js";
import type { LivroCaixaLancamento } from "@/types";
import type { OperacionalSyncPayload } from "./cooperativaSyncStorage";
import { isCashbackLedgerProjectionEnabled, mergeCashbackLedgerReceivables } from "./hbCreditCashbackReceivableProjection";

const failure = "Não foi possível conferir os lançamentos financeiros permanentes. Tente novamente.";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Repasse confirmado não depende de o aparelho conseguir salvar uma segunda cópia. */
export function mergeRepasseBookRecords(payload: OperacionalSyncPayload | null, raw: unknown, previous?: OperacionalSyncPayload | null): OperacionalSyncPayload | null {
  if (!object(raw) || !Array.isArray(raw.entries)) throw new Error(failure);
  if (raw.entries.length === 0) return payload;
  if (!payload || typeof raw.cooperativaId !== "string" || !raw.cooperativaId) throw new Error(failure);
  const coopId = raw.cooperativaId;
  const lines = payload.livroCaixa ?? [];
  const byOrigin = new Map<string, LivroCaixaLancamento[]>();
  const byId = new Map<string, LivroCaixaLancamento[]>();
  for (const line of [...(previous?.livroCaixa ?? []), ...lines]) {
    if (line.origemId) {
      const group = byOrigin.get(line.origemId) ?? [];
      group.push(line);
      byOrigin.set(line.origemId, group);
    }
    const ids = byId.get(line.id) ?? [];
    ids.push(line);
    byId.set(line.id, ids);
  }
  const canonical: LivroCaixaLancamento[] = [];
  const protectedIds = new Set<string>();
  const origins = new Set<string>();
  for (const row of raw.entries) {
    if (!object(row) || typeof row.id !== "string" || !row.id || typeof row.originId !== "string" || !row.originId ||
        origins.has(row.originId) || typeof row.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
        typeof row.amountCents !== "number" || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0 ||
        typeof row.paidAt !== "string" || !Number.isFinite(Date.parse(row.paidAt)) ||
        typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error(failure);
    origins.add(row.originId);
    const matches = byOrigin.get(row.originId) ?? [];
    if (matches.some(l => l.cooperativaId !== coopId || l.origem !== "hb_app_repasse")) throw new Error(failure);
    const existing = matches[0];
    const id = existing?.id ?? `lc_hb_repasse_${row.id}`;
    if (protectedIds.has(id) || (byId.get(id) ?? []).some(l => l.origemId !== row.originId)) throw new Error(failure);
    protectedIds.add(id);
    for (const match of matches) protectedIds.add(match.id);
    const line: LivroCaixaLancamento = {
      ...existing, id, cooperativaId: coopId, origemId: row.originId, origem: "hb_app_repasse",
      tipo: "debito", valor: row.amountCents / 100, mesReferencia: row.month, data: row.date,
      historico: `Repasse HB Créditos · ${row.month.slice(5)}/${row.month.slice(0, 4)}`,
      categoria: "HB Créditos", responsavel: typeof row.responsavel === "string" ? row.responsavel : "HB Créditos",
      createdAt: row.paidAt, updatedAt: row.paidAt,
    };
    // Mesma origem pode ter sido criada em dois aparelhos: mantém uma única linha.
    canonical.push(line);
  }
  return { ...payload, livroCaixa: [...lines.filter(l => !l.origemId || !origins.has(l.origemId)), ...canonical],
    livroCaixaExcluidos: (payload.livroCaixaExcluidos ?? []).filter(e =>
      !protectedIds.has(e.id) || (!!e.cooperativaId && e.cooperativaId !== coopId)) };
}

export async function projectOperationalFinancialRecords(
  supabase: SupabaseClient, cnpj: string, payload: OperacionalSyncPayload | null, previous?: OperacionalSyncPayload | null,
): Promise<OperacionalSyncPayload | null> {
  if (!isCashbackLedgerProjectionEnabled() && process.env.HB_FINANCIAL_LEDGER_PROJECTION !== "true") return payload;
  if (!/^\d{14}$/.test(cnpj)) throw new Error(failure);
  const { data, error } = await supabase.rpc("hb_credit_operational_financial_snapshot", { p_cnpj: cnpj });
  if (error || !object(data) || data.ok !== true || !object(data.cashback) || !object(data.book) ||
      data.cashback.cooperativaId !== data.book.cooperativaId) throw new Error(failure);
  const withCashback = mergeCashbackLedgerReceivables(payload, data.cashback, previous);
  return mergeRepasseBookRecords(withCashback, data.book, previous);
}
