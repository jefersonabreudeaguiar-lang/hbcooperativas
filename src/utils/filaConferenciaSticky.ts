import type { NotaPedido } from "@/types";
import type { AppData } from "@/types";
import { isNotaPedidoExcluida } from "@/services/notaPedidoService";
import {
  isNotaNaFilaConferenciaResponsavel,
  isNotaSaiuDaFilaConferencia,
  isNotaZombieNaFilaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
  notaLancadaNaFichaCorrida,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";

export type FilaStickyRefs = {
  ids: Set<string>;
  snapshot: Map<string, NotaPedido>;
};

function notaAindaNaFilaConferir(nota: NotaPedido): boolean {
  const candidata = sanitizarNotaParaFilaConferencia(nota);
  return (
    notaElegivelParaFilaConferenciaResponsavel(candidata) || isNotaZombieNaFilaConferencia(nota)
  );
}

function notaNaoVoltaAFilaAposLancamento(
  evidencia: Pick<AppData, "notasPedido" | "fichaCorrida"> | null | undefined,
  notaId: string
): boolean {
  if (!evidencia || !notaId) return false;
  if (notaLancadaNaFichaCorrida(evidencia.fichaCorrida, notaId)) return true;
  const live = (evidencia.notasPedido ?? []).find((n) => n.id === notaId);
  return Boolean(live && isNotaSaiuDaFilaConferencia(live.status));
}

/**
 * Junta a fila ao vivo com o lastro. Nota que só sumiu do snapshot
 * (sync pobre) permanece até lançamento / rejeição / exclusão.
 * Lastro não reabre foto já lançada na ficha.
 */
export function fundirFilaConferirComLastro(
  live: NotaPedido[],
  lastro: NotaPedido[] | null | undefined,
  evidencia?: Pick<AppData, "notasPedido" | "fichaCorrida"> | null
): NotaPedido[] {
  if (!lastro?.length) return live;
  const byId = new Map<string, NotaPedido>();
  for (const n of live) {
    if (notaNaoVoltaAFilaAposLancamento(evidencia, n.id)) continue;
    byId.set(n.id, n);
  }
  for (const n of lastro) {
    if (!n?.id || byId.has(n.id)) continue;
    if (notaNaoVoltaAFilaAposLancamento(evidencia, n.id)) continue;
    if (isNotaSaiuDaFilaConferencia(n.status)) continue;
    if (!notaAindaNaFilaConferir(n)) continue;
    byId.set(n.id, sanitizarNotaParaFilaConferencia(n));
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Mescla fila indexada + sticky local. Snapshot some ≠ lançada na ficha. */
export function buildPendentesEstaveisConferencia(
  data: AppData,
  pendentesTodas: NotaPedido[],
  pendingDeleteIds: ReadonlySet<string>,
  coopId: string | undefined,
  sticky: FilaStickyRefs
): NotaPedido[] {
  const notasById = new Map<string, NotaPedido>();
  for (const n of data.notasPedido ?? []) notasById.set(n.id, n);

  for (const id of [...sticky.ids]) {
    if (coopId && isNotaPedidoExcluida(data, id, coopId)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (pendingDeleteIds.has(id)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    const atual = notasById.get(id);
    if (notaLancadaNaFichaCorrida(data.fichaCorrida, id) || (atual && isNotaSaiuDaFilaConferencia(atual.status))) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (atual && !notaAindaNaFilaConferir(atual) && !isNotaNaFilaConferenciaResponsavel(atual.status)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
    }
  }

  const byId = new Map<string, NotaPedido>();
  for (const n of pendentesTodas) {
    if (notaLancadaNaFichaCorrida(data.fichaCorrida, n.id)) continue;
    byId.set(n.id, notasById.get(n.id) ?? n);
  }

  for (const id of sticky.ids) {
    if (coopId && isNotaPedidoExcluida(data, id, coopId)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (pendingDeleteIds.has(id)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (byId.has(id)) continue;
    const atual = notasById.get(id);
    if (notaLancadaNaFichaCorrida(data.fichaCorrida, id) || (atual && isNotaSaiuDaFilaConferencia(atual.status))) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    const fonte = atual ?? sticky.snapshot.get(id);
    if (!fonte) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (!notaAindaNaFilaConferir(fonte)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    const candidata = sanitizarNotaParaFilaConferencia(fonte);
    byId.set(id, candidata);
    sticky.snapshot.set(id, candidata);
  }

  return Array.from(byId.values())
    .filter((n) => {
      if (notaLancadaNaFichaCorrida(data.fichaCorrida, n.id)) return false;
      const live = notasById.get(n.id);
      if (live && isNotaSaiuDaFilaConferencia(live.status)) return false;
      const fonte = live ?? n;
      return notaAindaNaFilaConferir(fonte);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Badge não cai a zero se a última lista visível ainda tinha notas (sync incompleto). */
export function lastroContagemFila(live: number, lastGood: number): number {
  if (live === 0 && lastGood > 0) return lastGood;
  return live;
}
