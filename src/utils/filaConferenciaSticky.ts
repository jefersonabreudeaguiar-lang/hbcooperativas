import type { NotaPedido } from "@/types";
import type { AppData } from "@/types";
import { isNotaPedidoExcluida } from "@/services/notaPedidoService";
import {
  isNotaNaFilaConferenciaResponsavel,
  isNotaSaiuDaFilaConferencia,
  isNotaZombieNaFilaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";

export type FilaStickyRefs = {
  ids: Set<string>;
  snapshot: Map<string, NotaPedido>;
};

/** Mescla fila indexada + sticky local para evitar sumiço durante sync (só quando necessário). */
export function buildPendentesEstaveisConferencia(
  data: AppData,
  pendentesTodas: NotaPedido[],
  pendingDeleteIds: ReadonlySet<string>,
  coopId: string | undefined,
  sticky: FilaStickyRefs
): NotaPedido[] {
  const notasById = new Map<string, NotaPedido>();
  for (const n of data.notasPedido) notasById.set(n.id, n);

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
    if (atual && isNotaSaiuDaFilaConferencia(atual.status)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (atual) {
      const candAtual = sanitizarNotaParaFilaConferencia(atual);
      if (!notaElegivelParaFilaConferenciaResponsavel(candAtual)) {
        if (isNotaZombieNaFilaConferencia(atual)) {
          sticky.snapshot.set(id, candAtual);
        } else {
          sticky.ids.delete(id);
          sticky.snapshot.delete(id);
        }
        continue;
      }
    }
  }

  const byId = new Map<string, NotaPedido>();
  for (const n of pendentesTodas) byId.set(n.id, n);

  for (const id of sticky.ids) {
    if (coopId && isNotaPedidoExcluida(data, id, coopId)) continue;
    if (pendingDeleteIds.has(id)) continue;
    if (byId.has(id)) continue;
    const atual = notasById.get(id);
    if (!atual || (coopId && isNotaPedidoExcluida(data, id, coopId))) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (isNotaSaiuDaFilaConferencia(atual.status)) {
      sticky.ids.delete(id);
      sticky.snapshot.delete(id);
      continue;
    }
    if (isNotaNaFilaConferenciaResponsavel(atual.status)) {
      const candidata = sanitizarNotaParaFilaConferencia(atual);
      if (!notaElegivelParaFilaConferenciaResponsavel(candidata)) {
        sticky.ids.delete(id);
        sticky.snapshot.delete(id);
        continue;
      }
      byId.set(id, candidata);
      sticky.snapshot.set(id, candidata);
    }
  }

  return Array.from(byId.values())
    .filter((n) => {
      const live = notasById.get(n.id) ?? n;
      const candidata = sanitizarNotaParaFilaConferencia(live);
      return notaElegivelParaFilaConferenciaResponsavel(candidata);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
