import type { AppData, Cooperativa, Cooperado, Instituicao, ProdutoInstituicao, Desconto, PrestacaoContasExcluida, NotaPedidoExcluida, InstituicaoExcluida, PagamentoCooperadoRegistro, Comunicado, ComunicadoExcluidoRef, LivroCaixaExcluidoRef, LivroCaixaLancamento, FichaCorrida, VotacaoPauta, VotacaoVoto, ParecerContabilMensal, FechamentoSnapshot } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { secureApiFetch } from "@/lib/security/clientSession";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { getData, saveDataSafe, runWithBatchedSaveAsync } from "@/services/dataStore";
import { syncCooperadosFromCloud, fetchCooperadosFromCloud, pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { syncNotasPedidoFromCloud, patchNotaPedidoInCloud } from "@/services/notaPedidoCloudService";
import { fetchCooperativaByCnpjFromCloud, mergeCooperativaIntoData } from "@/services/cooperativaCloudService";
import { mergeArquivosMensaisFromCloud, reconciliarFichaFromNotasConferidas, dedupeFichaCorridaPorNota, aplicarNotasPedidoExcluidas } from "@/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa, cooperadoMesTemPagamentoNaLista, type RegistroPagamentoResponsavelPatch } from "@/services/pagamentoIntegridadeService";
import { ensureComunicadosAudioUploaded } from "@/services/comunicadoAudioSync";
import { operacionalPushSeguro, precisaReparoFullSyncNotas, cooperadoFinanceiroDesatualizado, cooperadoFichaValoresDesalinhados, limparFichaObsoletaCooperado } from "@/services/fichaSyncGuard";
import { beginCloudSync, endCloudSync } from "@/services/cloudSyncProgress";
import { clearNotasSyncMeta, forceNextFullNotasSync } from "@/services/syncMetaService";
import { sincronizarMensalidadeCooperativa, mensalidadeVisivelNoDispositivo, normalizarMensalidadeCooperadoLocal, mesclarMensalidadesPayloadNuvem, prepararMensalidadesCloud, prepararMensalidadeCloud, reconciliarMensalidadesComCooperadosCloud, mensalidadeCloudEntraNoDispositivo, enriquecerMensalidadeCooperadoSnapshot } from "@/services/mensalidadeService";
import { aplicarPrestacoesContasExcluidas } from "@/services/prestacaoContasService";
import { mergeLivroCaixaControleAnualFromCloud } from "@/services/livroCaixaService";
import { aplicarInstituicoesExcluidas } from "@/services/instituicaoContratoService";
import {
  OPERATIONAL_RESET_VERSION,
  applyCloudOperationalResetIfNeeded,
  needsOperationalResetCloudPush,
  markOperationalResetCloudDone,
  markOperacionalCloudAuthoritative,
  clearOperacionalCloudAuthoritative,
  isOperacionalCloudAuthoritative,
  noteOperacionalCloudRestoreFromFetch,
  reapplyCloudOperationalSliceIfStale,
  clearOperacionalFinanceiroForCooperativa,
} from "@/services/operationalReset";
import { posProcessarFinanceiroLocal } from "@/services/operacionalLocalPostProcess";
import {
  enqueueOperacionalPush,
  isOperacionalPushSingleFlightEnabled,
} from "@/services/operacionalPushSingleFlight";
type WithUpdatedAt = { id: string; updatedAt?: string; createdAt?: string };

/** Evita POST operacional repetido na mesma sessão quando o payload não mudou. */
const lastOperacionalPushFingerprint = new Map<string, string>();

/** Somente testes H8.9.62 — serialização / erro na fila (sem rede). */
let pushOperacionalInternalTestEnterHook: ((ctx: { cnpj: string }) => Promise<void>) | null = null;

export function setPushOperacionalInternalTestEnterHookForTests(
  hook: typeof pushOperacionalInternalTestEnterHook
): void {
  pushOperacionalInternalTestEnterHook = hook;
}

export function clearOperacionalPushFingerprintForTests(cnpj: string, authoritative = false): void {
  clearOperacionalPushFingerprint(cnpj, authoritative);
}

export function operacionalPushCacheKey(cnpj: string, authoritative: boolean): string {
  return `${cnpj}:${authoritative ? "auth" : "merge"}`;
}

export function clearOperacionalPushFingerprint(cnpj: string, authoritative = false): void {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  lastOperacionalPushFingerprint.delete(operacionalPushCacheKey(digits, authoritative));
}

/** Nuvem publicou restore (fullReset) — aparelho só puxa; não recalcula ficha local nem sobrescreve a nuvem. */
export function cloudOperacionalRestoreAtivo(
  operacional?: Pick<OperacionalSyncPayload, "fullReset"> | null
): boolean {
  return operacional?.fullReset === true;
}

function finalizeOperacionalPullLocalState(
  data: AppData,
  operacional?: OperacionalSyncPayload | null,
  cnpj?: string
): AppData {
  return posProcessarFinanceiroLocal(data, cnpj);
}

/** Cooperado publica recibo assinado — não usa push operacional (restrição de gestão). */
export async function confirmarPagamentoCooperadoNaNuvem(
  cnpj: string,
  pagamento: PagamentoCooperadoRegistro
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || pagamento.status !== "confirmado") return false;
  try {
    const res = await secureApiFetch("/api/cooperativa-sync/confirmar-pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, pagamento }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Responsável publica pagamento registrado — contorna lock do POST operacional (fullReset). */
export async function registrarPagamentoCooperadoNaNuvem(
  cnpj: string,
  patch: RegistroPagamentoResponsavelPatch
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };
  try {
    const res = await secureApiFetch("/api/cooperativa-sync/registrar-pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, ...patch }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: json.error ?? "Não foi possível salvar o pagamento na nuvem.",
        code: json.code,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão. Pagamento ficou só neste aparelho." };
  }
}

function fingerprintOperacionalPayload(payload: OperacionalSyncPayload): string {
  const { updatedAt: _ignored, ...rest } = payload;
  return JSON.stringify(rest);
}

/** Pagamento registrado localmente ainda não publicado — não aplicar merge defensivo que aborta o push. */
function operacionalTemPagamentoAguardandoSoLocal(
  data: AppData,
  coopId: string,
  cloud: OperacionalSyncPayload
): boolean {
  const cloudIds = new Set((cloud.pagamentosCooperado ?? []).map((p) => p.id));
  return data.pagamentosCooperado.some(
    (p) =>
      p.cooperativaId === coopId &&
      (p.status === "aguardando_confirmacao" || p.status === "confirmado") &&
      !cloudIds.has(p.id)
  );
}

function itemTime(item: WithUpdatedAt): number {
  const t = item.updatedAt ?? item.createdAt;
  return t ? new Date(t).getTime() : 0;
}

/** Mescla listas pelo id, mantendo o registro mais recente. */
export function mergeArrayByNewer<T extends WithUpdatedAt>(local: T[], cloud: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    if (!cur || itemTime(item) >= itemTime(cur)) map.set(item.id, item);
  }
  return [...map.values()];
}

/** Nuvem é base; local ganha se for mais recente ou empatar (ação do responsável não reverte). */
function mergeOperacionalArrayFromCloud<T extends WithUpdatedAt>(
  localCoop: T[],
  cloudItems: T[],
  _cloudUpdatedAt: string | undefined
): T[] {
  const map = new Map<string, T>();

  for (const item of cloudItems) map.set(item.id, item);

  for (const item of localCoop) {
    const cloudItem = map.get(item.id);
    if (cloudItem) {
      if (itemTime(item) >= itemTime(cloudItem)) map.set(item.id, item);
      continue;
    }
    map.set(item.id, item);
  }

  return [...map.values()];
}

/** Ficha paga localmente não volta para pendente por snapshot desatualizado na nuvem. */
function mergeFichaCorridaFromCloud(
  localCoop: FichaCorrida[],
  cloudItems: FichaCorrida[],
  pagamentosCooperado: PagamentoCooperadoRegistro[] = []
): FichaCorrida[] {
  const map = new Map<string, FichaCorrida>();

  const fichaPagoLegitima = (f: FichaCorrida): boolean =>
    f.status !== "pago" ||
    cooperadoMesTemPagamentoNaLista(pagamentosCooperado, f.cooperadoId, f.mesReferencia);

  const normalizarFicha = (f: FichaCorrida): FichaCorrida => {
    if (fichaPagoLegitima(f)) return f;
    return { ...f, status: "pendente" as const };
  };

  for (const item of cloudItems) map.set(item.id, normalizarFicha(item));
  for (const local of localCoop) {
    const cloud = map.get(local.id);
    if (!cloud) {
      map.set(local.id, normalizarFicha(local));
      continue;
    }
    if (local.status === "pago" && cloud.status === "pendente") {
      const temPagamento = cooperadoMesTemPagamentoNaLista(
        pagamentosCooperado,
        local.cooperadoId,
        local.mesReferencia
      );
      map.set(local.id, temPagamento ? local : cloud);
      continue;
    }
    if (cloud.status === "pago" && local.status === "pendente") {
      const temPagamento = cooperadoMesTemPagamentoNaLista(
        pagamentosCooperado,
        local.cooperadoId,
        local.mesReferencia
      );
      map.set(local.id, temPagamento ? cloud : local);
      continue;
    }
    const chosen = itemTime(local) >= itemTime(cloud) ? local : cloud;
    map.set(local.id, normalizarFicha(chosen));
  }
  return [...map.values()];
}

function snapshotCapturedAt(snapshot: FechamentoSnapshot): number {
  return new Date(snapshot.capturedAt).getTime();
}

/** Um parecer por mês — vence o registro com updatedAt mais recente. */
function mergePareceresContabeisFromCloud(
  localCoop: ParecerContabilMensal[],
  cloudItems: ParecerContabilMensal[]
): ParecerContabilMensal[] {
  const byMes = new Map<string, ParecerContabilMensal>();
  for (const item of cloudItems) {
    const cur = byMes.get(item.mesReferencia);
    if (!cur || itemTime(item) >= itemTime(cur)) byMes.set(item.mesReferencia, item);
  }
  for (const item of localCoop) {
    const cur = byMes.get(item.mesReferencia);
    if (!cur || itemTime(item) >= itemTime(cur)) byMes.set(item.mesReferencia, item);
  }
  return [...byMes.values()];
}

/** Snapshot imutável por mês — vence a captura mais recente. */
function mergeFechamentoSnapshotsFromCloud(
  localCoop: FechamentoSnapshot[],
  cloudItems: FechamentoSnapshot[]
): FechamentoSnapshot[] {
  const byMes = new Map<string, FechamentoSnapshot>();
  for (const item of cloudItems) {
    const cur = byMes.get(item.mesReferencia);
    if (!cur || snapshotCapturedAt(item) >= snapshotCapturedAt(cur)) byMes.set(item.mesReferencia, item);
  }
  for (const item of localCoop) {
    const cur = byMes.get(item.mesReferencia);
    if (!cur || snapshotCapturedAt(item) >= snapshotCapturedAt(cur)) byMes.set(item.mesReferencia, item);
  }
  return [...byMes.values()];
}

const PAGAMENTO_STATUS_RANK: Record<PagamentoCooperadoRegistro["status"], number> = {
  aguardando_confirmacao: 0,
  confirmado: 1,
};

/** Pagamento confirmado localmente não volta para aguardando assinatura na nuvem. */
function mergePagamentoCooperadoRecord(
  local: PagamentoCooperadoRegistro,
  cloud: PagamentoCooperadoRegistro
): PagamentoCooperadoRegistro {
  if (local.status === "confirmado" && cloud.status !== "confirmado") return local;
  if (cloud.status === "confirmado" && local.status !== "confirmado") return cloud;
  const localRank = PAGAMENTO_STATUS_RANK[local.status] ?? 0;
  const cloudRank = PAGAMENTO_STATUS_RANK[cloud.status] ?? 0;
  if (localRank > cloudRank) return local;
  if (cloudRank > localRank) return cloud;
  if (local.status === "confirmado" && cloud.status === "confirmado") {
    if (local.reciboHtml && !cloud.reciboHtml) return local;
    if (cloud.reciboHtml && !local.reciboHtml) return cloud;
    const localPago = new Date(local.pagoEm).getTime();
    const cloudPago = new Date(cloud.pagoEm).getTime();
    if (Number.isFinite(localPago) && Number.isFinite(cloudPago) && localPago !== cloudPago) {
      return localPago <= cloudPago ? local : cloud;
    }
    if (
      local.valorLiquido !== cloud.valorLiquido ||
      local.valorBruto !== cloud.valorBruto ||
      local.descontoCooperativa !== cloud.descontoCooperativa
    ) {
      return local;
    }
  }
  return itemTime(local) >= itemTime(cloud) ? local : cloud;
}

export function mergePagamentosCooperadoFromCloud(
  localCoop: PagamentoCooperadoRegistro[],
  cloudItems: PagamentoCooperadoRegistro[]
): PagamentoCooperadoRegistro[] {
  const map = new Map<string, PagamentoCooperadoRegistro>();
  for (const item of cloudItems) map.set(item.id, item);
  for (const local of localCoop) {
    const cloud = map.get(local.id);
    if (!cloud) {
      map.set(local.id, local);
      continue;
    }
    map.set(local.id, mergePagamentoCooperadoRecord(local, cloud));
  }
  return [...map.values()];
}

function comunicadosExcluidosIdsCoop(data: AppData, coopId: string): Set<string> {
  return new Set(
    (data.comunicadosExcluidos ?? [])
      .filter((e) => !e.cooperativaId || e.cooperativaId === coopId)
      .map((e) => e.id)
  );
}

/** Remove da lista local recados já excluídos (evita voltar após sync com nuvem desatualizada). */
export function purgeComunicadosMarcadosExcluidos(data: AppData, coopId: string): AppData {
  const ids = comunicadosExcluidosIdsCoop(data, coopId);
  if (!ids.size) return data;
  return {
    ...data,
    comunicados: data.comunicados.filter((c) => !ids.has(c.id)),
  };
}

function mergeComunicadosExcluidosFromCloud(
  localCoop: ComunicadoExcluidoRef[],
  cloudItems: ComunicadoExcluidoRef[]
): ComunicadoExcluidoRef[] {
  const map = new Map<string, ComunicadoExcluidoRef>();
  for (const item of localCoop) map.set(item.id, item);
  for (const cloud of cloudItems) {
    const local = map.get(cloud.id);
    if (!local || new Date(cloud.excluidoEm).getTime() >= new Date(local.excluidoEm).getTime()) {
      map.set(cloud.id, cloud);
    }
  }
  return [...map.values()];
}

function mergeLivroCaixaExcluidosFromCloud(
  localCoop: LivroCaixaExcluidoRef[],
  cloudItems: LivroCaixaExcluidoRef[]
): LivroCaixaExcluidoRef[] {
  const map = new Map<string, LivroCaixaExcluidoRef>();
  for (const item of localCoop) map.set(item.id, item);
  for (const cloud of cloudItems) {
    const local = map.get(cloud.id);
    if (!local || new Date(cloud.excluidoEm).getTime() >= new Date(local.excluidoEm).getTime()) {
      map.set(cloud.id, cloud);
    }
  }
  return [...map.values()];
}

function mergeLivroCaixaFromCloud(
  localCoop: LivroCaixaLancamento[],
  cloudItems: LivroCaixaLancamento[],
  cloudSyncTime: string | undefined,
  excluidosIds: Set<string>
): LivroCaixaLancamento[] {
  const cloudFiltered = cloudItems.filter((l) => !excluidosIds.has(l.id));
  const localFiltered = localCoop.filter((l) => !excluidosIds.has(l.id));
  return mergeOperacionalArrayFromCloud(localFiltered, cloudFiltered, cloudSyncTime);
}

/** Comunicado desativado localmente (ex.: após assinar recibo) permanece oculto. */
function mergeComunicadosFromCloud(
  localCoop: Comunicado[],
  cloudItems: Comunicado[],
  excluidosIds: Set<string>
): Comunicado[] {
  const map = new Map<string, Comunicado>();
  for (const item of cloudItems) {
    if (!excluidosIds.has(item.id)) map.set(item.id, item);
  }
  for (const local of localCoop) {
    if (excluidosIds.has(local.id)) continue;
    const cloud = map.get(local.id);
    if (!cloud) {
      /** Já publicado na nuvem e removido pelo responsável — não ressuscitar no cooperado. */
      if (local.muralPublicadoEm || local.audioStoragePath || local.audioNaNuvem) {
        continue;
      }
      map.set(local.id, local);
      continue;
    }
    if (local.ativo === false) {
      map.set(local.id, local);
      continue;
    }
    if (cloud.ativo === false) {
      map.set(local.id, cloud);
      continue;
    }
    const pick = itemTime(local) >= itemTime(cloud) ? local : cloud;
    const other = pick === local ? cloud : local;
    map.set(local.id, {
      ...pick,
      audioStoragePath: pick.audioStoragePath ?? other.audioStoragePath,
      audioNaNuvem: pick.audioNaNuvem ?? other.audioNaNuvem,
      audioDataUrl: pick.audioDataUrl ?? other.audioDataUrl,
      muralDuracao: pick.muralDuracao ?? other.muralDuracao,
      muralPublicadoEm: pick.muralPublicadoEm ?? other.muralPublicadoEm,
    });
  }
  return [...map.values()];
}

function mergeVotacaoPautasFromCloud(localCoop: VotacaoPauta[], cloudItems: VotacaoPauta[]): VotacaoPauta[] {
  const map = new Map<string, VotacaoPauta>();
  for (const item of localCoop) map.set(item.id, item);
  for (const cloud of cloudItems) {
    const local = map.get(cloud.id);
    if (!local || itemTime(cloud) >= itemTime(local)) map.set(cloud.id, cloud);
  }
  return [...map.values()];
}

function mergeVotacaoVotosFromCloud(
  localCoop: VotacaoVoto[],
  cloudItems: VotacaoVoto[],
  pautas: VotacaoPauta[] = []
): VotacaoVoto[] {
  const reaberturaPorPauta = new Map(
    pautas.filter((p) => p.votosReabertosEm).map((p) => [p.id, new Date(p.votosReabertosEm!).getTime()])
  );
  const localFiltrado = localCoop.filter((v) => {
    const reabertoEm = reaberturaPorPauta.get(v.pautaId);
    if (!reabertoEm) return true;
    return new Date(v.createdAt).getTime() >= reabertoEm;
  });

  const map = new Map<string, VotacaoVoto>();
  const key = (v: VotacaoVoto) => `${v.pautaId}:${v.cooperadoId}`;
  for (const item of localFiltrado) {
    if (reaberturaPorPauta.has(item.pautaId)) continue;
    map.set(key(item), item);
  }
  for (const cloud of cloudItems) {
    const k = key(cloud);
    const local = map.get(k);
    const merged = !local || itemTime(cloud) >= itemTime(local) ? cloud : local;
    map.set(k, { ...merged, confirmadoNuvem: true });
  }
  return [...map.values()];
}

function mergeNotasPedidoExcluidasByNewer(
  local: NotaPedidoExcluida[],
  cloud: NotaPedidoExcluida[]
): NotaPedidoExcluida[] {
  const map = new Map<string, NotaPedidoExcluida>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    const tItem = new Date(item.deletedAt).getTime();
    const tCur = cur ? new Date(cur.deletedAt).getTime() : 0;
    if (!cur || tItem >= tCur) map.set(item.id, item);
  }
  return [...map.values()];
}

function mergePrestacoesExcluidasByNewer(
  local: PrestacaoContasExcluida[],
  cloud: PrestacaoContasExcluida[]
): PrestacaoContasExcluida[] {
  const map = new Map<string, PrestacaoContasExcluida>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    const tItem = new Date(item.deletedAt).getTime();
    const tCur = cur ? new Date(cur.deletedAt).getTime() : 0;
    if (!cur || tItem >= tCur) map.set(item.id, item);
  }
  return [...map.values()];
}

