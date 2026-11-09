import type { AppData } from '@/types';
import type { OperacionalSyncPayload } from '@/lib/supabase/cooperativaSyncStorage';

export function contadorPodeConsultarCentral(user: { role?: string; active?: boolean } | null | undefined, path: string): boolean {
  return user?.role === 'contador' && user.active !== false && (path === '/contador' || path.startsWith('/contador/'));
}

/** Replace supplied domains with saved cloud evidence, including an explicitly empty ledger. */
export function aplicarSnapshotContadorCloud(data: AppData, payload: OperacionalSyncPayload, coopId: string): AppData {
  const next = { ...data };
  for (const [key, rows] of Object.entries(payload)) {
    if (Array.isArray(rows) && key in next) {
      (next as unknown as Record<string, unknown>)[key] = rows.map(row =>
        row && typeof row === 'object' && 'cooperativaId' in row ? { ...row, cooperativaId: coopId } : row);
    }
  }
  return contadorDadosCooperativa(next, coopId);
}

/** Accounting reads never inherit another cooperative from a populated device cache. */
export function contadorDadosCooperativa(data: AppData, coopId: string): AppData {
  const members = new Set(data.cooperados.filter(c => c.cooperativaId === coopId).map(c => c.id));
  const legacySingleTenant = data.cooperativas.length === 1 && data.cooperativas[0].id === coopId;
  const scoped = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    (scoped as unknown as Record<string, unknown>)[key] = value.filter((row: Record<string, unknown>) => {
      if (key === 'cooperativas') return row.id === coopId;
      if (key === 'cooperados') return row.cooperativaId === coopId;
      if (row.cooperativaId) return row.cooperativaId === coopId;
      if (row.cooperadoId) return members.has(String(row.cooperadoId));
      return legacySingleTenant;
    });
  }
  return scoped;
}
