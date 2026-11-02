import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import type { Cooperado } from "@/types";
import { getMesesReferenciaPagamento } from "@/services/notaPedidoService";

/** Conferência completa do mês, independente de paginação ou login ativo. */
export function mesCicloEntregasPagamentosCompletos(
  operacional: OperacionalSyncPayload | null,
  cooperativeId: string,
  mesReferencia: string,
  _cooperadosAtivos: Pick<Cooperado, "id">[]
): { ok: boolean; pendentes: string[] } {
  if (!operacional || !cooperativeId) return { ok: false, pendentes: [] };
  const participantes = new Set<string>();
  const exigePagamento = new Set<string>();
  const pendentes = new Set<string>();
  const confirmados = new Set<string>();
  for (const f of operacional.fichaCorrida ?? []) {
    if (f.cooperativaId !== cooperativeId || f.mesReferencia !== mesReferencia) continue;
    participantes.add(f.cooperadoId);
    exigePagamento.add(f.cooperadoId);
    if (f.status === "pendente") pendentes.add(f.cooperadoId);
  }
  for (const a of operacional.arquivosMensais ?? []) {
    if (a.cooperativaId !== cooperativeId || a.mesReferencia !== mesReferencia || !a.notaPedidoIds?.length) continue;
    participantes.add(a.cooperadoId);
    exigePagamento.add(a.cooperadoId);
  }
  for (const p of operacional.pagamentosCooperado ?? []) {
    if (p.cooperativaId !== cooperativeId || !getMesesReferenciaPagamento(p).includes(mesReferencia)) continue;
    participantes.add(p.cooperadoId);
    exigePagamento.add(p.cooperadoId);
    if (p.status === "aguardando_confirmacao") pendentes.add(p.cooperadoId);
    if (p.status === "confirmado") confirmados.add(p.cooperadoId);
  }
  for (const v of operacional.valoresAvulsosReceber ?? []) {
    if (v.cooperativaId !== cooperativeId || v.mesReferencia !== mesReferencia) continue;
    participantes.add(v.cooperadoId);
    if (v.status !== "pago") pendentes.add(v.cooperadoId);
  }
  const ids = [...participantes].filter(id => pendentes.has(id) || (exigePagamento.has(id) && !confirmados.has(id)));
  return { ok: ids.length === 0, pendentes: ids };
}

export function isCicloEntregasQuitadoParaRepasse(
  operacional: OperacionalSyncPayload | null,
  cooperativeId: string,
  mesReferencia: string,
  cooperadosAtivos: Pick<Cooperado, "id">[]
): boolean {
  return mesCicloEntregasPagamentosCompletos(operacional, cooperativeId, mesReferencia, cooperadosAtivos).ok;
}
