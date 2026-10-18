import type { AppData } from "@/types";
import { listarPagamentosConfirmadosQueCobremMes } from "@/services/notaPedidoService";

export const SITUACAO_ENTREGA_POS_PIX = "Entrega posterior ao último PIX";
export const SITUACAO_SEM_PIX_MES = "Sem PIX confirmado no mês";

/**
 * Só apresentação da Conferir. Não altera ficha, PIX nem caixa.
 * Só rotula quando todos os meses da linha têm a mesma evidência.
 */
export function classificarSituacaoEmAbertoConferir(
  data: AppData,
  coopId: string,
  cooperadoId: string,
  meses: string[]
): string {
  const alvos = meses.filter(Boolean);
  if (!cooperadoId || !alvos.length) return "";
  let comPix = 0;
  for (const mes of alvos) {
    if (listarPagamentosConfirmadosQueCobremMes(data, cooperadoId, mes, coopId).length > 0) {
      comPix += 1;
    }
  }
  if (comPix === alvos.length) return SITUACAO_ENTREGA_POS_PIX;
  if (comPix === 0) return SITUACAO_SEM_PIX_MES;
  return "";
}