function mergeInstituicoesExcluidasByNewer(
  local: InstituicaoExcluida[],
  cloud: InstituicaoExcluida[]
): InstituicaoExcluida[] {
  const map = new Map<string, InstituicaoExcluida>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    const tItem = new Date(item.deletedAt).getTime();
    const tCur = cur ? new Date(cur.deletedAt).getTime() : 0;
    if (!cur || tItem >= tCur) map.set(item.id, item);
  }
  return [...map.values()];
}

function resolveCoopId(data: AppData, cnpj: string): string | undefined {
  const digits = normalizeCnpj(cnpj);
  return data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === digits)?.id;
}

function buildContratosPayload(data: AppData, coopId: string): ContratosSyncPayload {
  const now = new Date().toISOString();
  const excluidasIds = new Set(
    (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId).map((e) => e.id)
  );
  return {
    updatedAt: now,
    instituicoes: data.instituicoes.filter((i) => i.cooperativaId === coopId && !excluidasIds.has(i.id)),
    produtosInstituicao: data.produtosInstituicao.filter(
      (p) => p.cooperativaId === coopId && !excluidasIds.has(p.instituicaoId)
    ),
    instituicoesExcluidas: (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cronogramasContrato: (data.cronogramasContrato ?? []).filter((c) => c.cooperativaId === coopId),
  };
}

function buildOperacionalPayload(data: AppData, coopId: string): OperacionalSyncPayload {
  const sanitized = posProcessarIntegridadePagamentosCooperativa(
    reconciliarFichaFromNotasConferidas(data)
  );
  const now = new Date().toISOString();
  const cooperadoIds = new Set(
    sanitized.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id)
  );
  const excluidasIds = new Set(
    (sanitized.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId).map((e) => e.id)
  );
  const livroCaixaExcluidosCoop = (sanitized.livroCaixaExcluidos ?? []).filter(
    (e) => !e.cooperativaId || e.cooperativaId === coopId
  );
  const livroCaixaExcluidosIds = new Set(livroCaixaExcluidosCoop.map((e) => e.id));
  const fichaCoop = dedupeFichaCorridaPorNota(
    sanitized.fichaCorrida.filter((f) => f.cooperativaId === coopId),
    sanitized.notasPedido
  );
  return {
    updatedAt: now,
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    arquivosMensais: sanitized.arquivosMensais.filter((a) => a.cooperativaId === coopId),
    ajustesFichaMes: (sanitized.ajustesFichaMes ?? []).filter((a) => a.cooperativaId === coopId),
    pagamentosCooperado: sanitized.pagamentosCooperado.filter((p) => p.cooperativaId === coopId),
    comunicados: sanitized.comunicados.filter((c) => c.cooperativaId === coopId),
    comunicadosExcluidos: (sanitized.comunicadosExcluidos ?? []).filter(
      (e) => !e.cooperativaId || e.cooperativaId === coopId
    ),
    mensalidades: sanitized.mensalidades
      .filter((m) => mensalidadeVisivelNoDispositivo(sanitized, m, coopId))
      .map((m) =>
        enriquecerMensalidadeCooperadoSnapshot(
          sanitized,
          normalizarMensalidadeCooperadoLocal(sanitized, m, coopId),
          coopId
        )
      ),
    descontos: sanitized.descontos.filter((d) => cooperadoIds.has(d.cooperadoId)),
    valoresAvulsosReceber: (sanitized.valoresAvulsosReceber ?? []).filter((v) => v.cooperativaId === coopId),
    livroCaixa: (sanitized.livroCaixa ?? []).filter(
      (l) => l.cooperativaId === coopId && !livroCaixaExcluidosIds.has(l.id)
    ),
    livroCaixaControleAnual: (sanitized.livroCaixaControleAnual ?? []).filter((c) => c.cooperativaId === coopId),
    livroCaixaExcluidos: livroCaixaExcluidosCoop,
    prestacoesContas: (sanitized.prestacoesContas ?? []).filter(
      (p) => p.cooperativaId === coopId && !excluidasIds.has(p.id)
    ),
    prestacoesContasExcluidas: (sanitized.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    notasPedidoExcluidas: (sanitized.notasPedidoExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    fichaCorrida: fichaCoop,
    votacaoPautas: (sanitized.votacaoPautas ?? []).filter((p) => p.cooperativaId === coopId),
    votacaoVotos: (sanitized.votacaoVotos ?? []).filter((v) => v.cooperativaId === coopId),
    pareceresContabeis: (sanitized.pareceresContabeis ?? []).filter((p) => p.cooperativaId === coopId),
    fechamentoSnapshots: (sanitized.fechamentoSnapshots ?? []).filter((s) => s.cooperativaId === coopId),
    config: { ...sanitized.config },
  };
}

function normalizeCloudOperacional(cloud: OperacionalSyncPayload): OperacionalSyncPayload {
  if (cloud.fullReset === true) return cloud;
  if ((cloud.operationalResetVersion ?? 0) >= OPERATIONAL_RESET_VERSION) return cloud;
  return {
    ...cloud,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    notasPedidoExcluidas: [],
    fichaCorrida: [],
    votacaoPautas: [],
    votacaoVotos: [],
    pareceresContabeis: [],
    fechamentoSnapshots: [],
  };
}

function buildEmptyOperacionalResetPayload(data: AppData, coopId: string): OperacionalSyncPayload {
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));
  const mensalidadesCoop = data.mensalidades.filter((m) => cooperadoIds.has(m.cooperadoId));
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    fullReset: true,
    /** Reset operacional limpa fichas/pagamentos — entregas só no reset admin explícito. */
    wipeNotas: false,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    notasPedidoExcluidas: [],
    fichaCorrida: [],
    votacaoPautas: [],
    votacaoVotos: [],
    pareceresContabeis: [],
    fechamentoSnapshots: [],
    config: { ...data.config },
  };
}

