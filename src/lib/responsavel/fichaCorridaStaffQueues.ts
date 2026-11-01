import type { AppData, Cooperado, PagamentoCooperadoRegistro } from "@/types";
import { listCooperadosComFichaNoMes } from "@/services/cooperadoCloudService";
import { listCooperadosPagamentoPendenteResponsavel } from "@/services/responsavelPainelIndex";
import { listarPagamentosAguardandoAssinatura, listarPagamentosReciboAguardandoVerificacao } from "@/services/filaDoDiaService";

/** As filas coletivas pertencem somente à aba ativa do responsável. */
export function buildFichaCorridaStaffQueues(input: {
  active: boolean;
  isCooperado: boolean;
  data: AppData | null;
  cooperativaId?: string;
  mes: string;
}) {
  const empty = {
    cooperadosComFicha: [] as Cooperado[],
    cooperadosParaPagar: [] as Cooperado[],
    pagamentosAguardandoAssinatura: [] as PagamentoCooperadoRegistro[],
    pagamentosAguardandoVerificacao: [] as PagamentoCooperadoRegistro[],
  };
  if (!input.active || input.isCooperado || !input.data || !input.cooperativaId) return empty;
  const { data, cooperativaId, mes } = input;
  return {
    cooperadosComFicha: listCooperadosComFichaNoMes(data, cooperativaId, mes),
    cooperadosParaPagar: listCooperadosPagamentoPendenteResponsavel(data, cooperativaId),
    pagamentosAguardandoAssinatura: listarPagamentosAguardandoAssinatura(data, cooperativaId),
    pagamentosAguardandoVerificacao: listarPagamentosReciboAguardandoVerificacao(data, cooperativaId),
  };
}
