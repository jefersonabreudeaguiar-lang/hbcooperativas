import type { PagamentoCooperadoRegistro } from '@/types';
import type { HbUtilizacaoResumoLancamento } from './utilizacaoResumo';

/** Only the Financeiro open view is projected; transactions and paid-month history are unchanged. */
export function projetarHbPendentesFinanceiro(
  rows: HbUtilizacaoResumoLancamento[], payments: PagamentoCooperadoRegistro[], memberIds: string[],
): HbUtilizacaoResumoLancamento[] {
  const owners = new Set(memberIds);
  const confirmed = [...new Map(payments.filter(p => p.status === 'confirmado' && owners.has(p.cooperadoId)).map(p => [p.id, p])).values()];
  return rows.flatMap(row => {
    if (!owners.has(row.cooperadoId)) return [];
    const amount = Math.round(Math.abs(row.valorImpactoAReceberReais) * 100);
    if (!amount) return [row];
    let settled = 0;
    for (const p of confirmed) {
      const paidAt = Date.parse(p.pagoEm), createdAt = Date.parse(row.createdAt);
      if (Number.isFinite(paidAt) && Number.isFinite(createdAt) && createdAt > paidAt) continue;
      for (const d of p.descontosExtras ?? []) {
        if (d.tipo !== (row.eventType === 'REFUND' ? 'credito_avulso' : 'conta_coop')) continue;
        if (!Number.isFinite(d.valor) || d.valor <= 0) continue;
        const cents = Math.round(d.valor * 100);
        const exact = d.hbTransactionId === row.hbTransactionId || d.referenciaId === row.hbTransactionId;
        const legacy = row.receiptCode && d.motivo?.includes(`(${row.receiptCode})`) && cents === amount;
        if (exact || legacy) settled += cents;
      }
    }
    if (!settled) return [row];
    const remaining = Math.max(0, amount - settled);
    if (!remaining) return [];
    return [{ ...row, valorHbUtilizadoReais: remaining / 100,
      valorImpactoAReceberReais: Math.sign(row.valorImpactoAReceberReais) * remaining / 100 }];
  });
}
