import type { User } from "@/types";
import { secureApiFetch } from "@/lib/security/clientSession";
import { getData, saveStaffEntradaCloud, staffEntradaEscritaOcupada } from "@/services/dataStore";
import { iniciarStaffEntrada, aguardarEscritasStaff } from '@/lib/staff/staffEntradaCoordination';
import { conferirEntradaStaffExistente, registrarEntradaStaffConferida } from '@/lib/staff/staffEntradaVerifiedCache';
import { fetchCooperativaCloudRevision } from '@/services/cooperativaSyncRevisionService';
import { reconciliarEntradaStaffCloud } from '@/lib/staff/staffEntradaCloudReconcile';
import { guardarCopiasEntradaStaff } from '@/lib/staff/staffEntradaRecovery';
import { listPendingEntregaPublish } from '@/services/pendingEntregaPublishService';
import { listPendingDeliveryImages } from '@/services/offlineImageQueueService';
import { ensureCooperativaLocalForCnpj, fetchCooperadosFromCloud, mergeCloudCooperadosIntoData } from "@/services/cooperadoCloudService";
import { fetchNotasPedidoFromCloud, mergeCloudNotasIntoData, resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { registrarCatalogoCloudLeitura } from "@/lib/staff/staffCatalogoCloudLeitura";
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { resolveGestaoCooperativaId } from "@/utils/cooperativa";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { aplicarSnapshotContadorCloud } from '@/lib/staff/contadorDadosCooperativa';
import type { CooperativaCloudRevision } from '@/lib/performance/cooperadoEventDrivenSync';

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

export async function atualizarEntradaStaff(user: Omit<User, "password">, ativa: () => boolean): Promise<CooperativaCloudRevision> {
  const release = iniciarStaffEntrada();
  try {
    await aguardarEscritasStaff(staffEntradaEscritaOcupada, ativa);
    const owner = user.cooperativaCnpj ? `${user.id}:${user.role}:${user.cooperativaCnpj}:803` : '';
    let store: Storage | null = null;
    try { if (typeof window !== 'undefined') store = window.localStorage; } catch { /* optional accelerator */ }
    const existing = await conferirEntradaStaffExistente(owner, getData, async () => {
      const [revision, cadastros] = await Promise.all([fetchCooperativaCloudRevision(user.cooperativaCnpj!), fetchCooperadosFromCloud(user.cooperativaCnpj!)]);
      if (!revision || !cadastros.ok) return null;
      const current = getData(), coopId = resolveGestaoCooperativaId(user, current);
      if (!coopId) return null;
      const merged = mergeCloudCooperadosIntoData(current, cadastros.cooperados, user.cooperativaCnpj!, coopId);
      return JSON.stringify(merged.cooperados) === JSON.stringify(current.cooperados) ? revision : null;
    }, store);
    if (!ativa()) throw Error('Entrada cancelada.');
    if (existing) return existing;
    const revision = await atualizarEntradaStaffLivre(user, ativa);
    await registrarEntradaStaffConferida(owner, getData(), revision, store);
    return revision;
  } finally { release(); }
}

async function atualizarEntradaStaffLivre(user: Omit<User, "password">, ativa: () => boolean): Promise<CooperativaCloudRevision> {
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
  await aguardarEscritasStaff(staffEntradaEscritaOcupada, ativa, 10_000);
  const reconciled = reconciliarEntradaStaffCloud(getData(), next, bundle.operacional, entregas.notas, coopId, startedAt, pendingIds);
  if (user.role === 'contador') {
    // Accounting must inspect the saved ledger, not entries synthesized by the UI merge.
    reconciled.data = aplicarSnapshotContadorCloud(reconciled.data, bundle.operacional, coopId);
  }
  // Keep retired device-only copies recoverable; never upload them automatically.
  await guardarCopiasEntradaStaff(cnpj, reconciled.retired);
  if (!ativa()) throw new Error("Entrada cancelada.");
  resetResponsavelPainelIndexCache();
  const saved = saveStaffEntradaCloud(reconciled.data, cnpj);
  if (!saved.ok) throw new Error(saved.error);
  registrarCatalogoCloudLeitura(coopId, contratos);
  resetResponsavelPainelIndexCache();
  return { operacionalUpdatedAt: bundle.operacional.updatedAt ?? null,
    operationalResetVersion: bundle.operacional.operationalResetVersion ?? 0,
    contratosUpdatedAt: bundle.contratos?.updatedAt ?? null, notasUpdatedAt: entregas.serverWatermark ?? null };
}
