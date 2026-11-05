import type { InicioCardMotorSnapshot } from "@/lib/cooperadoInicioCardPolicy";
import { fetchCooperadoFinanceiroCloudViews } from "@/lib/cooperado/server/cooperadoFinanceiroRemoto";

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
  const { finance, coopNome, card } = await fetchCooperadoFinanceiroCloudViews(
    cnpjDigits, cooperadoId, opts?.bypassCache
  );

  return {
    cooperadoId: finance.cooperadoId,
    cooperativaId: finance.cooperativaId,
    coopNome,
    fetchedAt: finance.fetchedAt,
    card,
  };
}
