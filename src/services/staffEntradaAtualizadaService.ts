import type { User } from "@/types";
import { secureApiFetch } from "@/lib/security/clientSession";
import { getData, saveStaffEntradaCloud } from "@/services/dataStore";
import { reconciliarEntradaStaffCloud } from '@/lib/staff/staffEntradaCloudReconcile';
import { compactPersisted, decodePersisted } from '@/lib/staff/appDataPersistIo';
import { listPendingEntregaPublish } from '@/services/pendingEntregaPublishService';
import { listPendingDeliveryImages } from '@/services/offlineImageQueueService';
import { ensureCooperativaLocalForCnpj, fetchCooperadosFromCloud, mergeCloudCooperadosIntoData } from "@/services/cooperadoCloudService";
import { fetchNotasPedidoFromCloud, mergeCloudNotasIntoData, resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
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

export async function atualizarEntradaStaff(user: Omit<User, "password">, ativa: () => boolean): Promise<void> {
  const startedAt = Date.now();
  const current = getData();
  const cnpj = await resolveCooperativaCnpj(current, resolveGestaoCooperativaId(user, current), user);
  if (!cnpj || !ativa()) throw new Error("Não foi possível confirmar a cooperativa.");
  const coopId = await ensureCooperativaLocalForCnpj(cnpj);
  if (!coopId || !ativa()) throw new Error("Não foi possível confirmar a cooperativa.");
  const [cadastros, entregas, response] = await Promise.all([
    lerEntradaStaffComRetry("os cooperados", () => fetchCooperadosFromCloud(cnpj), (r) => r.ok, ativa),
    lerEntradaStaffComRetry("as entregas", () => fetchNotasPedidoFromCloud(cnpj, { forceFull: true, repairFila: false, confirmarCompleta: true }), (r) => r.ok && !r.delta, ativa),
    lerEntradaStaffComRetry("o financeiro e os contratos", async () => {
      const res = await secureApiFetch(`/api/cooperativa-sync?cnpj=${cnpj}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error("Consulta indisponível");
      return await res.json() as { configured?: boolean; contratos?: ContratosSyncPayload | null; operacional?: OperacionalSyncPayload | null };
    }, (r) => Boolean(r.configured && r.operacional &&
      Array.isArray(r.operacional.fichaCorrida) && Array.isArray(r.operacional.pagamentosCooperado)), ativa),
  ]);
  if (!ativa()) throw new Error("Entrada cancelada.");
  const bundle = response;
  if (!bundle.configured || !bundle.operacional || !ativa()) throw new Error("A base financeira atual ainda não está disponível.");
  const contratos: ContratosSyncPayload = bundle.contratos ?? { updatedAt: bundle.operacional.updatedAt, instituicoes: [], produtosInstituicao: [] };
  // Só aplica a base após todas as leituras terem sido confirmadas. Nenhum push na entrada.
  const local = getData();
  let next = mergeCloudCooperadosIntoData(local, cadastros.cooperados, cnpj, coopId);
  next = mergeOperacionalIntoData(next, bundle.operacional, coopId, cadastros.cooperados, undefined, { forAuthoritativeCreditBase: true });
  next = mergeCloudNotasIntoData(next, entregas.notas, cnpj, { pruneStaleConferidas: true });
  next = mergeContratosIntoData(next, contratos, coopId);
  if (!ativa()) throw new Error("Entrada cancelada.");
  // IndexedDB failure must not silently discard a queued delivery.
  const images = await listPendingDeliveryImages();
  const pendingIds = new Set([
    ...images.filter(r => r.cooperativaId === coopId).map(r => r.notaPedidoId),
    ...listPendingEntregaPublish({ cnpj }).map(r => r.nota.id),
  ]);
  if (!ativa()) throw new Error("Entrada cancelada.");
  const reconciled = reconciliarEntradaStaffCloud(getData(), next, bundle.operacional, entregas.notas, coopId, startedAt, pendingIds);
  // Keep retired device-only copies recoverable; never upload them automatically.
  if (Object.values(reconciled.retired).some(rows => rows.length)) {
    const key = `hb-staff-entrada-retired:${cnpj}`;
    const previous = JSON.parse(decodePersisted(localStorage.getItem(key)) ?? '{}') as Record<string, Array<{ id: string }>>;
    for (const [domain, rows] of Object.entries(reconciled.retired)) {
      previous[domain] = [...new Map([...(previous[domain] ?? []), ...rows as Array<{ id: string }>].map(r => [r.id, r])).values()];
    }
    localStorage.setItem(key, compactPersisted(JSON.stringify(previous)));
  }
  resetResponsavelPainelIndexCache();
  const saved = saveStaffEntradaCloud(reconciled.data, cnpj);
  if (!saved.ok) throw new Error(saved.error);
  registrarCatalogoCloudLeitura(coopId, contratos);
  resetResponsavelPainelIndexCache();
}
