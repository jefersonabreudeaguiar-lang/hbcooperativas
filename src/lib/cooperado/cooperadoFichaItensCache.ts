import type { AppData } from '@/types';
import type { CooperadoFinanceiroRemoto } from './cooperadoFinanceiroRemotoTypes';

/** Confirmed cloud receipt IDs outrank a device snapshot that has not synced yet. Never persists. */
export function projetarQuitacaoRemotaNasFichas(data: AppData, remoto: CooperadoFinanceiroRemoto | null, member: string, coop: string): AppData {
  if (!remoto?.historicoPagamentos || remoto.cooperadoId !== member || remoto.cooperativaId !== coop) return data;
  const ids = new Set(remoto.historicoPagamentos.pagamentos.flatMap(p => p.fichaIds ?? []));
  const notes = new Set(remoto.historicoPagamentos.pagamentos.flatMap(p => p.notaPedidoIds ?? []));
  let changed = false;
  const fichaCorrida = data.fichaCorrida.map(f => {
    if (f.cooperativaId !== coop || f.cooperadoId !== member || f.status === 'pago') return f;
    if (!ids.has(f.id) && !notes.has(f.notaPedidoId)) return f;
    changed = true;
    return { ...f, status: 'pago' as const };
  });
  return changed ? { ...data, fichaCorrida } : data;
}

/** Empty current open items are authoritative: an old cache must not reopen paid deliveries. */
export function escolherItensFichaExibicao<T extends { itens: unknown[] }>(
  atual: T, cache: T | null, aberto: boolean, dadosDisponiveis: boolean,
): T {
  if (aberto && dadosDisponiveis) return atual;
  return atual.itens.length === 0 && cache ? cache : atual;
}
