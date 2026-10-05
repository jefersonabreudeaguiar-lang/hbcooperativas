import type { AppData, NotaPedido } from "@/types";
import { listNotasFilaConferenciaResponsavel } from "@/services/responsavelPainelIndex";
import { getChaveGrupoConferencia } from "@/utils/fotoEntrega";

/**
 * U3 — navegação FIFO na conferência usando índice cacheado da fila (evita scan em todas as notas).
 */
export function listarPendentesConferenciaResponsavel(
  data: AppData,
  coopId: string,
  chaveGrupo?: string,
  excludeId?: string
): NotaPedido[] {
  let out = listNotasFilaConferenciaResponsavel(data, coopId);
  if (excludeId) out = out.filter((n) => n.id !== excludeId);
  if (chaveGrupo) {
    out = out.filter((n) => getChaveGrupoConferencia(n, data, coopId) === chaveGrupo);
  }
  return [...out].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
