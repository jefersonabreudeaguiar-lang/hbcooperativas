import type { AppData } from "@/types";
import { fichaPertenceCooperado, notaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";

const scopedCache = new WeakMap<AppData, Map<string, AppData>>();

/** Reduz a leitura ao dono da sessão antes de calcular valores; não altera o original. */
export function cooperadoFinanceiroScopedData(data: AppData, cooperadoId: string, cooperativaId: string): AppData {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  let cache = scopedCache.get(data);
  if (!cache) { cache = new Map(); scopedCache.set(data, cache); }
  const key = `${cooperativaId}:${canon}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pertence = (row: { cooperadoId: string; cooperativaId?: string }) =>
    (!row.cooperativaId || row.cooperativaId === cooperativaId) &&
    resolverCooperadoIdCanonico(data, row.cooperadoId, cooperativaId) === canon;
  const scoped = {
    ...data,
    fichaCorrida: data.fichaCorrida.filter((f) => (!f.cooperativaId || f.cooperativaId === cooperativaId) && fichaPertenceCooperado(data, f, canon, cooperativaId)),
    notasPedido: data.notasPedido.filter((n) => (!n.cooperativaId || n.cooperativaId === cooperativaId) && notaPertenceCooperado(data, n, canon, cooperativaId)),
    pagamentosCooperado: data.pagamentosCooperado.filter(pertence),
    arquivosMensais: data.arquivosMensais.filter(pertence),
    valoresAvulsosReceber: (data.valoresAvulsosReceber ?? []).filter(pertence),
    descontos: data.descontos.filter(pertence),
    mensalidades: data.mensalidades.filter(pertence),
  };
  cache.set(key, scoped);
  return scoped;
}
