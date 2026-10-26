import type { InicioCardMotorSnapshot } from "@/lib/cooperadoInicioCardPolicy";
import { bicCentralResolveInicioParaExibicao } from "@/services/bicLeituraCentralCooperado";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { buildJefersonRebuildCloudAppData } from "@/lib/cooperado/jefersonRebuild/server/buildJefersonRebuildCloudAppData";

export type JefersonRebuildInicioCardPayload = {
  cooperadoId: string;
  cooperativaId: string;
  coopNome: string | null;
  fetchedAt: string;
  card: InicioCardMotorSnapshot;
};

export async function fetchJefersonRebuildInicioCardFromCloud(
  cnpjDigits: string,
  cooperadoId: string,
  opts?: { bypassCache?: boolean }
): Promise<JefersonRebuildInicioCardPayload | null> {
  const built = await buildJefersonRebuildCloudAppData(cnpjDigits, {
    bypassCache: opts?.bypassCache,
    scope: "inicio",
  });
  if (!built) return null;

  const { data, cooperativaId } = built;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const inicio = bicCentralResolveInicioParaExibicao(data, canon, cooperativaId, {
    apresentacaoConsolidada: true,
  });
  const coopNome = data.cooperativas.find((c) => c.id === cooperativaId)?.nome ?? null;

  const card: InicioCardMotorSnapshot = {
    mesLabel: inicio.mesLabel,
    valor: inicio.valor,
    valorRecibo: inicio.valorRecibo,
    aguardandoAssinatura: inicio.aguardandoAssinatura,
  };

  return {
    cooperadoId: canon,
    cooperativaId,
    coopNome,
    fetchedAt: new Date().toISOString(),
    card,
  };
}
