import type { AppData, NotaPedido } from "@/types";
import {
  getNotasConferenciaDecididasLocalmente,
  reconciliarNotasConferenciaDecididasLocalmente,
} from "@/lib/conferencia/conferenciaFilaDecisaoLocal";
import { listNotasFilaConferenciaResponsavel } from "@/services/responsavelPainelIndex";
import { getChaveGrupoConferencia } from "@/utils/fotoEntrega";

/**
 * U3 — navegação FIFO na conferência usando índice cacheado da fila (evita scan em todas as notas).
 */
export function listarPendentesConferenciaResponsavel(
  data: AppData,
  coopId: string,
  chaveGrupo?: string,
  excludeId?: string,
  excludeIdsExtra?: ReadonlySet<string>
): NotaPedido[] {
  reconciliarNotasConferenciaDecididasLocalmente(data);
  const decididas = getNotasConferenciaDecididasLocalmente();
  let out = listNotasFilaConferenciaResponsavel(data, coopId);
  out = out.filter((n) => {
    if (excludeId && n.id === excludeId) return false;
    if (decididas.has(n.id)) return false;
    if (excludeIdsExtra?.has(n.id)) return false;
    return true;
  });
  if (chaveGrupo) {
    out = out.filter((n) => getChaveGrupoConferencia(n, data, coopId) === chaveGrupo);
  }
  return [...out].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
