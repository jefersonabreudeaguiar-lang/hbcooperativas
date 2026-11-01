import type { User } from "@/types";
import { secureApiFetch } from "@/lib/security/clientSession";
import { getData, saveDataSafe } from "@/services/dataStore";
import { ensureCooperativaLocalForCnpj, fetchCooperadosFromCloud, mergeCloudCooperadosIntoData } from "@/services/cooperadoCloudService";
import { fetchNotasPedidoFromCloud, mergeCloudNotasIntoData, resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { registrarCatalogoCloudLeitura } from "@/lib/staff/staffCatalogoCloudLeitura";
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { resolveGestaoCooperativaId } from "@/utils/cooperativa";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";

export async function atualizarEntradaStaff(user: Omit<User, "password">, ativa: () => boolean): Promise<void> {
  const current = getData();
  const cnpj = await resolveCooperativaCnpj(current, resolveGestaoCooperativaId(user, current), user);
  if (!cnpj || !ativa()) throw new Error("Não foi possível confirmar a cooperativa.");
  const coopId = await ensureCooperativaLocalForCnpj(cnpj);
  if (!coopId || !ativa()) throw new Error("Não foi possível confirmar a cooperativa.");
  const [cadastros, entregas, response] = await Promise.all([
    fetchCooperadosFromCloud(cnpj),
    fetchNotasPedidoFromCloud(cnpj, { forceFull: true }),
    secureApiFetch(`/api/cooperativa-sync?cnpj=${cnpj}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) }),
  ]);
  if (!ativa()) throw new Error("Entrada cancelada.");
  if (!cadastros.ok || !entregas.ok || !response.ok) throw new Error("Não foi possível consultar os dados atuais na nuvem.");
  const bundle = await response.json() as { configured?: boolean; contratos?: ContratosSyncPayload | null; operacional?: OperacionalSyncPayload | null };
  if (!bundle.configured || !bundle.operacional || !ativa()) throw new Error("A base financeira atual ainda não está disponível.");
  const contratos: ContratosSyncPayload = bundle.contratos ?? { updatedAt: bundle.operacional.updatedAt, instituicoes: [], produtosInstituicao: [] };
  // Só aplica a base após todas as leituras terem sido confirmadas. Nenhum push na entrada.
  let next = mergeCloudCooperadosIntoData(getData(), cadastros.cooperados, cnpj, coopId);
  next = mergeOperacionalIntoData(next, bundle.operacional, coopId, cadastros.cooperados);
  next = mergeCloudNotasIntoData(next, entregas.notas, cnpj, { pruneStaleConferidas: true });
  next = mergeContratosIntoData(next, contratos, coopId);
  if (!ativa()) throw new Error("Entrada cancelada.");
  const saved = saveDataSafe(next);
  if (!saved.ok) throw new Error("Não foi possível preparar os dados atuais neste aparelho.");
  registrarCatalogoCloudLeitura(coopId, contratos);
  resetResponsavelPainelIndexCache();
}
