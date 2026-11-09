import type { AppData } from '@/types';
import type { CooperadoHistoricoPagamentos } from './cooperadoFinanceiroRemotoTypes';
import { resolverCooperadoIdCanonico } from '@/services/cooperadoCloudService';

/** Read-only history, scoped to the authenticated member; one PIX is counted once. */
export function buildCooperadoHistoricoPagamentos(data: AppData, cooperadoId: string, cooperativaId: string): CooperadoHistoricoPagamentos {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const byId = new Map<string, AppData['pagamentosCooperado'][number]>();
  for (const p of data.pagamentosCooperado) {
    if (p.status !== 'confirmado' || (p.cooperativaId && p.cooperativaId !== cooperativaId)) continue;
    if (resolverCooperadoIdCanonico(data, p.cooperadoId, cooperativaId) !== canon) continue;
    const previous = byId.get(p.id);
    if (!previous || (p.updatedAt ?? p.createdAt) > (previous.updatedAt ?? previous.createdAt)) byId.set(p.id, p);
  }
  const pagamentos = [...byId.values()].sort((a, b) => b.pagoEm.localeCompare(a.pagoEm) || a.id.localeCompare(b.id)).map(p => {
    if (![p.valorBruto, p.valorLiquido, p.descontoCooperativa].every(Number.isFinite)) throw Error('Pagamento com valores indisponíveis');
    return { id: p.id, meses: [...new Set(p.mesesReferencia?.length ? p.mesesReferencia : [p.mesReferencia])].sort(),
      fichaIds: [...new Set(p.fichaIds ?? [])], notaPedidoIds: [...new Set(p.notaPedidoIds ?? [])],
      pagoEm: p.pagoEm, valorBruto: p.valorBruto, descontoCooperativa: p.descontoCooperativa,
      descontos: (p.descontosExtras ?? []).map(d => ({ descricao: d.motivo?.trim() ||
        (d.tipo === 'conta_coop' ? 'HB Créditos' : d.tipo === 'mensalidade' ? 'Mensalidade' : 'Ajuste avulso'), valor: d.valor })),
      valorRecebido: p.valorLiquido };
  });
  return { totalRecebido: pagamentos.reduce((sum, p) => sum + Math.round(p.valorRecebido * 100), 0) / 100, pagamentos };
}
