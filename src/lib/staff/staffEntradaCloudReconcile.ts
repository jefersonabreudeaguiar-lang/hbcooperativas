import type { AppData, NotaPedido } from '@/types';
import type { OperacionalSyncPayload } from '@/lib/supabase/cooperativaSyncStorage';

/** Full successful entry reads only. Old device copies are recoverable, never republished. */
export function reconciliarEntradaStaffCloud(
  local: AppData, merged: AppData, cloud: OperacionalSyncPayload,
  notas: NotaPedido[], coopId: string, startedAt: number, pendingIds: Set<string>,
): { data: AppData; retired: Record<string, unknown[]> } {
  const retired: Record<string, unknown[]> = {};
  const recentes = (r: { updatedAt?: string; createdAt?: string }) =>
    Date.parse(r.updatedAt ?? r.createdAt ?? '') >= startedAt;
  const cloudNotes = new Map(notas.map(n => [n.id, { ...n, cooperativaId: coopId }]));
  const drafts = new Set(local.notasPedido.filter(n => {
    if (n.cooperativaId !== coopId) return false;
    if (recentes(n)) return true;
    const remote = cloudNotes.get(n.id);
    if (remote && ['pago', 'conferida', 'cancelado', 'rejeitada'].includes(remote.status)) return false;
    if (pendingIds.has(n.id)) return true;
    const unsentPhoto = !n.fotoNaNuvem && !n.fotoEnviadaEm &&
      Boolean(n.fotoPedido || n.fotosPedido?.length || n.fotosMeta?.some(f => f.status !== 'uploaded'));
    return !remote && (n.status === 'rascunho' || unsentPhoto);
  }).map(n => n.id));
  const next = { ...merged };
  next.notasPedido = [
    ...local.notasPedido.filter(n => n.cooperativaId !== coopId || drafts.has(n.id)).map(n =>
      n.cooperativaId === coopId && drafts.has(n.id) && !cloudNotes.has(n.id) && !recentes(n)
        ? { ...n, status: 'rascunho' as const } : n),
    ...[...cloudNotes.values()].filter(n => !drafts.has(n.id)),
  ];
  retired.notasPedido = local.notasPedido.filter(n => n.cooperativaId === coopId &&
    !drafts.has(n.id) && JSON.stringify(n) !== JSON.stringify(cloudNotes.get(n.id)));
  // Only explicitly supplied complete collections; omitted domains never mean empty.
  for (const key of ['fichaCorrida', 'valoresAvulsosReceber', 'ajustesFichaMes'] as const) {
    if (!Array.isArray(cloud[key])) continue;
    const rows = cloud[key] as Array<{ id: string; cooperativaId: string }>;
    const locals = local[key] as Array<{ id: string; cooperativaId: string; updatedAt?: string; createdAt?: string; notaPedidoId?: string }>;
    const keep = locals.filter(r => r.cooperativaId === coopId &&
      recentes(r));
    const keepIds = new Set(keep.map(r => r.id));
    const cloudById = new Map(rows.map(r => [r.id, r]));
    retired[key] = locals.filter(r => r.cooperativaId === coopId && !keepIds.has(r.id) &&
      JSON.stringify(r) !== JSON.stringify(cloudById.get(r.id)));
    (next[key] as unknown[]) = [
      ...locals.filter(r => r.cooperativaId !== coopId), ...keep,
      ...rows.filter(r => !keepIds.has(r.id)).map(r => ({ ...r, cooperativaId: coopId })),
    ];
  }
  return { data: next, retired };
}
