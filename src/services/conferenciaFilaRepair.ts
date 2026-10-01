import type { AppData, NotaPedido } from "@/types";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import {
  isNotaNaFilaConferenciaResponsavel,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";

/** Corrige entregas “fantasma” (em análise + conferidaPor) e devolve quantas foram ajustadas. */
export function repararNotasPedidoFilaConferencia(
  data: AppData,
  cooperativaId?: string
): { data: AppData; repaired: number; notasCorrigidas: NotaPedido[] } {
  let repaired = 0;
  const notasCorrigidas: NotaPedido[] = [];
  const notasPedido = data.notasPedido.map((n) => {
    if (cooperativaId && !notaPertenceCooperativa(data, n, cooperativaId)) return n;
    if (!isNotaNaFilaConferenciaResponsavel(n.status)) return n;
    const fixed = sanitizarNotaParaFilaConferencia(n);
    if (fixed === n) return n;
    repaired += 1;
    notasCorrigidas.push(fixed);
    return fixed;
  });
  if (repaired === 0) return { data, repaired: 0, notasCorrigidas: [] };
  return { data: { ...data, notasPedido }, repaired, notasCorrigidas };
}
