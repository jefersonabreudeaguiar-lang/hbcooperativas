import type { AppData, User } from "@/types";
import { secureApiFetch } from "@/lib/security/clientSession";
import { refreshData, getDataOperationalTruth } from "@/services/dataStore";
import { ensureCooperativaLocalForCnpj, fetchCooperadosFromCloud, mergeCloudCooperadosIntoData } from "@/services/cooperadoCloudService";
import { fetchNotasPedidoFromCloud, mergeCloudNotasIntoData, resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData, persistStaffEntradaOperacionalSnapshot } from "@/services/cooperativaSyncCloudService";
import { registrarCatalogoCloudLeitura } from "@/lib/staff/staffCatalogoCloudLeitura";
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { resolveGestaoCooperativaId } from "@/utils/cooperativa";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";

export async function lerEntradaStaffComRetry<T>(nome: string, ler: () => Promise<T>, validar: (valor: T) => boolean, ativa: () => boolean): Promise<T> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (!ativa()) throw new Error("Entrada cancelada.");
    try {
      const valor = await ler();
      if (validar(valor)) return valor;
    } catch { /* Repete apenas a consulta que falhou. */ }
  }
  throw new Error("Não foi possível consultar " + nome + ". Toque em tentar novamente.");
}

export function prepararDadosLocaisEntradaStaff(): AppData {
  // First-paint last-good memory is not the durable editing copy. Read the scoped
  // file before any cloud lookup can overwrite a pending checkpoint/outbox.
  return refreshData();
}

export async function atualizarEntradaStaff(user: Omit<User, "password">, ativa: () => boolean): Promise<void> {
  const current = prepararDadosLocaisEntradaStaff();
  const cnpj = await resolveCooperativaCnpj(current, resolveGestaoCooperativaId(user, current), user);
  if (!cnpj || !ativa()) throw new Error("Não foi possível confirmar a cooperativa.");
  const coopId = await ensureCooperativaLocalForCnpj(cnpj);
  if (!coopId || !ativa()) throw new Error("Não foi possível confirmar a cooperativa.");
  const [cadastros, entregas, response] = await Promise.all([
    lerEntradaStaffComRetry("os cooperados", () => fetchCooperadosFromCloud(cnpj), (r) => r.ok, ativa),
    lerEntradaStaffComRetry("as entregas", () => fetchNotasPedidoFromCloud(cnpj, { forceFull: true, repairFila: false }), (r) => r.ok, ativa),
    lerEntradaStaffComRetry("o financeiro e os contratos", async () => {
      const res = await secureApiFetch(`/api/cooperativa-sync?cnpj=${cnpj}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error("Consulta indisponível");
      return await res.json() as { configured?: boolean; contratos?: ContratosSyncPayload | null; operacional?: OperacionalSyncPayload | null; operacionalRevision?: string | null; operacionalScope?: string };
    }, (r) => Boolean(r.configured && r.operacional), ativa),
  ]);
  if (!ativa()) throw new Error("Entrada cancelada.");
  const bundle = response;
  if (!bundle.configured || !bundle.operacional || !ativa()) throw new Error("A base financeira atual ainda não está disponível.");
  const contratos: ContratosSyncPayload = bundle.contratos ?? { updatedAt: bundle.operacional.updatedAt, instituicoes: [], produtosInstituicao: [] };
  // Só aplica a base após todas as leituras terem sido confirmadas. Nenhum push na entrada.
  const before = getDataOperationalTruth();
  let next = mergeCloudCooperadosIntoData(before, cadastros.cooperados, cnpj, coopId);
  next = mergeOperacionalIntoData(next, bundle.operacional, coopId, cadastros.cooperados);
  next = mergeCloudNotasIntoData(next, entregas.notas, cnpj, { pruneStaleConferidas: true });
  next = mergeContratosIntoData(next, contratos, coopId);
  if (!ativa()) throw new Error("Entrada cancelada.");
  await persistStaffEntradaOperacionalSnapshot(cnpj, coopId, {
    operacional: bundle.operacional, operacionalRevision: bundle.operacionalRevision, operacionalScope: bundle.operacionalScope,
  }, before, next, ativa);
  registrarCatalogoCloudLeitura(coopId, contratos);
  resetResponsavelPainelIndexCache();
}