export async function pushOperationalResetToCloud(cnpj: string, coopId?: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  const payload = buildEmptyOperacionalResetPayload(d, cid);
  try {
    await secureApiFetch("/api/cooperativa-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, section: "operacional", payload }),
    });
    markOperationalResetCloudDone();
  } catch {
    /* tenta de novo no próximo ciclo */
  }
}

function normalizeInstNome(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Une instituições com o mesmo nome e remapeia produtos para o id canônico. */
function reconcileInstituicoesProdutos(
  instituicoes: Instituicao[],
  produtos: ProdutoInstituicao[]
): { instituicoes: Instituicao[]; produtos: ProdutoInstituicao[] } {
  const instIdRemap = new Map<string, string>();
  const byName = new Map<string, Instituicao>();
  const produtosAtivos = (instId: string) =>
    produtos.filter((p) => p.instituicaoId === instId && p.ativo).length;

  for (const inst of instituicoes) {
    const key = normalizeInstNome(inst.nome);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, inst);
      continue;
    }
    const keep = produtosAtivos(inst.id) > produtosAtivos(existing.id) ? inst : existing;
    const drop = keep.id === inst.id ? existing : inst;
    instIdRemap.set(drop.id, keep.id);
    byName.set(key, keep);
  }

  const finalInst = [...byName.values()];
  const finalProd = produtos.map((p) => ({
    ...p,
    instituicaoId: instIdRemap.get(p.instituicaoId) ?? p.instituicaoId,
  }));

  return { instituicoes: finalInst, produtos: finalProd };
}

