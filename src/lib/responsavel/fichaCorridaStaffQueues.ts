import type { AppData, Cooperado, PagamentoCooperadoRegistro } from "@/types";
import { listCooperadosComFichaNoMes, withCooperadoResolutionBatch } from "@/services/cooperadoCloudService";
import { listCooperadosPagamentoPendenteResponsavel } from "@/services/responsavelPainelIndex";
import { listarPagamentosAguardandoAssinatura, listarPagamentosReciboAguardandoVerificacao } from "@/services/filaDoDiaService";
import { getDataRevision } from "@/services/dataStore";

type StaffQueues = {
  cooperadosComFicha: Cooperado[];
  cooperadosParaPagar: Cooperado[];
  pagamentosAguardandoAssinatura: PagamentoCooperadoRegistro[];
  pagamentosAguardandoVerificacao: PagamentoCooperadoRegistro[];
};
const queueCache = new WeakMap<AppData, Map<string, { revision: number; value: StaffQueues }>>();

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
  const key = JSON.stringify([cooperativaId, mes]);
  const revision = getDataRevision();
  const cached = queueCache.get(data)?.get(key);
  if (cached?.revision === revision) return cached.value;
  const value = withCooperadoResolutionBatch(() => ({
    cooperadosComFicha: listCooperadosComFichaNoMes(data, cooperativaId, mes),
    cooperadosParaPagar: listCooperadosPagamentoPendenteResponsavel(data, cooperativaId),
    pagamentosAguardandoAssinatura: listarPagamentosAguardandoAssinatura(data, cooperativaId),
    pagamentosAguardandoVerificacao: listarPagamentosReciboAguardandoVerificacao(data, cooperativaId),
  }));
  let entries = queueCache.get(data);
  if (!entries) { entries = new Map(); queueCache.set(data, entries); }
  entries.set(key, { revision, value });
  return value;
}
