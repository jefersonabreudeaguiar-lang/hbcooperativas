/**
 * Timeline unificada da ficha — meses, extrato em aberto e pendência alinhada ao BIC.
 */
import type { AppData } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  filtrarResumosMesesNaoQuitados,
  listarMesesComPagamentoRegistradoCooperado,
  listarMesesPagosCooperado,
  listarResumosFotosCooperado,
} from "@/services/cooperadoEntregasService";
import {
  bicCentralListarResumosMensaisEntregas,
  bicCentralValorAReceberAgregado,
} from "@/services/bicLeituraCentralCooperado";

/** Meses com extrato, pagamento ou fotos — ordem decrescente. */
export function listarMesesTimelineFichaCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const meses = new Set<string>();
  for (const r of bicCentralListarResumosMensaisEntregas(data, cooperadoId, cooperativaId)) {
    meses.add(r.mesReferencia);
  }
  for (const m of listarMesesPagosCooperado(data, cooperadoId, cooperativaId)) {
    meses.add(m);
  }
  for (const m of listarMesesComPagamentoRegistradoCooperado(data, cooperadoId, cooperativaId)) {
    meses.add(m);
  }
  for (const r of listarResumosFotosCooperado(data, cooperadoId, cooperativaId)) {
    meses.add(r.mesReferencia);
  }
  return [...meses].sort((a, b) => b.localeCompare(a));
}

/** Resumos mensais em aberto (BIC + filtro quitado). */
export function listarResumosFichaEmAbertoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  return filtrarResumosMesesNaoQuitados(
    data,
    cooperadoId,
    bicCentralListarResumosMensaisEntregas(data, cooperadoId, cooperativaId)
  );
}

/** Pendente de recebimento — mesmo agregado do Início / Quanto vou receber (BIC). */
export function valorPendenteRecebimentoFichaCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  return bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId).valor;
}