function mergeCatalogProducts(local: ProdutoInstituicao[], cloud: ProdutoInstituicao[]): ProdutoInstituicao[] {
  const merged = mergeArrayByNewer(local, cloud);

  const byNomeInst = new Map<string, ProdutoInstituicao>();
  for (const p of merged) {
    if (!p.ativo || p.precoUnitario <= 0) continue;
    const key = `${p.instituicaoId}::${normalizeInstNome(p.nome)}`;
    const cur = byNomeInst.get(key);
    if (!cur || itemTime(p) >= itemTime(cur)) byNomeInst.set(key, p);
  }

  const winningActiveIds = new Set([...byNomeInst.values()].map((p) => p.id));
  const inactive = merged.filter((p) => !p.ativo || p.precoUnitario <= 0);
  const activeWinners = merged.filter(
    (p) => p.ativo && p.precoUnitario > 0 && winningActiveIds.has(p.id)
  );

  if (activeWinners.length === 0) return merged;
  return [...inactive, ...activeWinners];
}

/** Cooperado só exibe o catálogo publicado pelo responsável na nuvem. */
function alinharCatalogoComNuvem(
  instituicoes: Instituicao[],
  produtos: ProdutoInstituicao[],
  cloudInst: Instituicao[],
  cloudProd: ProdutoInstituicao[],
  coopId: string
): { instituicoes: Instituicao[]; produtos: ProdutoInstituicao[] } {
  const cloudItensAtivos = cloudProd.filter((p) => p.ativo && p.precoUnitario > 0).length;
  if (cloudInst.length === 0 && cloudItensAtivos === 0) {
    return { instituicoes, produtos };
  }

  const cloudInstIds = new Set(cloudInst.map((i) => i.id));
  const cloudActive = cloudProd.filter((p) => p.ativo && p.precoUnitario > 0);
  const cloudProdIds = new Set(cloudActive.map((p) => p.id));
  const cloudProdKeys = new Set(
    cloudActive.map((p) => `${p.instituicaoId}::${normalizeInstNome(p.nome)}`)
  );

  const cloudInstComItens = new Set(cloudActive.map((p) => p.instituicaoId));

  const instituicoesAlinhadas = instituicoes.filter((i) => {
    if (i.cooperativaId !== coopId) return true;
    if (!cloudInstIds.has(i.id)) return false;
    if (cloudItensAtivos > 0 && !cloudInstComItens.has(i.id)) return false;
    return true;
  });

  const now = new Date().toISOString();
  const produtosAlinhados = produtos.map((p) => {
    if (p.cooperativaId !== coopId) return p;
    if (!p.ativo || p.precoUnitario <= 0) return p;
    if (cloudProdIds.has(p.id)) return p;
    const key = `${p.instituicaoId}::${normalizeInstNome(p.nome)}`;
    if (cloudProdKeys.has(key)) return p;
    return { ...p, ativo: false, updatedAt: now };
  });

  return { instituicoes: instituicoesAlinhadas, produtos: produtosAlinhados };
}

