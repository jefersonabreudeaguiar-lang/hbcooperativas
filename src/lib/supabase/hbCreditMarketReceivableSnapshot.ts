import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContaCoopRecebiveisResumo } from "@/modules/hb-credit/types";

const failure = "Não foi possível conferir os recebíveis dos mercados na nuvem. Tente atualizar novamente.";
const amountKeys = ["abertoCents", "elegivelCents", "aReceberCents", "emProcessamentoCents", "emRevisaoCents", "liquidadoCents", "totalPendenteCents", "quantidadePendente", "aguardandoConfirmacaoCents"] as const;
type RecentReceivable = { id: string; partnerId: string; amountCents: number; status: string; createdAt: string };
const statuses: Record<string, string> = { OPEN: "aberto", ELIGIBLE: "elegivel", PROCESSING: "em_processamento", BLOCKED_FOR_REVIEW: "bloqueado_revisao" };
const cents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Recusa dados incompletos: consulta com erro nunca significa saldo zero. */
export function parseMarketReceivableSnapshot(raw: unknown, partnerId?: string) {
  if (!record(raw) || raw.integrityErrors !== 0 || typeof raw.asOf !== "string" || !Number.isFinite(Date.parse(raw.asOf)) || !Array.isArray(raw.summaries) || !Array.isArray(raw.recentReceivables)) throw new Error(failure);
  const ids = new Set<string>();
  const summaries: ContaCoopRecebiveisResumo[] = raw.summaries.map((s: unknown) => {
    if (!record(s) || typeof s.partnerId !== "string" || !s.partnerId || ids.has(s.partnerId) || (partnerId && s.partnerId !== partnerId) || !amountKeys.every(k => cents(s[k])) || !Array.isArray(s.porMes)) throw new Error(failure);
    ids.add(s.partnerId);
    const summary = { ...s, consultadoEm: raw.asOf } as unknown as ContaCoopRecebiveisResumo;
    if (summary.aReceberCents !== summary.abertoCents + summary.elegivelCents || summary.totalPendenteCents !== summary.aReceberCents + summary.emProcessamentoCents + summary.emRevisaoCents) throw new Error(failure);
    const months = new Set<string>();
    for (const m of summary.porMes) {
      if (!record(m) || typeof m.mesReferencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m.mesReferencia) || months.has(m.mesReferencia) || ![m.aReceberCents, m.emProcessamentoCents, m.emRevisaoCents].every(cents)) throw new Error(failure);
      months.add(m.mesReferencia);
    }
    for (const k of ["aReceberCents", "emProcessamentoCents", "emRevisaoCents"] as const) {
      if (summary.porMes.reduce((total, m) => total + m[k], 0) !== summary[k]) throw new Error(failure);
    }
    return summary;
  });
  if (partnerId && summaries.length !== 1) throw new Error(failure);
  const recentReceivables: RecentReceivable[] = raw.recentReceivables.map((r: unknown) => {
    if (!record(r) || typeof r.id !== "string" || typeof r.partnerId !== "string" || !ids.has(r.partnerId) || !cents(r.amountCents) || typeof r.status !== "string" || !Object.hasOwn(statuses, r.status) || typeof r.createdAt !== "string" || !Number.isFinite(Date.parse(r.createdAt))) throw new Error(failure);
    return { id: r.id, partnerId: r.partnerId, amountCents: r.amountCents, status: statuses[r.status], createdAt: r.createdAt };
  });
  return { asOf: raw.asOf, summaries, recentReceivables };
}

/** Uma única leitura consistente, sem limite de linhas nos totais e restrita à cooperativa. */
export async function getMarketReceivableSnapshot(supabase: SupabaseClient, cnpj: string, partnerId?: string) {
  if (!/^\d{14}$/.test(cnpj)) throw new Error(failure);
  const { data, error } = await supabase.rpc("hb_credit_market_receivable_snapshot", { p_cnpj: cnpj, p_partner_id: partnerId ?? null });
  if (error) throw new Error(failure);
  return parseMarketReceivableSnapshot(data, partnerId);
}
