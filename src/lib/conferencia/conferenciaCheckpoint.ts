import type { ConferenciaDraftMemoria } from './conferenciaDraftMemoria';

/** Small, device-local recovery record; never a financial entry or cloud acknowledgement. */
export function conferenciaCheckpointKey(userId: string, coopId: string, notaId: string, relancadaEm = ''): string {
  return `hb-conferencia-checkpoint-v1:${[userId, coopId, notaId, relancadaEm].map(encodeURIComponent).join(':')}`;
}

export function salvarConferenciaCheckpoint(key: string, draft: ConferenciaDraftMemoria, storage?: Pick<Storage, 'setItem'>): { ok: true } | { ok: false; error: string } {
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(draft));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Não foi possível salvar o rascunho neste aparelho. Libere espaço e tente novamente antes de avançar.' };
  }
}

export function lerConferenciaCheckpoint(key: string, notaId: string, storage?: Pick<Storage, 'getItem'>): ConferenciaDraftMemoria | undefined {
  try {
    const raw = (storage ?? window.localStorage).getItem(key);
    if (!raw) return;
    const d = JSON.parse(raw) as ConferenciaDraftMemoria;
    if (d.notaId !== notaId || !Array.isArray(d.itens) || !Array.isArray(d.fotosLancadas) ||
      !d.lancamentosPorFoto || typeof d.lancamentosPorFoto !== 'object' || !Array.isArray(d.divisaoIds) ||
      !Number.isInteger(d.fotoIdx) || d.fotoIdx < 0 || !Number.isFinite(d.descontoPct) ||
      !d.fotosLancadas.every(i => Number.isInteger(i) && i >= 0 && Array.isArray(d.lancamentosPorFoto[i]))) return;
    return d;
  } catch { return; }
}

export function removerConferenciaCheckpoint(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* Completed entries remain authoritative. */ }
}