export function mergeContratosIntoData(data: AppData, cloud: ContratosSyncPayload, coopId: string): AppData {
  const cloudExcluidas = (cloud.instituicoesExcluidas ?? []).map((e) => ({ ...e, cooperativaId: coopId }));
  const mergedExcluidasCoop = mergeInstituicoesExcluidasByNewer(
    (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidas
  );
  const excluidasIds = new Set(mergedExcluidasCoop.map((e) => e.id));

  const localInst = data.instituicoes.filter((i) => i.cooperativaId !== coopId);
  const localProd = data.produtosInstituicao.filter((p) => p.cooperativaId !== coopId);

  const cloudInst = cloud.instituicoes
    .map((i) => ({ ...i, cooperativaId: coopId }))
    .filter((i) => !excluidasIds.has(i.id));
  const cloudProd = cloud.produtosInstituicao
    .map((p) => ({ ...p, cooperativaId: coopId }))
    .filter((p) => !excluidasIds.has(p.instituicaoId));
  const cloudItensAtivos = cloudProd.filter((p) => p.ativo && p.precoUnitario > 0).length;

  const localInstCoop = data.instituicoes.filter(
    (i) => i.cooperativaId === coopId && !excluidasIds.has(i.id)
  );
  const localProdCoop = data.produtosInstituicao.filter(
    (p) => p.cooperativaId === coopId && !excluidasIds.has(p.instituicaoId)
  );
  const localCronCoop = (data.cronogramasContrato ?? []).filter((c) => c.cooperativaId === coopId);
  const cloudCron = (cloud.cronogramasContrato ?? [])
    .map((c) => ({ ...c, cooperativaId: coopId }))
    .filter((c) => !excluidasIds.has(c.instituicaoId));

  const localInstIds = new Set(localInstCoop.map((i) => i.id));
  const cloudInstFiltered = cloudInst.filter((i) => {
    if (localInstIds.has(i.id)) return true;
    return cloudProd.some((p) => p.instituicaoId === i.id && p.ativo && p.precoUnitario > 0);
  });

  const mergedInst = mergeArrayByNewer(localInstCoop, cloudInstFiltered);
  const mergedProd =
    cloudItensAtivos > 0
      ? mergeCatalogProducts(localProdCoop, cloudProd)
      : mergeArrayByNewer(localProdCoop, cloudProd);

  const reconciled = reconcileInstituicoesProdutos(mergedInst, mergedProd);
  const alinhado = alinharCatalogoComNuvem(
    reconciled.instituicoes,
    reconciled.produtos,
    cloudInst,
    cloudProd,
    coopId
  );

  const instIdsValidos = new Set(
    alinhado.produtos
      .filter((p) => p.cooperativaId === coopId && p.ativo && p.precoUnitario > 0)
      .map((p) => p.instituicaoId)
  );
  const instituicoesPublicadas =
    cloudItensAtivos > 0
      ? alinhado.instituicoes.filter(
          (i) => i.cooperativaId !== coopId || instIdsValidos.has(i.id)
        )
      : alinhado.instituicoes;

  const filterCoop = <T extends { cooperativaId?: string }>(items: T[]) =>
    items.filter((i) => i.cooperativaId !== coopId);

  return aplicarInstituicoesExcluidas({
    ...data,
    instituicoes: [...localInst, ...instituicoesPublicadas],
    produtosInstituicao: [...localProd, ...alinhado.produtos],
    cronogramasContrato: [
      ...(data.cronogramasContrato ?? []).filter((c) => c.cooperativaId !== coopId),
      ...mergeArrayByNewer(localCronCoop, cloudCron),
    ],
    instituicoesExcluidas: [
      ...filterCoop(data.instituicoesExcluidas ?? []),
      ...mergedExcluidasCoop,
    ],
  });
}

export function mergeOperacionalIntoData(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cloudCooperados: Cooperado[] = []
): AppData {
  cloud = normalizeCloudOperacional(cloud);
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));

  const mensalidadesLocaisVisiveis = data.mensalidades
    .filter((m) => mensalidadeVisivelNoDispositivo(data, m, coopId))
    .map((m) => normalizarMensalidadeCooperadoLocal(data, m, coopId));
  const mensalidadesCloudVisiveis = (cloud.mensalidades ?? [])
    .filter((raw) => mensalidadeCloudEntraNoDispositivo(data, raw, coopId, cloudCooperados))
    .map((raw) => prepararMensalidadeCloud(data, raw, coopId, cloudCooperados));

  const cloudArquivos = cloud.arquivosMensais.map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudAjustes = (cloud.ajustesFichaMes ?? []).map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudPagamentos = cloud.pagamentosCooperado.map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudComunicados = cloud.comunicados.map((c) => ({ ...c, cooperativaId: coopId }));
  const cloudDescontos = (cloud.descontos ?? []).filter((d) => cooperadoIds.has(d.cooperadoId));
  const cloudAvulsos = (cloud.valoresAvulsosReceber ?? []).map((v) => ({ ...v, cooperativaId: coopId }));
  const cloudLivro = (cloud.livroCaixa ?? []).map((l) => ({ ...l, cooperativaId: coopId }));
  const cloudLivroControle = (cloud.livroCaixaControleAnual ?? []).find((c) => c.cooperativaId === coopId);
  const localLivroControle = (data.livroCaixaControleAnual ?? []).find((c) => c.cooperativaId === coopId);
  const mergedLivroControle = mergeLivroCaixaControleAnualFromCloud(localLivroControle, cloudLivroControle);
  const cloudExcluidasNotas = (cloud.notasPedidoExcluidas ?? []).map((e) => ({ ...e, cooperativaId: coopId }));
  const mergedNotasExcluidasCoop = mergeNotasPedidoExcluidasByNewer(
    (data.notasPedidoExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidasNotas
  );
  const cloudExcluidas = (cloud.prestacoesContasExcluidas ?? []).map((e) => ({ ...e, cooperativaId: coopId }));
  const cloudFichas = (cloud.fichaCorrida ?? []).map((f) => ({ ...f, cooperativaId: coopId }));
  const cloudPautas = (cloud.votacaoPautas ?? []).map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudVotos = (cloud.votacaoVotos ?? []).map((v) => ({ ...v, cooperativaId: coopId }));
  const cloudPareceres = (cloud.pareceresContabeis ?? []).map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudSnapshots = (cloud.fechamentoSnapshots ?? []).map((s) => ({ ...s, cooperativaId: coopId }));
  const mergedExcluidasCoop = mergePrestacoesExcluidasByNewer(
    (data.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidas
  );
  const prestacoesExcluidasIds = new Set(mergedExcluidasCoop.map((e) => e.id));
  const cloudPrest = (cloud.prestacoesContas ?? [])
    .map((p) => ({ ...p, cooperativaId: coopId }))
    .filter((p) => !prestacoesExcluidasIds.has(p.id));
  const localPrestCoop = (data.prestacoesContas ?? [])
    .filter((p) => p.cooperativaId === coopId && !prestacoesExcluidasIds.has(p.id));

  const filterCoop = <T extends { cooperativaId?: string; cooperadoId?: string }>(
    items: T[],
    isCoop: (i: T) => boolean
  ) => items.filter((i) => !isCoop(i));

  const cloudSyncTime = cloud.updatedAt;
  const cloudAuthoritative = cloud.fullReset === true;
  const localPagCoop = data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId);
  const mergedPagamentosCoop = mergePagamentosCooperadoFromCloud(localPagCoop, cloudPagamentos);

  const localPautasCoop = (data.votacaoPautas ?? []).filter((p) => p.cooperativaId === coopId);
  const localVotosCoop = (data.votacaoVotos ?? []).filter((v) => v.cooperativaId === coopId);
  const mergedPautasCoop = cloudAuthoritative
    ? cloudPautas
    : mergeVotacaoPautasFromCloud(localPautasCoop, cloudPautas);
  const mergedVotosCoop = cloudAuthoritative
    ? cloudVotos
    : mergeVotacaoVotosFromCloud(localVotosCoop, cloudVotos, mergedPautasCoop);

  const cloudComunicadosExcluidos = (cloud.comunicadosExcluidos ?? []).map((e) => ({
    ...e,
    cooperativaId: e.cooperativaId ?? coopId,
  }));
  const mergedComunicadosExcluidosCoop = cloudAuthoritative
    ? cloudComunicadosExcluidos
    : mergeComunicadosExcluidosFromCloud(
        (data.comunicadosExcluidos ?? []).filter((e) => !e.cooperativaId || e.cooperativaId === coopId),
        cloudComunicadosExcluidos
      );
  const comunicadosExcluidosSet = new Set(mergedComunicadosExcluidosCoop.map((e) => e.id));

  const cloudLivroCaixaExcluidos = (cloud.livroCaixaExcluidos ?? []).map((e) => ({
    ...e,
    cooperativaId: e.cooperativaId ?? coopId,
  }));
  const mergedLivroCaixaExcluidosCoop = cloudAuthoritative
    ? cloudLivroCaixaExcluidos
    : mergeLivroCaixaExcluidosFromCloud(
        (data.livroCaixaExcluidos ?? []).filter((e) => !e.cooperativaId || e.cooperativaId === coopId),
        cloudLivroCaixaExcluidos
      );
  const livroCaixaExcluidosSet = new Set(mergedLivroCaixaExcluidosCoop.map((e) => e.id));

  let next: AppData = {
    ...data,
    arquivosMensais: [
      ...filterCoop(data.arquivosMensais, (a) => a.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudArquivos
        : mergeArquivosMensaisFromCloud(
            data,
            data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
            cloudArquivos
          )),
    ],
    ajustesFichaMes: [
      ...filterCoop(data.ajustesFichaMes ?? [], (a) => a.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudAjustes
        : mergeOperacionalArrayFromCloud(
            (data.ajustesFichaMes ?? []).filter((a) => a.cooperativaId === coopId),
            cloudAjustes,
            cloudSyncTime
          )),
    ],
    pagamentosCooperado: [
      ...filterCoop(data.pagamentosCooperado, (p) => p.cooperativaId === coopId),
      ...mergedPagamentosCoop,
    ],
    comunicados: [
      ...filterCoop(data.comunicados, (c) => c.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudComunicados.filter((c) => !comunicadosExcluidosSet.has(c.id))
        : mergeComunicadosFromCloud(
            data.comunicados.filter((c) => c.cooperativaId === coopId),
            cloudComunicados,
            comunicadosExcluidosSet
          )),
    ],
    comunicadosExcluidos: [
      ...(data.comunicadosExcluidos ?? []).filter((e) => e.cooperativaId && e.cooperativaId !== coopId),
      ...mergedComunicadosExcluidosCoop,
    ],
    mensalidades: [
      ...data.mensalidades.filter((m) => !mensalidadeVisivelNoDispositivo(data, m, coopId)),
      ...(cloudAuthoritative
        ? mensalidadesCloudVisiveis
        : mergeOperacionalArrayFromCloud(
            mensalidadesLocaisVisiveis,
            mensalidadesCloudVisiveis,
            cloudSyncTime
          )),
    ],
    descontos: [
      ...data.descontos.filter((d) => !cooperadoIds.has(d.cooperadoId)),
      ...(cloudAuthoritative
        ? cloudDescontos
        : mergeOperacionalArrayFromCloud(
            data.descontos.filter((d) => cooperadoIds.has(d.cooperadoId)),
            cloudDescontos,
            cloudSyncTime
          )),
    ],
    valoresAvulsosReceber: [
      ...filterCoop(data.valoresAvulsosReceber ?? [], (v) => v.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudAvulsos
        : mergeOperacionalArrayFromCloud(
            (data.valoresAvulsosReceber ?? []).filter((v) => v.cooperativaId === coopId),
            cloudAvulsos,
            cloudSyncTime
          )),
    ],
    livroCaixa: [
      ...filterCoop(data.livroCaixa ?? [], (l) => l.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudLivro.filter((l) => !livroCaixaExcluidosSet.has(l.id))
        : mergeLivroCaixaFromCloud(
            (data.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId),
            cloudLivro,
            cloudSyncTime,
            livroCaixaExcluidosSet
          )),
    ],
    livroCaixaControleAnual: [
      ...(data.livroCaixaControleAnual ?? []).filter((c) => c.cooperativaId !== coopId),
      ...(mergedLivroControle ? [mergedLivroControle] : []),
    ],
    livroCaixaExcluidos: [
      ...(data.livroCaixaExcluidos ?? []).filter((e) => e.cooperativaId && e.cooperativaId !== coopId),
      ...mergedLivroCaixaExcluidosCoop,
    ],
    prestacoesContas: [
      ...filterCoop(data.prestacoesContas ?? [], (p) => p.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudPrest.filter((p) => !prestacoesExcluidasIds.has(p.id))
        : mergeOperacionalArrayFromCloud(localPrestCoop, cloudPrest, cloudSyncTime).filter(
            (p) => !prestacoesExcluidasIds.has(p.id)
          )),
    ],
    prestacoesContasExcluidas: [
      ...filterCoop(data.prestacoesContasExcluidas ?? [], (e) => e.cooperativaId === coopId),
      ...(cloudAuthoritative ? cloudExcluidas : mergedExcluidasCoop),
    ],
    notasPedidoExcluidas: [
      ...filterCoop(data.notasPedidoExcluidas ?? [], (e) => e.cooperativaId === coopId),
      ...(cloudAuthoritative ? cloudExcluidasNotas : mergedNotasExcluidasCoop),
    ],
    fichaCorrida: dedupeFichaCorridaPorNota(
      [
        ...filterCoop(data.fichaCorrida ?? [], (f) => f.cooperativaId === coopId),
        ...(cloudAuthoritative
          ? mergeFichaCorridaFromCloud(
              (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === coopId),
              cloudFichas,
              mergedPagamentosCoop
            )
          : mergeFichaCorridaFromCloud(
              (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === coopId),
              cloudFichas,
              [...localPagCoop, ...cloudPagamentos]
            )),
      ],
      data.notasPedido
    ),
    votacaoPautas: [
      ...filterCoop(data.votacaoPautas ?? [], (p) => p.cooperativaId === coopId),
      ...mergedPautasCoop,
    ],
    votacaoVotos: [
      ...filterCoop(data.votacaoVotos ?? [], (v) => v.cooperativaId === coopId),
      ...mergedVotosCoop,
    ],
    pareceresContabeis: [
      ...filterCoop(data.pareceresContabeis ?? [], (p) => p.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudPareceres
        : mergePareceresContabeisFromCloud(
            (data.pareceresContabeis ?? []).filter((p) => p.cooperativaId === coopId),
            cloudPareceres
          )),
    ],
    fechamentoSnapshots: [
      ...filterCoop(data.fechamentoSnapshots ?? [], (s) => s.cooperativaId === coopId),
      ...(cloudAuthoritative
        ? cloudSnapshots
        : mergeFechamentoSnapshotsFromCloud(
            (data.fechamentoSnapshots ?? []).filter((s) => s.cooperativaId === coopId),
            cloudSnapshots
          )),
    ],
  };

  const localConfigTime = new Date(data.cooperativas.find((c) => c.id === coopId)?.updatedAt ?? 0).getTime();
  const cloudConfigTime = new Date(cloud.updatedAt).getTime();
  if (cloudConfigTime >= localConfigTime && cloud.config) {
    next = { ...next, config: { ...next.config, ...cloud.config } };
  }

  next = reconciliarMensalidadesComCooperadosCloud(next, coopId, cloudCooperados);

  next = {
    ...next,
    mensalidades: next.mensalidades.map((m) => {
      if (!mensalidadeVisivelNoDispositivo(next, m, coopId)) return m;
      return enriquecerMensalidadeCooperadoSnapshot(
        next,
        prepararMensalidadeCloud(next, m, coopId, cloudCooperados),
        coopId
      );
    }),
  };

  const cloudResetLimpouMensalidades =
    cloud.fullReset === true && (cloud.mensalidades ?? []).length === 0;

  const posMergeFinanceiro = (draft: AppData): AppData =>
    cloudAuthoritative
      ? posProcessarIntegridadePagamentosCooperativa(draft)
      : posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(draft));

  if (cloudResetLimpouMensalidades) {
    return purgeComunicadosMarcadosExcluidos(
      aplicarNotasPedidoExcluidas(
        aplicarPrestacoesContasExcluidas(posMergeFinanceiro(next)),
        coopId
      ),
      coopId
    );
  }

  return purgeComunicadosMarcadosExcluidos(
    sincronizarMensalidadeCooperativa(
      aplicarNotasPedidoExcluidas(
        aplicarPrestacoesContasExcluidas(posMergeFinanceiro(next)),
        coopId
      ),
      coopId
    ),
    coopId
  );
}

