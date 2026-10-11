import type { AppData, FichaCorrida } from "@/types";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  pagamentoCooperadoPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";

function fichasDoCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId: string
): FichaCorrida[] {
  return (data.fichaCorrida ?? []).filter((f) => {
    if (f.cooperativaId !== cooperativaId) return false;
    return fichaPertenceCooperado(data, f, cooperadoId, cooperativaId);
  });
}

/** Cooperado já tem algo local para exibir enquanto a nuvem termina de baixar. */
export function cooperadoTemDadosFinanceirosMinimos(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const temNotas = (data.notasPedido ?? []).some((n) =>
    notaPertenceCooperado(data, n, canonico, cooperativaId)
  );
  if (temNotas) return true;
  const temPagamentos = (data.pagamentosCooperado ?? []).some((p) =>
    pagamentoCooperadoPertenceCooperado(data, p, canonico, cooperativaId)
  );
  if (temPagamentos) return true;
  if (fichasDoCooperado(data, cooperativaId, canonico).length > 0) return true;
  return (data.arquivosMensais ?? []).some(
    (a) => a.cooperadoId === canonico && a.cooperativaId === cooperativaId
  );
}
