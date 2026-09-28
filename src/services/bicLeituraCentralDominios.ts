/**
 * BIC LAB — mensalidades, avulsos e domínios adjacentes (somente leitura).
 */
import type { AppData } from "@/types";
import { getResumoMensalidadesCooperado } from "@/services/mensalidadeService";
import { totalValoresAvulsosPendentes } from "@/services/valoresAvulsosReceberService";

export function bicCentralGetResumoMensalidadesCooperado(
  ...args: Parameters<typeof getResumoMensalidadesCooperado>
): ReturnType<typeof getResumoMensalidadesCooperado> {
  return getResumoMensalidadesCooperado(...args);
}

export function bicCentralTotalValoresAvulsosPendentes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string | undefined,
  cooperativaId?: string
): number {
  return totalValoresAvulsosPendentes(data, cooperadoId, mesReferencia, cooperativaId);
}