async function fetchSyncBundle(cnpj: string): Promise<{
  contratos: ContratosSyncPayload | null;
  operacional: OperacionalSyncPayload | null;
} | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  try {
    const res = await secureApiFetch(`/api/cooperativa-sync?cnpj=${digits}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.configured) return null;
    const operacional = json.operacional ?? null;
    noteOperacionalCloudRestoreFromFetch(digits, operacional);
    return {
      contratos: json.contratos ?? null,
      operacional,
    };
  } catch {
    return null;
  }
}

export async function pushContratosToCloud(
  cnpj: string,
  data?: AppData,
  coopId?: string,
  options?: { localOnly?: boolean; authoritative?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = aplicarInstituicoesExcluidas(data ?? getData());
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  let merged = d;
  let bundle: Awaited<ReturnType<typeof fetchSyncBundle>> | null = null;
  const skipCloudMerge = options?.authoritative || options?.localOnly;
  if (!skipCloudMerge) {
    bundle = await fetchSyncBundle(digits);
    if (bundle?.contratos) {
      merged = aplicarInstituicoesExcluidas(mergeContratosIntoData(d, bundle.contratos, cid));
      saveDataSafe(merged);
    }
  } else {
    saveDataSafe(merged);
  }

  const payload = buildContratosPayload(merged, cid);
  if (!skipCloudMerge) {
    const localItensAtivos = payload.produtosInstituicao.filter((p) => p.ativo && p.precoUnitario > 0).length;
    const cloudItensAtivos =
      bundle?.contratos?.produtosInstituicao.filter((p) => p.ativo && p.precoUnitario > 0).length ?? 0;
    if (localItensAtivos === 0 && cloudItensAtivos > 0) return;
  }

  payload.updatedAt = new Date().toISOString();
  try {
    await secureApiFetch("/api/cooperativa-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, section: "contratos", payload }),
    });
  } catch {
    /* offline */
  }
}

export async function pushOperacionalToCloud(
  cnpj: string,
  data?: AppData,
  coopId?: string,
  options?: { authoritative?: boolean; skipOperationalResetPush?: boolean; forceOperacionalPush?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  if (!isOperacionalPushSingleFlightEnabled()) {
    return pushOperacionalToCloudInternal(cnpj, data, coopId, options);
  }
  return enqueueOperacionalPush(digits, () => pushOperacionalToCloudInternal(cnpj, data, coopId, options));
}

/** Corpo operacional (POST, dedupe, merge). Não chama a API pública nem `enqueueOperacionalPush`. */
export async function pushOperacionalToCloudInternal(
  cnpj: string,
  data?: AppData,
  coopId?: string,
  options?: { authoritative?: boolean; skipOperationalResetPush?: boolean; forceOperacionalPush?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  await pushOperacionalInternalTestEnterHook?.({ cnpj: digits });

  if (!options?.skipOperationalResetPush && needsOperationalResetCloudPush()) {
    await pushOperationalResetToCloud(digits, coopId);
  }

  let bundle: Awaited<ReturnType<typeof fetchSyncBundle>> | null = await fetchSyncBundle(digits);
  if (cloudOperacionalRestoreAtivo(bundle?.operacional) && !options?.forceOperacionalPush) {
    return;
  }
  if (!bundle?.operacional && !options?.forceOperacionalPush) {
    return;
  }

  // Snapshot inicial só para resolver CNPJ/coop; após awaits sempre reler getData()
  // para não sobrescrever ações do responsável feitas durante o fetch.
  const seed = data ?? getData();
  const cid = coopId ?? resolveCoopId(seed, digits);
  if (!cid) return;

  await ensureComunicadosAudioUploaded(digits, cid, getData()).catch(() => {});

  bundle = await fetchSyncBundle(digits);
  let cloudCooperados: Cooperado[] = (await fetchCooperadosFromCloud(digits)).cooperados;

  const fresh = aplicarPrestacoesContasExcluidas(getData());
  let merged = fresh;
  if (bundle?.operacional) {
    const fromCloud = mergeOperacionalIntoData(fresh, bundle.operacional, cid, cloudCooperados);
    merged = options?.authoritative
      ? {
          ...fresh,
          pagamentosCooperado: [
            ...fresh.pagamentosCooperado.filter((p) => p.cooperativaId !== cid),
            ...mergePagamentosCooperadoFromCloud(
              fresh.pagamentosCooperado.filter((p) => p.cooperativaId === cid),
              fromCloud.pagamentosCooperado.filter((p) => p.cooperativaId === cid)
            ),
          ],
          votacaoPautas: fromCloud.votacaoPautas,
          votacaoVotos: fromCloud.votacaoVotos,
        }
      : fromCloud;
  }
  saveDataSafe(merged);

  const payload = buildOperacionalPayload(merged, cid);
  const cloudMensalidades = prepararMensalidadesCloud(
    merged,
    bundle?.operacional?.mensalidades ?? [],
    cid,
    cloudCooperados
  );
  if (bundle?.operacional) {
    payload.mensalidades = mesclarMensalidadesPayloadNuvem(
      merged,
      cid,
      payload.mensalidades,
      cloudMensalidades
    );
  }
  payload.mensalidades = payload.mensalidades.map((m) =>
    enriquecerMensalidadeCooperadoSnapshot(merged, m, cid)
  );

  const cooperadosCoop = merged.cooperados.filter(
    (c) => c.cooperativaId === cid && c.status !== "desligado"
  );
  await Promise.all(cooperadosCoop.map((c) => pushCooperadoToCloud(digits, c)));

  // Após awaits dos cooperados, reler de novo e remontar payload se o responsável
  // salvou algo nesse intervalo — evita last-write-wins com blob antigo.
  const afterPushCoop = aplicarPrestacoesContasExcluidas(getData());
  let dataForPayload = afterPushCoop;
  if (bundle?.operacional) {
    bundle = await fetchSyncBundle(digits);
    if (bundle?.operacional) {
      if (cloudCooperados.length === 0) {
        cloudCooperados = (await fetchCooperadosFromCloud(digits)).cooperados;
      }
      const voteMerged = mergeOperacionalIntoData(afterPushCoop, bundle.operacional, cid, cloudCooperados);
      dataForPayload = {
        ...afterPushCoop,
        votacaoPautas: voteMerged.votacaoPautas,
        votacaoVotos: voteMerged.votacaoVotos,
      };
      saveDataSafe(dataForPayload);
    }
  }
  if (bundle?.operacional) {
    const cloudPag = (bundle.operacional.pagamentosCooperado ?? []).map((p) => ({
      ...p,
      cooperativaId: cid,
    }));
    const localPag = dataForPayload.pagamentosCooperado.filter((p) => p.cooperativaId === cid);
    dataForPayload = {
      ...dataForPayload,
      pagamentosCooperado: [
        ...dataForPayload.pagamentosCooperado.filter((p) => p.cooperativaId !== cid),
        ...mergePagamentosCooperadoFromCloud(localPag, cloudPag),
      ],
    };
  }
  dataForPayload = posProcessarFinanceiroLocal(dataForPayload, digits);
  saveDataSafe(dataForPayload);
  const payloadFinal = buildOperacionalPayload(dataForPayload, cid);
  if (bundle?.operacional) {
    const cloudMens = prepararMensalidadesCloud(
      afterPushCoop,
      bundle.operacional.mensalidades ?? [],
      cid,
      cloudCooperados
    );
    payloadFinal.mensalidades = mesclarMensalidadesPayloadNuvem(
      afterPushCoop,
      cid,
      payloadFinal.mensalidades,
      cloudMens
    );
  }
  payloadFinal.mensalidades = payloadFinal.mensalidades.map((m) =>
    enriquecerMensalidadeCooperadoSnapshot(afterPushCoop, m, cid)
  );
  payloadFinal.updatedAt = new Date().toISOString();

  if (!bundle?.operacional) {
    bundle = await fetchSyncBundle(digits);
    if (cloudCooperados.length === 0) {
      cloudCooperados = (await fetchCooperadosFromCloud(digits)).cooperados;
    }
  }
  const cloudFichaCount = (bundle?.operacional?.fichaCorrida ?? []).filter(
    (f) => f.cooperativaId === cid
  ).length;
  if (
    bundle?.operacional &&
    !options?.forceOperacionalPush &&
    !options?.authoritative &&
    !operacionalTemPagamentoAguardandoSoLocal(afterPushCoop, cid, bundle.operacional) &&
    !operacionalPushSeguro(
      afterPushCoop,
      cid,
      cloudFichaCount,
      payloadFinal.fichaCorrida?.length ?? 0
    )
  ) {
    const repaired = posProcessarFinanceiroLocal(
      purgeComunicadosMarcadosExcluidos(
        mergeOperacionalIntoData(afterPushCoop, bundle.operacional, cid, cloudCooperados),
        cid
      ),
      digits
    );
    saveDataSafe(repaired);
    return;
  }

  const pushKey = operacionalPushCacheKey(digits, !!options?.authoritative);
  const fingerprint = fingerprintOperacionalPayload(payloadFinal);
  if (!options?.forceOperacionalPush && lastOperacionalPushFingerprint.get(pushKey) === fingerprint) {
    return;
  }

  try {
    const res = await secureApiFetch("/api/cooperativa-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, section: "operacional", payload: payloadFinal }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      console.warn("[operacional-push]", res.status, json.code ?? json.error ?? res.statusText);
      return;
    }
    lastOperacionalPushFingerprint.set(pushKey, fingerprint);
  } catch {
    /* offline */
  }
}

export async function pushCooperativaProfileToCloud(cooperativa: Cooperativa): Promise<void> {
  const cnpj = normalizeCnpj(cooperativa.cnpj);
  if (cnpj.length !== 14) return;
  try {
    await secureApiFetch(`/api/cooperativas/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: cooperativa.nome,
        endereco: cooperativa.endereco,
        telefone: cooperativa.telefone,
        responsavel: cooperativa.responsavel,
        email: cooperativa.email,
        mensalidadeConfig: cooperativa.mensalidadeConfig,
        senhaCadastroCooperado: cooperativa.senhaCadastroCooperado?.trim() ?? "",
        senhaAreaAdminHash: cooperativa.senhaAreaAdminHash?.trim() ?? "",
      }),
    });
  } catch {
    /* offline */
  }
}

