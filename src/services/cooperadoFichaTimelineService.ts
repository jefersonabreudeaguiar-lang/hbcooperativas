/**
 * Timeline unificada da ficha — meses, extrato em aberto e pendência alinhada ao BIC.
 */
import type { AppData } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  getResumoMesEntregasCooperado,
  listarMesesComPagamentoRegistradoCooperado,
  listarMesesEmAbertoPagamentoResponsavel,
  listarMesesPagosCooperado,
  listarResumosFotosCooperado,
  notaPendenteCooperado,
} from "@/services/cooperadoEntregasService";
import { listarFichasEmAbertoPagamento } from "@/services/notaPedidoService";
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
  const meses = listarMesesEmAbertoPagamentoResponsavel(data, cooperadoId, cooperativaId);
  return meses
    .map((mes) => {
      const base = getResumoMesEntregasCooperado(data, cooperadoId, mes, cooperativaId);
      const abertas = listarFichasEmAbertoPagamento(data, cooperadoId, mes, cooperativaId);
      const ids = new Set(abertas.map((f) => f.notaPedidoId));
      const notas = base.notas.filter(
        (n) => ids.has(n.id) || notaPendenteCooperado(n.status)
      );
      return {
        ...base,
        notas,
        quantidadeEntregas: notas.length,
        conferidas: notas.filter((n) => n.status === "conferida").length,
        pagas: notas.filter((n) => n.status === "pago").length,
      };
    })
    .filter((r) => r.notas.length > 0 || r.valorAReceber > 0.005);
}

/** Pendente de recebimento — mesmo agregado do Início / Quanto vou receber (BIC). */
export function valorPendenteRecebimentoFichaCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  return bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId).valor;
}
