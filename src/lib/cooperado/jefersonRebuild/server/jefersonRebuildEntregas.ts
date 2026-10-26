import type { AppData } from "@/types";
import {
  buildCooperadoPwaEntregasResumosSnapshot,
  type CooperadoPwaEntregasResumosSnapshot,
} from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { buildJefersonRebuildCloudAppData } from "@/lib/cooperado/jefersonRebuild/server/buildJefersonRebuildCloudAppData";
import { fichaPertenceCooperado } from "@/services/cooperadoCloudService";

export type JefersonRebuildEntregasAppDataLite = Pick<
  AppData,
  "instituicoes" | "cooperados" | "cooperativas" | "notasPedido" | "fichaCorrida"
>;

export type JefersonRebuildEntregasPayload = {
  cooperadoId: string;
  cooperativaId: string;
  coopNome: string | null;
  fetchedAt: string;
  snapshot: CooperadoPwaEntregasResumosSnapshot;
  dataLite: JefersonRebuildEntregasAppDataLite;
};

function buildDataLite(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): JefersonRebuildEntregasAppDataLite {
  const notaIds = new Set(
    data.notasPedido.filter((n) => n.cooperadoId === cooperadoId).map((n) => n.id)
  );
  return {
    instituicoes: data.instituicoes,
    cooperados: data.cooperados.filter(
      (c) => c.id === cooperadoId || c.cooperativaId === cooperativaId
    ),
    cooperativas: data.cooperativas.filter((c) => c.id === cooperativaId),
    notasPedido: data.notasPedido.filter((n) => n.cooperadoId === cooperadoId),
    fichaCorrida: data.fichaCorrida.filter((f) =>
      fichaPertenceCooperado(data, f, cooperadoId) && (notaIds.has(f.notaPedidoId) || !f.notaPedidoId)
    ),
  };
}

export async function fetchJefersonRebuildEntregasFromCloud(
  cnpjDigits: string,
  cooperadoId: string,
  opts?: { bypassCache?: boolean }
): Promise<JefersonRebuildEntregasPayload | null> {
  const built = await buildJefersonRebuildCloudAppData(cnpjDigits, {
    bypassCache: opts?.bypassCache,
    scope: "full",
  });
  if (!built) return null;

  const { data, cooperativaId } = built;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const snapshot = buildCooperadoPwaEntregasResumosSnapshot(data, canon, cooperativaId);
  const coopNome = data.cooperativas.find((c) => c.id === cooperativaId)?.nome ?? null;
  const dataLite = buildDataLite(data, canon, cooperativaId);

  return {
    cooperadoId: canon,
    cooperativaId,
    coopNome,
    fetchedAt: new Date().toISOString(),
    snapshot,
    dataLite,
  };
}