export async function syncContratosFromCloud(cnpj: string): Promise<boolean> {
  const bundle = await fetchSyncBundle(cnpj);
  if (!bundle?.contratos) return false;
  const current = getData();
  const coopId = resolveCoopId(current, cnpj);
  if (!coopId) return false;
  const merged = mergeContratosIntoData(current, bundle.contratos, coopId);
  saveDataSafe(merged);
  return true;
}

/** Responsável republica todo o catálogo (contratos + preços) na nuvem. */
export async function publicarCatalogoContratos(cnpj: string, data?: AppData, coopId?: string): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return false;
  const itens = d.produtosInstituicao.filter(
    (p) => p.cooperativaId === cid && p.ativo && p.precoUnitario > 0
  ).length;
  if (itens === 0) return false;
  await pushContratosToCloud(digits, d, cid, { authoritative: true });
  return true;
}

export async function syncOperacionalFromCloud(cnpj: string): Promise<boolean> {
  const bundle = await fetchSyncBundle(cnpj);
  if (!bundle?.operacional) return false;
  let current = getData();
  const coopId = resolveCoopId(current, cnpj);
  if (!coopId) return false;

  const stale = reapplyCloudOperationalSliceIfStale(current, cnpj, coopId, bundle.operacional);
  if (stale.changed) current = stale.data;

  const reset = applyCloudOperationalResetIfNeeded(current, cnpj, coopId, bundle.operacional);
  if (reset.changed) current = reset.data;

  if (cloudOperacionalRestoreAtivo(bundle.operacional)) {
    current = clearOperacionalFinanceiroForCooperativa(current, coopId);
  }

  const cloudCooperados = (await fetchCooperadosFromCloud(cnpj)).cooperados;
  const merged = mergeOperacionalIntoData(current, bundle.operacional, coopId, cloudCooperados);
  saveDataSafe(merged);
  if (cloudOperacionalRestoreAtivo(bundle.operacional)) {
    markOperacionalCloudAuthoritative(cnpj, bundle.operacional.operationalResetVersion ?? 1);
  } else {
    clearOperacionalCloudAuthoritative(cnpj);
  }
  return true;
}

export async function syncCooperativaProfileFromCloud(cnpj: string): Promise<boolean> {
  const cloud = await fetchCooperativaByCnpjFromCloud(cnpj);
  if (!cloud) return false;
  const current = getData();
  const mergedCoops = mergeCooperativaIntoData(current.cooperativas, cloud);
  const coopId = resolveCoopId(current, cnpj);
  const next = sincronizarMensalidadeCooperativa({ ...current, cooperativas: mergedCoops }, coopId);
  saveDataSafe(next);
  return true;
}

/** Intervalo legado — sync periódico desativado (economia Edge Requests). Mantido só por compatibilidade. */
export const SYNC_INTERVAL_MS = 12_000;
/** @deprecated Sync periódico removido; use requestAppSync / abrir app. */
export const SYNC_INTERVAL_MOBILE_MS = 15 * 60_000;
/** @deprecated Sync periódico removido; use requestAppSync / abrir app. */
export const SYNC_INTERVAL_DESKTOP_MS = 15 * 60_000;
/** Intervalo mínimo entre duas sincronizações (evita rajada ao abrir/voltar). */
export const SYNC_MIN_GAP_MS = 2 * 60_000;
export const SYNC_MIN_GAP_MOBILE_MS = 2 * 60_000;
/** Responsável / diretoria — permite nova sync mais cedo após salvar ou abrir tela. */
export const SYNC_MIN_GAP_GESTAO_MS = 45_000;

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 768px)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}

export function getSyncIntervalMs(): number {
  return isMobileDevice() ? SYNC_INTERVAL_MOBILE_MS : SYNC_INTERVAL_DESKTOP_MS;
}

export function getSyncMinGapMs(role?: string): number {
  if (role === "cooperado") {
    return isMobileDevice() ? SYNC_MIN_GAP_MOBILE_MS : SYNC_MIN_GAP_MS;
  }
  if (
    role === "responsavel" ||
    role === "tesoureiro" ||
    role === "admin" ||
    role === "presidente" ||
    role === "contador"
  ) {
    return SYNC_MIN_GAP_GESTAO_MS;
  }
  return isMobileDevice() ? SYNC_MIN_GAP_MOBILE_MS : SYNC_MIN_GAP_MS;
}

export async function ensureCloudOperationalResetApplied(
  cnpj: string,
  preferredCoopId?: string
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;

  const bundle = await fetchSyncBundle(digits);
  if (!bundle?.operacional?.fullReset) return false;

  const current = getData();
  const coopId = preferredCoopId ?? resolveCoopId(current, digits);
  if (!coopId) return false;

  let working = current;
  const stale = reapplyCloudOperationalSliceIfStale(working, digits, coopId, bundle.operacional);
  if (stale.changed) working = stale.data;

  const reset = applyCloudOperationalResetIfNeeded(working, digits, coopId, bundle.operacional);
  if (reset.changed || stale.changed) {
    saveDataSafe(reset.changed ? reset.data : working);
    return true;
  }

  return false;
}

/** Sync leve em background (cooperado no celular): perfil, cooperados, notas e operacional. */
export async function syncCooperativaBackground(
  cnpj: string,
  preferredCoopId?: string,
  cooperadoId?: string
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  beginCloudSync();
  try {
    await ensureCloudOperationalResetApplied(digits, preferredCoopId);

    const bundleHint = await fetchSyncBundle(digits);
    const restoreAtivo = cloudOperacionalRestoreAtivo(bundleHint?.operacional);

    await runWithBatchedSaveAsync(async () => {
      await syncCooperativaProfileFromCloud(digits);
      const coopId = preferredCoopId ?? resolveCoopId(getData(), digits);
      await syncCooperadosFromCloud(digits, coopId);
      if (restoreAtivo) {
        await syncOperacionalFromCloud(digits);
        await syncNotasPedidoFromCloud(digits);
      } else {
        await syncNotasPedidoFromCloud(digits);
        await syncOperacionalFromCloud(digits);
      }
      await syncContratosFromCloud(digits);
      const operacionalCloud = (await fetchSyncBundle(digits))?.operacional ?? null;
      if (coopId && !isOperacionalCloudAuthoritative(digits)) {
        await repararIntegridadeFichaNotas(digits, coopId, cooperadoId);
      }
      saveDataSafe(finalizeOperacionalPullLocalState(getData(), operacionalCloud, digits));
      if (cooperadoId && coopId) {
        const after = getData();
        const limpo = limparFichaObsoletaCooperado(after, cooperadoId, coopId);
        if (limpo !== after) saveDataSafe(limpo);
      }
    });
  } finally {
    endCloudSync();
  }
}

/**
 * Repara desalinhamento ficha↔notas (delta vazio, relogin no celular) para qualquer cooperado.
 */
export async function repararIntegridadeFichaNotas(
  cnpj: string,
  cooperativaId: string,
  cooperadoId?: string
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  const data = getData();
  if (
    !precisaReparoFullSyncNotas(data, cooperativaId, cooperadoId) &&
    !(cooperadoId && cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId))
  ) {
    return false;
  }

  forceNextFullNotasSync(digits);
  clearNotasSyncMeta(digits);
  await syncNotasPedidoFromCloud(digits, { retryFull: true });
  await syncOperacionalFromCloud(digits);
  saveDataSafe(posProcessarFinanceiroLocal(getData(), digits));
  return true;
}

/**
 * Recuperação agressiva quando o cooperado abre o app sem ficha nem notas locais.
 */
export async function ensureCooperadoFinanceiroFromCloud(
  cnpj: string,
  cooperativaId: string,
  cooperadoId: string
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;

  let data = getData();
  const limpoInicial = limparFichaObsoletaCooperado(data, cooperadoId, cooperativaId);
  if (limpoInicial !== data) {
    saveDataSafe(limpoInicial);
    data = getData();
  }
  if (cooperadoFichaValoresDesalinhados(data, cooperadoId, cooperativaId)) {
    if (!isOperacionalCloudAuthoritative(digits)) {
      saveDataSafe(posProcessarFinanceiroLocal(data, digits));
    }
    data = getData();
  }
  if (!cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId)) {
    return true;
  }

  beginCloudSync();
  try {
    clearNotasSyncMeta(digits);
    forceNextFullNotasSync(digits);
    await syncCooperadosFromCloud(digits, cooperativaId);
    await syncNotasPedidoFromCloud(digits, { retryFull: true });
    await syncOperacionalFromCloud(digits);
    saveDataSafe(posProcessarFinanceiroLocal(getData(), digits));

    data = getData();
    if (
      !isOperacionalCloudAuthoritative(digits) &&
      cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId)
    ) {
      await repararIntegridadeFichaNotas(digits, cooperativaId, cooperadoId);
    }
    data = getData();
    const limpoFinal = limparFichaObsoletaCooperado(data, cooperadoId, cooperativaId);
    if (limpoFinal !== data) saveDataSafe(limpoFinal);
    return !cooperadoFinanceiroDesatualizado(getData(), cooperadoId, cooperativaId);
  } finally {
    endCloudSync();
  }
}

/**
 * Cooperado: publica votos/mensalidades informadas mesclando com a nuvem.
 * Nunca usa authoritative — evita sobrescrever ficha de outros cooperados com snapshot local incompleto.
 */
export async function pushCooperadoOperacionalToCloud(
  cnpj: string,
  coopId?: string
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;
  await pushOperacionalToCloud(digits, d, cid, {
    skipOperationalResetPush: true,
  });
}

/** Sincroniza tudo da cooperativa: cooperados, notas, contratos, operacional, perfil. */
export async function syncAllCooperativaFromCloud(cnpj: string, preferredCoopId?: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  await ensureCloudOperationalResetApplied(digits, preferredCoopId);

  await runWithBatchedSaveAsync(async () => {
    await syncCooperativaProfileFromCloud(digits);
    const coopId = preferredCoopId ?? resolveCoopId(getData(), digits);
    await syncCooperadosFromCloud(digits, coopId);
    // Ficha (operacional) antes das notas — evita 2ª ficha e valor dobrado.
    await syncOperacionalFromCloud(digits);
    await syncContratosFromCloud(digits);
    await syncNotasPedidoFromCloud(digits);
    const operacionalCloud = (await fetchSyncBundle(digits))?.operacional ?? null;
    saveDataSafe(finalizeOperacionalPullLocalState(getData(), operacionalCloud, digits));
  });
}

/**
 * Puxa da nuvem e envia alterações locais (operacional + catálogo quando houver itens).
 * Usado pelo sync global para manter responsável e cooperado sempre atualizados.
 */
export async function syncCooperativaBidirectional(
  cnpj: string,
  coopId?: string,
  options?: { pushCatalog?: boolean; pushMensalidades?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  if (needsOperationalResetCloudPush()) {
    await pushOperationalResetToCloud(digits, coopId);
  }

  await runWithBatchedSaveAsync(async () => {
    await syncAllCooperativaFromCloud(digits, coopId);
  });

  const bundleAfterPull = await fetchSyncBundle(digits);
  if (cloudOperacionalRestoreAtivo(bundleAfterPull?.operacional)) {
    return;
  }

  const d = getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  if (options?.pushMensalidades !== false) {
    // Já puxamos a nuvem acima; push autoritativo com getData() fresco evita
    // segundo merge com snapshot antigo apagar ação do responsável.
    await pushOperacionalToCloud(digits, undefined, cid, { authoritative: true });
  }

  if (options?.pushCatalog) {
    const itensCatalogo = getData().produtosInstituicao.filter(
      (p) => p.cooperativaId === cid && p.ativo && p.precoUnitario > 0
    ).length;
    if (itensCatalogo > 0) {
      await pushContratosToCloud(digits, getData(), cid, { authoritative: true });
    }
  }
}

/** Envia contratos + operacional + perfil após alterações locais. */
export async function pushAllCooperativaToCloud(cnpj: string, data?: AppData, coopId?: string): Promise<void> {
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, cnpj);
  const coop = cid ? d.cooperativas.find((c) => c.id === cid) : undefined;

  await Promise.all([
    pushContratosToCloud(cnpj, d, cid, { authoritative: true }),
    pushOperacionalToCloud(cnpj, d, cid),
    coop ? pushCooperativaProfileToCloud(coop) : Promise.resolve(),
  ]);
}

/** Propaga notas pagas para a nuvem após registrar pagamento. */
export async function pushNotasPagasToCloud(cnpj: string, notaIds: string[], data?: AppData): Promise<void> {
  const d = data ?? getData();
  for (const id of notaIds) {
    const nota = d.notasPedido.find((n) => n.id === id);
    if (nota && nota.status === "pago") {
      await patchNotaPedidoInCloud(cnpj, nota);
    }
  }
}
