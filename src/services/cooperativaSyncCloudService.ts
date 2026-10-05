import type { AppData, Cooperativa, Cooperado, Instituicao, ProdutoInstituicao, Desconto, PrestacaoContasExcluida, NotaPedidoExcluida, InstituicaoExcluida, PagamentoCooperadoRegistro, Comunicado, ComunicadoExcluidoRef, LivroCaixaExcluidoRef, LivroCaixaLancamento, FichaCorrida, NotaPedido, VotacaoPauta, VotacaoVoto, ParecerContabilMensal, FechamentoSnapshot, ArquivoMensalCooperado, AjustesFichaMesCooperativa, ValorAvulsoReceber } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { secureApiFetch } from "@/lib/security/clientSession";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { getData, getDataOperationalTruth, saveDataSafe, runWithBatchedSaveAsync } from "@/services/dataStore";
import { syncCooperadosFromCloud, fetchCooperadosFromCloud, pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { syncNotasPedidoFromCloud, patchNotaPedidoInCloud } from "@/services/notaPedidoCloudService";
import { fetchCooperativaByCnpjFromCloud, mergeCooperativaIntoData } from "@/services/cooperativaCloudService";
import { mergeArquivosMensaisFromCloud, reconciliarFichaFromNotasConferidas, dedupeFichaCorridaPorNota, aplicarNotasPedidoExcluidas, idsNotasPedidoExcluidas } from "@/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa, cooperadoMesTemPagamentoNaLista, type RegistroPagamentoResponsavelPatch } from "@/services/pagamentoIntegridadeService";
import {
  mergePagamentosCooperadoFromCloud,
  prepararOperacionalSyncPayloadPagamentosPull,
} from "@/services/pagamentoRegistroMerge";
import { ensureComunicadosAudioUploaded } from "@/services/comunicadoAudioSync";
import { operacionalPushSeguro, precisaReparoFullSyncNotas, cooperadoFinanceiroDesatualizado, cooperadoFichaValoresDesalinhados, limparFichaObsoletaCooperado } from "@/services/fichaSyncGuard";
import { beginCloudSync, endCloudSync } from "@/services/cloudSyncProgress";
import { clearNotasSyncMeta, forceNextFullNotasSync } from "@/services/syncMetaService";
import { sincronizarMensalidadeCooperativa, mensalidadeVisivelNoDispositivo, normalizarMensalidadeCooperadoLocal, mesclarMensalidadesPayloadNuvem, prepararMensalidadesCloud, prepararMensalidadeCloud, reconciliarMensalidadesComCooperadosCloud, mensalidadeCloudEntraNoDispositivo, enriquecerMensalidadeCooperadoSnapshot } from "@/services/mensalidadeService";
import { aplicarPrestacoesContasExcluidas } from "@/services/prestacaoContasService";
import { mergeLivroCaixaControleAnualFromCloud } from "@/services/livroCaixaService";
import { posProcessarFinanceiroLocal } from "@/services/operacionalLocalPostProcess";
import { isConferenciaOperacionalPushScopeActive } from "@/services/conferenciaOperacionalPushScope";
import type { SyncTier } from "@/lib/performance/syncTier";
import { resolveSyncTierPlan84 } from "@/lib/performance/syncPlan84";
import { syncNotasPedidoFromCloudStaffCoalesced } from "@/lib/performance/staffNotasPullCoordinator";
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
  getLastOperacionalPullMergedUpdatedAtMs,
  noteOperacionalPullMergedUpdatedAt,
  setOperacionalCloudAuthoritativeForTests,
  setRestoreLegacyBypassWindowForTests,
} from "@/services/operationalReset";
import {
  operacionalBlobOperacionalLegado,
  operacionalColecaoReplaceDominio,
  operacionalDominioFornecidoNoPayload,
  operacionalSliceArray,
} from "@/services/operacionalMergeSemantics";
import {
  acquireCooperativaSyncSessionLease,
  acquireOperacionalPullLease,
  saveAppDataIfSyncLeaseCurrent,
  type CooperativaSyncSessionLease,
} from "@/services/operacionalPullLease";
import {
  enqueueOperacionalCoordination,
  isOperacionalPushSingleFlightEnabled,
} from "@/services/operacionalPushSingleFlight";
type WithUpdatedAt = { id: string; updatedAt?: string; createdAt?: string };

/** Evita POST operacional repetido na mesma sessão quando o payload não mudou. */
const lastOperacionalPushFingerprint = new Map<string, string>();

/** Somente testes H8.9.62 / H8.9.88 — detectar chamada à API pública de push. */
let pushOperacionalPublicTestEnterHook: (() => void) | null = null;

export function setPushOperacionalPublicTestEnterHookForTests(
  hook: typeof pushOperacionalPublicTestEnterHook
): void {
  pushOperacionalPublicTestEnterHook = hook;
}

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

export type ConfirmarPagamentoCooperadoNaNuvemResult = {
  ok: boolean;
  status: number | null;
  code?: string;
  error?: string;
};

const CONFIRMAR_PAGAMENTO_REDE_ERROR = "Erro de rede ao confirmar pagamento.";
const CONFIRMAR_PAGAMENTO_HTTP_ERROR = "Não foi possível confirmar o pagamento na nuvem.";

/** Extrai status/code/error do Response — sem payload, tokens ou PII. */
export async function confirmarPagamentoCooperadoNaNuvemResultFromResponse(
  res: Response
): Promise<ConfirmarPagamentoCooperadoNaNuvemResult> {
  const status = res.status;
  const ok = res.ok;
  let code: string | undefined;
  let error: string | undefined;
  try {
    const json = (await res.json()) as { code?: unknown; error?: unknown };
    if (typeof json.code === "string" && json.code.trim()) code = json.code.trim();
    if (typeof json.error === "string" && json.error.trim()) error = json.error.trim();
  } catch {
    if (!ok) error = CONFIRMAR_PAGAMENTO_HTTP_ERROR;
  }
  if (!ok && !error) error = CONFIRMAR_PAGAMENTO_HTTP_ERROR;
  return {
    ok,
    status,
    ...(code ? { code } : {}),
    ...(error ? { error } : {}),
  };
}

/** Cooperado publica recibo assinado — não usa push operacional (restrição de gestão). */
export async function confirmarPagamentoCooperadoNaNuvem(
  cnpj: string,
  pagamento: PagamentoCooperadoRegistro
): Promise<ConfirmarPagamentoCooperadoNaNuvemResult> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || pagamento.status !== "confirmado") {
    return { ok: false, status: null, error: CONFIRMAR_PAGAMENTO_HTTP_ERROR };
  }
  try {
    const res = await secureApiFetch("/api/cooperativa-sync/confirmar-pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, pagamento }),
    });
    return await confirmarPagamentoCooperadoNaNuvemResultFromResponse(res);
  } catch {
    return { ok: false, status: null, error: CONFIRMAR_PAGAMENTO_REDE_ERROR };
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

/**
 * Coleções operacionais sem rank semântico próprio (S5).
 * Cloud é base; local vence só se `updatedAt` ≥ cloud no mesmo id.
 * Domínios com regra superior (pagamento, ficha, nota, HB) têm merges dedicados.
 */
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

  const normalizarFichaLocal = (f: FichaCorrida): FichaCorrida => {
    if (fichaPagoLegitima(f)) return f;
    return { ...f, status: "pendente" as const };
  };

  /** Cloud pago: não rebaixar só porque pagamentosCooperado não veio na lista do merge (H8.9.184). */
  const normalizarFichaCloud = (f: FichaCorrida): FichaCorrida =>
    f.status === "pago" ? f : normalizarFichaLocal(f);

  for (const item of cloudItems) map.set(item.id, normalizarFichaCloud(item));
  for (const local of localCoop) {
    const cloud = map.get(local.id);
    if (!cloud) {
      map.set(local.id, normalizarFichaLocal(local));
      continue;
    }
    if (local.status === "pago" && cloud.status === "pendente") {
      map.set(local.id, local);
      continue;
    }
    if (cloud.status === "pago" && local.status === "pendente") {
      map.set(local.id, cloud);
      continue;
    }
    if (local.status === "pago" && cloud.status === "pago") {
      map.set(local.id, itemTime(local) >= itemTime(cloud) ? local : cloud);
      continue;
    }
    const chosen = itemTime(local) >= itemTime(cloud) ? local : cloud;
    map.set(local.id, normalizarFichaLocal(chosen));
  }
  return [...map.values()];
}

/** posProcessar/reparar rebaixa ficha paga sem pg — restaura status pago decidido no merge (H8.9.184). */
function reaplicarFichaPagoMergePosIntegridade(
  antesPosProcessar: AppData,
  depoisPosProcessar: AppData,
  coopId: string
): AppData {
  const pagoAntes = new Map(
    (antesPosProcessar.fichaCorrida ?? [])
      .filter((f) => f.cooperativaId === coopId && f.status === "pago")
      .map((f) => [f.id, f])
  );
  if (!pagoAntes.size) return depoisPosProcessar;
  let changed = false;
  const fichaCorrida = (depoisPosProcessar.fichaCorrida ?? []).map((f) => {
    if (f.cooperativaId !== coopId || f.status !== "pendente") return f;
    const prev = pagoAntes.get(f.id);
    if (!prev) return f;
    changed = true;
    return {
      ...f,
      status: "pago" as const,
      updatedAt: prev.updatedAt ?? f.updatedAt,
    };
  });
  return changed ? { ...depoisPosProcessar, fichaCorrida } : depoisPosProcessar;
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

export { mergePagamentosCooperadoFromCloud } from "@/services/pagamentoRegistroMerge";

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
  const idsNotasExcluidasCoop = idsNotasPedidoExcluidas(sanitized, coopId);
  const fichaCoopDeduped = dedupeFichaCorridaPorNota(
    sanitized.fichaCorrida.filter((f) => f.cooperativaId === coopId),
    sanitized.notasPedido
  );
  const fichaCoop = fichaCoopDeduped.filter(
    (ficha) => !ficha.notaPedidoId || !idsNotasExcluidasCoop.has(ficha.notaPedidoId)
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
    operacionalSnapshotComplete: true,
  };
}

/** Expõe montagem do payload operacional para testes de regressão (H8.9.129). */
export function buildOperacionalPayloadForTests(data: AppData, coopId: string): OperacionalSyncPayload {
  return buildOperacionalPayload(data, coopId);
}

function normalizeCloudOperacional(cloud: OperacionalSyncPayload): OperacionalSyncPayload {
  if (cloud.fullReset === true) return cloud;
  if ((cloud.operationalResetVersion ?? 0) >= OPERATIONAL_RESET_VERSION) return cloud;
  /** S4 — blob legado: não converter domínios ausentes em [] (merge trata como não fornecido). */
  return cloud;
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
    operacionalSnapshotComplete: true,
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

export type FullResetCompletudeVerdict = "allow" | "block" | "indeterminate";

function notaConferidaParaFullResetGuard(nota: NotaPedido): boolean {
  if (nota.status !== "conferida" && nota.status !== "pago") return false;
  if (nota.valorLiquido <= 0 && (nota.itens ?? []).every((i) => i.quantidade <= 0)) return false;
  return true;
}

/** Notas conferidas/pagas usadas na proteção fullReset parcial (POST + merge). */
export function notasConferidasParaFullResetGuard(
  notas: NotaPedido[],
  coopId?: string,
  excludedNotaIds?: Set<string>
): NotaPedido[] {
  return notas.filter((n) => {
    if (excludedNotaIds?.has(n.id)) return false;
    if (coopId && n.cooperativaId !== coopId) return false;
    return notaConferidaParaFullResetGuard(n);
  });
}

function fichaNotaPedidoIds(fichas: FichaCorrida[] | undefined, coopId?: string): Set<string> {
  const ids = new Set<string>();
  for (const f of fichas ?? []) {
    if (!f.notaPedidoId) continue;
    if (coopId && f.cooperativaId && f.cooperativaId !== coopId) continue;
    ids.add(f.notaPedidoId);
  }
  return ids;
}

function operacionalPayloadVazioLegitimo(
  payload: Pick<OperacionalSyncPayload, "fichaCorrida" | "pagamentosCooperado">
): boolean {
  const fichas = payload.fichaCorrida ?? [];
  const pags = payload.pagamentosCooperado ?? [];
  const sumFichas = fichas.reduce((s, f) => s + (f.valorLiquido ?? 0), 0);
  return fichas.length === 0 && pags.length === 0 && sumFichas < 0.01;
}

/** PATCH A — avalia completude de publicação `fullReset` vs notas conferidas conhecidas (identidade por ID). */
export function avaliarFullResetOperacionalCompletude(input: {
  fullReset: boolean;
  payload: Pick<OperacionalSyncPayload, "fichaCorrida" | "pagamentosCooperado">;
  conferidasNotas: NotaPedido[];
  coopId?: string;
  excludedNotaIds?: Set<string>;
}): { verdict: FullResetCompletudeVerdict; motivo: string } {
  if (!input.fullReset) {
    return { verdict: "allow", motivo: "fullReset false" };
  }

  const conferidas = notasConferidasParaFullResetGuard(
    input.conferidasNotas,
    input.coopId,
    input.excludedNotaIds
  );
  const contextIds = new Set(conferidas.map((n) => n.id));
  const payloadFichaIds = fichaNotaPedidoIds(input.payload.fichaCorrida, input.coopId);

  if (contextIds.size === 0) {
    if (operacionalPayloadVazioLegitimo(input.payload)) {
      return { verdict: "allow", motivo: "reset legítimo — payload operacional vazio" };
    }
    return { verdict: "indeterminate", motivo: "indeterminate: sem notas conferidas para comparar" };
  }

  if (operacionalPayloadVazioLegitimo(input.payload)) {
    return { verdict: "allow", motivo: "reset legítimo — payload operacional vazio" };
  }

  const allPayloadInContext = [...payloadFichaIds].every((id) => contextIds.has(id));
  if (!allPayloadInContext) {
    return {
      verdict: "indeterminate",
      motivo: "IDs de ficha não mapeiam ao conjunto conferido (sem equivalência automática)",
    };
  }

  const sameSet =
    contextIds.size === payloadFichaIds.size &&
    [...contextIds].every((id) => payloadFichaIds.has(id));
  if (sameSet) {
    return { verdict: "allow", motivo: "fullReset completo — conjunto de notaPedidoId alinhado" };
  }

  if (payloadFichaIds.size < contextIds.size) {
    return {
      verdict: "block",
      motivo: "fullReset parcial — fichas strict subset das notas conferidas conhecidas",
    };
  }

  return { verdict: "indeterminate", motivo: "cloud/payload superset ou ambíguo" };
}

export type FullResetMergeReconciliarGuard = {
  reconciliarApesarFullReset: boolean;
  motivo: string;
};

/** PATCH B — reconciliar após merge fullReset quando cloud parcial e notas locais sustentam reconstrução. */
export function computeFullResetMergeReconciliarGuard(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  excludedNotaIds: Set<string>
): FullResetMergeReconciliarGuard {
  if (cloud.fullReset !== true) {
    return { reconciliarApesarFullReset: false, motivo: "sem fullReset na nuvem" };
  }

  const conferidas = notasConferidasParaFullResetGuard(data.notasPedido ?? [], coopId, excludedNotaIds);
  const contextIds = new Set(conferidas.map((n) => n.id));
  if (contextIds.size === 0) {
    return { reconciliarApesarFullReset: false, motivo: "indeterminate: notas conferidas locais insuficientes" };
  }

  const cloudFichaIds = fichaNotaPedidoIds(cloud.fichaCorrida, coopId);
  if (cloudFichaIds.size === 0) {
    return { reconciliarApesarFullReset: false, motivo: "cloud operacional vazio — reset legítimo" };
  }

  const allCloudInContext = [...cloudFichaIds].every((id) => contextIds.has(id));
  if (!allCloudInContext) {
    return {
      reconciliarApesarFullReset: false,
      motivo: "indeterminate: fichas cloud com notaPedidoId fora do conjunto conferido local",
    };
  }

  if (cloudFichaIds.size >= contextIds.size) {
    return { reconciliarApesarFullReset: false, motivo: "cloud completo ou superset por IDs — autoritativo" };
  }

  const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
  const maxLocalNotaTime = conferidas.reduce(
    (max, n) => Math.max(max, new Date(n.updatedAt ?? n.dataConferencia ?? 0).getTime()),
    0
  );
  const localCoopFichaIds = fichaNotaPedidoIds(
    (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === coopId || !f.cooperativaId),
    coopId
  );
  const localCoversContext = [...contextIds].every((id) => localCoopFichaIds.has(id));
  if (
    localCoversContext &&
    cloudTime > 0 &&
    maxLocalNotaTime > 0 &&
    cloudTime >= maxLocalNotaTime &&
    cloudFichaIds.size === contextIds.size
  ) {
    return { reconciliarApesarFullReset: false, motivo: "cloud mais recente e completo por IDs" };
  }

  return {
    reconciliarApesarFullReset: true,
    motivo: "cloud fullReset parcial — reconciliar pelas notas conferidas locais",
  };
}

/** H8.14E — pull client: fullReset destrutivo só com prova explícita (não fullReset/versão/vazio isolados). */
export type FullResetOperacionalPullSeguro = {
  permitirClearFinanceiro: boolean;
  permitirCloudAuthoritative: boolean;
  permitirMergeAutoritativo: boolean;
  permitirAplicarResetLegado: boolean;
  motivo: string;
};

/** S1 — replace de coleções operacionais exige snapshot completo ou reset vazio comprovado no pull. */
export function operacionalColecoesReplaceAutoritativo(
  cloudAuthoritative: boolean,
  cloud: OperacionalSyncPayload,
  pullSeguro?: Pick<FullResetOperacionalPullSeguro, "permitirClearFinanceiro">
): boolean {
  if (!cloudAuthoritative) return false;
  if (cloud.operacionalSnapshotComplete === true) return true;
  if (pullSeguro?.permitirClearFinanceiro === true && operacionalPayloadVazioLegitimo(cloud)) {
    return true;
  }
  return false;
}

/** SYNC-001/R1 — clear preemptivo do restore legado só com autoridade S1 (snapshot completo ou reset vazio legítimo). */
export function operacionalRestorePreemptiveClearPermitido(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cnpj?: string
): boolean {
  const pullSeguro = avaliarFullResetOperacionalPullSeguro(data, cloud, coopId, cnpj);
  const cloudAuthoritative = cloud.fullReset === true && pullSeguro.permitirMergeAutoritativo;
  return operacionalColecoesReplaceAutoritativo(cloudAuthoritative, cloud, pullSeguro);
}

/** Testes R1 — trecho restore legado antes do merge (paridade com syncOperacionalFromCloud). */
export function aplicarRestoreLegadoOperacionalForTests(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cnpj: string
): AppData {
  const pullSeguro = avaliarFullResetOperacionalPullSeguro(data, cloud, coopId, cnpj);
  if (!pullSeguro.permitirAplicarResetLegado) return data;
  const permitirPreemptiveClear = operacionalRestorePreemptiveClearPermitido(data, cloud, coopId, cnpj);
  const restoreOpts = { permitirPreemptiveClear };
  setRestoreLegacyBypassWindowForTests(true);
  try {
    let current = data;
    const stale = reapplyCloudOperationalSliceIfStale(current, cnpj, coopId, cloud, restoreOpts);
    if (stale.changed) current = stale.data;
    const reset = applyCloudOperationalResetIfNeeded(current, cnpj, coopId, cloud, restoreOpts);
    if (reset.changed) current = reset.data;
    return current;
  } finally {
    setRestoreLegacyBypassWindowForTests(false);
  }
}

/** Pull operacional in-memory incluindo restore legado + merge canônico. */
export function syncOperacionalPullPipelineForTests(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cnpj: string,
  cloudCooperados: Cooperado[] = []
): { data: AppData; pullSeguro: FullResetOperacionalPullSeguro } {
  const afterRestore = aplicarRestoreLegadoOperacionalForTests(data, cloud, coopId, cnpj);
  return aplicarOperacionalPullLocalForTests(afterRestore, cloud, coopId, cnpj, cloudCooperados);
}

function negarFullResetPullSeguro(motivo: string): FullResetOperacionalPullSeguro {
  return {
    permitirClearFinanceiro: false,
    permitirCloudAuthoritative: false,
    permitirMergeAutoritativo: false,
    permitirAplicarResetLegado: false,
    motivo,
  };
}

export function avaliarFullResetOperacionalPullSeguro(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cnpj?: string
): FullResetOperacionalPullSeguro {
  if (cloud.fullReset !== true) {
    return negarFullResetPullSeguro("sem fullReset na nuvem");
  }

  const digits = cnpj ? normalizeCnpj(cnpj) : "";
  const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
  if (digits.length === 14 && cloudTime > 0) {
    const lastMerged = getLastOperacionalPullMergedUpdatedAtMs(digits);
    if (lastMerged > 0 && cloudTime < lastMerged) {
      return negarFullResetPullSeguro(
        "H814E: payload operacional mais antigo que último merge autoritativo aplicado"
      );
    }
  }

  const excludedNotaIds = idsNotasPedidoExcluidas(data, coopId);
  const completude = avaliarFullResetOperacionalCompletude({
    fullReset: true,
    payload: cloud,
    conferidasNotas: data.notasPedido ?? [],
    coopId,
    excludedNotaIds,
  });

  if (completude.verdict === "block") {
    return negarFullResetPullSeguro(`completude block: ${completude.motivo}`);
  }

  if (completude.verdict === "indeterminate") {
    return negarFullResetPullSeguro(`completude indeterminate: ${completude.motivo}`);
  }

  const conferidas = notasConferidasParaFullResetGuard(data.notasPedido ?? [], coopId, excludedNotaIds);
  const contextIds = new Set(conferidas.map((n) => n.id));

  if (completude.motivo.includes("payload operacional vazio")) {
    if (contextIds.size > 0) {
      return negarFullResetPullSeguro(
        "H814E: operacional vazio com notas conferidas locais — sem prova de completude"
      );
    }
    const cooperadoIds = new Set(
      data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id)
    );
    const localFichaNotaIds = fichaNotaPedidoIds(
      (data.fichaCorrida ?? []).filter((f) => cooperadoIds.has(f.cooperadoId)),
      coopId
    );
    if (localFichaNotaIds.size > 0) {
      return negarFullResetPullSeguro(
        "H814E: operacional vazio com fichas locais — sem prova de completude"
      );
    }
    return {
      permitirClearFinanceiro: true,
      permitirCloudAuthoritative: true,
      permitirMergeAutoritativo: true,
      permitirAplicarResetLegado: true,
      motivo: "reset vazio comprovado — sem conferidas/fichas locais",
    };
  }

  if (completude.motivo.includes("conjunto de notaPedidoId alinhado")) {
    return {
      permitirClearFinanceiro: true,
      permitirCloudAuthoritative: true,
      permitirMergeAutoritativo: true,
      permitirAplicarResetLegado: true,
      motivo: completude.motivo,
    };
  }

  if (completude.motivo.includes("sem notas conferidas para comparar")) {
    return negarFullResetPullSeguro(
      "H814E: sem conferidas para comparar — não destruir financeiro local"
    );
  }

  return negarFullResetPullSeguro(`allow não comprovado: ${completude.motivo}`);
}

export type MergeOperacionalIntoDataOptions = {
  /** Pagamentos locais capturados antes de clear financeiro no pull (S3). */
  localPagamentosCoopBaseline?: PagamentoCooperadoRegistro[];
  /** BIC M6 — interpreta coleções presentes no snapshot operacional (sem modo legado S4). */
  forAuthoritativeCreditBase?: boolean;
};

function prepararOperacionalPullPagamentosMonotonicos(
  pagamentosBaselineCoop: PagamentoCooperadoRegistro[],
  operacional: OperacionalSyncPayload,
  coopId: string,
  pullSeguro: FullResetOperacionalPullSeguro
): {
  operacional: OperacionalSyncPayload;
  mergeOptions?: MergeOperacionalIntoDataOptions;
} {
  const cloudAuthoritativePull =
    operacional.fullReset === true && pullSeguro.permitirMergeAutoritativo;
  const colecoesReplace = operacionalColecoesReplaceAutoritativo(
    cloudAuthoritativePull,
    operacional,
    pullSeguro
  );
  if (colecoesReplace) return { operacional };
  return {
    operacional: prepararOperacionalSyncPayloadPagamentosPull(
      pagamentosBaselineCoop,
      operacional,
      coopId
    ),
    mergeOptions: { localPagamentosCoopBaseline: pagamentosBaselineCoop },
  };
}

/** Testes H8.14E — merge operacional in-memory (sem rede/store). */
export function aplicarOperacionalPullLocalForTests(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cnpj: string,
  cloudCooperados: Cooperado[] = []
): { data: AppData; pullSeguro: FullResetOperacionalPullSeguro } {
  const pullSeguro = avaliarFullResetOperacionalPullSeguro(data, cloud, coopId, cnpj);
  const pagamentosBaseline = data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId);
  let current = data;
  const cloudAuthoritativePull =
    cloud.fullReset === true && pullSeguro.permitirMergeAutoritativo;
  if (
    pullSeguro.permitirClearFinanceiro &&
    operacionalColecoesReplaceAutoritativo(cloudAuthoritativePull, cloud, pullSeguro)
  ) {
    current = clearOperacionalFinanceiroForCooperativa(current, coopId);
  }
  const pullPagamentos = prepararOperacionalPullPagamentosMonotonicos(
    pagamentosBaseline,
    cloud,
    coopId,
    pullSeguro
  );
  const merged = mergeOperacionalIntoData(
    current,
    pullPagamentos.operacional,
    coopId,
    cloudCooperados,
    pullSeguro,
    pullPagamentos.mergeOptions
  );
  if (pullSeguro.permitirCloudAuthoritative) {
    setOperacionalCloudAuthoritativeForTests(cnpj, cloud.operationalResetVersion ?? 15);
  } else {
    setOperacionalCloudAuthoritativeForTests(null);
  }
  return { data: posProcessarFinanceiroLocal(merged, cnpj), pullSeguro };
}

export function mergeOperacionalIntoData(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cloudCooperados: Cooperado[] = [],
  pullSeguro?: FullResetOperacionalPullSeguro,
  mergeOptions?: MergeOperacionalIntoDataOptions
): AppData {
  const rawCloud = cloud;
  const legacyIgnorarDominios = mergeOptions?.forAuthoritativeCreditBase
    ? false
    : operacionalBlobOperacionalLegado(rawCloud);
  cloud = normalizeCloudOperacional(cloud);
  const dominioFornecido = (key: string) =>
    operacionalDominioFornecidoNoPayload(rawCloud, key, {
      legacyIgnorarTodosDominios: legacyIgnorarDominios,
    });
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));

  const resolvedPullSeguro =
    pullSeguro ?? avaliarFullResetOperacionalPullSeguro(data, cloud, coopId);

  const mensalidadesLocaisVisiveis = data.mensalidades
    .filter((m) => mensalidadeVisivelNoDispositivo(data, m, coopId))
    .map((m) => normalizarMensalidadeCooperadoLocal(data, m, coopId));
  const mensalidadesCloudVisiveis = dominioFornecido("mensalidades")
    ? (cloud.mensalidades ?? [])
        .filter((raw) => mensalidadeCloudEntraNoDispositivo(data, raw, coopId, cloudCooperados))
        .map((raw) => prepararMensalidadeCloud(data, raw, coopId, cloudCooperados))
    : [];

  const cloudArquivos = operacionalSliceArray<ArquivoMensalCooperado>(
    rawCloud,
    "arquivosMensais",
    cloud,
    legacyIgnorarDominios
  ).map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudAjustes = operacionalSliceArray<AjustesFichaMesCooperativa>(
    rawCloud,
    "ajustesFichaMes",
    cloud,
    legacyIgnorarDominios
  ).map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudPagamentos = (dominioFornecido("pagamentosCooperado")
    ? cloud.pagamentosCooperado ?? []
    : []
  ).map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudComunicados = operacionalSliceArray<Comunicado>(
    rawCloud,
    "comunicados",
    cloud,
    legacyIgnorarDominios
  ).map((c) => ({ ...c, cooperativaId: coopId }));
  const cloudDescontos = dominioFornecido("descontos")
    ? (cloud.descontos ?? []).filter((d) => cooperadoIds.has(d.cooperadoId))
    : [];
  const cloudAvulsos = operacionalSliceArray<ValorAvulsoReceber>(
    rawCloud,
    "valoresAvulsosReceber",
    cloud,
    legacyIgnorarDominios
  ).map((v) => ({ ...v, cooperativaId: coopId }));
  const cloudLivro = operacionalSliceArray<LivroCaixaLancamento>(
    rawCloud,
    "livroCaixa",
    cloud,
    legacyIgnorarDominios
  ).map((l) => ({ ...l, cooperativaId: coopId }));
  const cloudLivroControle = (cloud.livroCaixaControleAnual ?? []).find((c) => c.cooperativaId === coopId);
  const localLivroControle = (data.livroCaixaControleAnual ?? []).find((c) => c.cooperativaId === coopId);
  const mergedLivroControle = mergeLivroCaixaControleAnualFromCloud(localLivroControle, cloudLivroControle);
  const cloudExcluidasNotas = operacionalSliceArray<NotaPedidoExcluida>(
    rawCloud,
    "notasPedidoExcluidas",
    cloud,
    legacyIgnorarDominios
  ).map((e) => ({ ...e, cooperativaId: coopId }));
  const mergedNotasExcluidasCoop = mergeNotasPedidoExcluidasByNewer(
    (data.notasPedidoExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidasNotas
  );
  const cloudExcluidas = operacionalSliceArray<PrestacaoContasExcluida>(
    rawCloud,
    "prestacoesContasExcluidas",
    cloud,
    legacyIgnorarDominios
  ).map((e) => ({ ...e, cooperativaId: coopId }));
  const cloudFichas = dominioFornecido("fichaCorrida")
    ? (cloud.fichaCorrida ?? []).map((f) => ({ ...f, cooperativaId: coopId }))
    : [];
  const cloudPautas = operacionalSliceArray<VotacaoPauta>(rawCloud, "votacaoPautas", cloud, legacyIgnorarDominios).map(
    (p) => ({ ...p, cooperativaId: coopId })
  );
  const cloudVotos = operacionalSliceArray<VotacaoVoto>(rawCloud, "votacaoVotos", cloud, legacyIgnorarDominios).map(
    (v) => ({ ...v, cooperativaId: coopId })
  );
  const cloudPareceres = operacionalSliceArray<ParecerContabilMensal>(
    rawCloud,
    "pareceresContabeis",
    cloud,
    legacyIgnorarDominios
  ).map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudSnapshots = operacionalSliceArray<FechamentoSnapshot>(
    rawCloud,
    "fechamentoSnapshots",
    cloud,
    legacyIgnorarDominios
  ).map((s) => ({ ...s, cooperativaId: coopId }));
  const mergedExcluidasCoop = mergePrestacoesExcluidasByNewer(
    (data.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidas
  );
  const prestacoesExcluidasIds = new Set(mergedExcluidasCoop.map((e) => e.id));
  const cloudPrest = dominioFornecido("prestacoesContas")
    ? (cloud.prestacoesContas ?? [])
        .map((p) => ({ ...p, cooperativaId: coopId }))
        .filter((p) => !prestacoesExcluidasIds.has(p.id))
    : [];
  const localPrestCoop = (data.prestacoesContas ?? [])
    .filter((p) => p.cooperativaId === coopId && !prestacoesExcluidasIds.has(p.id));

  const filterCoop = <T extends { cooperativaId?: string; cooperadoId?: string }>(
    items: T[],
    isCoop: (i: T) => boolean
  ) => items.filter((i) => !isCoop(i));

  const cloudSyncTime = cloud.updatedAt;
  const cloudAuthoritative =
    cloud.fullReset === true && resolvedPullSeguro.permitirMergeAutoritativo;
  const colecoesReplace = operacionalColecoesReplaceAutoritativo(
    cloudAuthoritative,
    cloud,
    resolvedPullSeguro
  );
  const localPagBaseline =
    !colecoesReplace && mergeOptions?.localPagamentosCoopBaseline?.length
      ? mergeOptions.localPagamentosCoopBaseline
      : undefined;
  const localPagCoop = (localPagBaseline ?? data.pagamentosCooperado).filter(
    (p) => p.cooperativaId === coopId
  );
  const mergedPagamentosCoop = dominioFornecido("pagamentosCooperado")
    ? mergePagamentosCooperadoFromCloud(localPagCoop, cloudPagamentos)
    : localPagCoop;

  const replaceArquivos = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "arquivosMensais",
    legacyIgnorarDominios
  );
  const replaceAjustes = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "ajustesFichaMes",
    legacyIgnorarDominios
  );
  const replaceComunicados = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "comunicados",
    legacyIgnorarDominios
  );
  const replaceMensalidades = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "mensalidades",
    legacyIgnorarDominios
  );
  const replaceDescontos = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "descontos",
    legacyIgnorarDominios
  );
  const replaceAvulsos = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "valoresAvulsosReceber",
    legacyIgnorarDominios
  );
  const replaceLivro = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "livroCaixa",
    legacyIgnorarDominios
  );
  const replacePrest = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "prestacoesContas",
    legacyIgnorarDominios
  );
  const replacePrestExcl = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "prestacoesContasExcluidas",
    legacyIgnorarDominios
  );
  const replaceNotasExcl = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "notasPedidoExcluidas",
    legacyIgnorarDominios
  );
  const replacePautas = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "votacaoPautas",
    legacyIgnorarDominios
  );
  const replaceVotos = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "votacaoVotos",
    legacyIgnorarDominios
  );
  const replacePareceres = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "pareceresContabeis",
    legacyIgnorarDominios
  );
  const replaceSnapshots = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "fechamentoSnapshots",
    legacyIgnorarDominios
  );

  const localPautasCoop = (data.votacaoPautas ?? []).filter((p) => p.cooperativaId === coopId);
  const localVotosCoop = (data.votacaoVotos ?? []).filter((v) => v.cooperativaId === coopId);
  const mergedPautasCoop = replacePautas
    ? cloudPautas
    : !dominioFornecido("votacaoPautas")
      ? localPautasCoop
      : mergeVotacaoPautasFromCloud(localPautasCoop, cloudPautas);
  const mergedVotosCoop = replaceVotos
    ? cloudVotos
    : !dominioFornecido("votacaoVotos")
      ? localVotosCoop
      : mergeVotacaoVotosFromCloud(localVotosCoop, cloudVotos, mergedPautasCoop);

  const cloudComunicadosExcluidos = operacionalSliceArray<ComunicadoExcluidoRef>(
    rawCloud,
    "comunicadosExcluidos",
    cloud,
    legacyIgnorarDominios
  ).map((e) => ({
    ...e,
    cooperativaId: e.cooperativaId ?? coopId,
  }));
  const replaceComunicadosExcl = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "comunicadosExcluidos",
    legacyIgnorarDominios
  );
  const mergedComunicadosExcluidosCoop = replaceComunicadosExcl
    ? cloudComunicadosExcluidos
    : !dominioFornecido("comunicadosExcluidos")
      ? (data.comunicadosExcluidos ?? []).filter((e) => !e.cooperativaId || e.cooperativaId === coopId)
      : mergeComunicadosExcluidosFromCloud(
          (data.comunicadosExcluidos ?? []).filter((e) => !e.cooperativaId || e.cooperativaId === coopId),
          cloudComunicadosExcluidos
        );
  const comunicadosExcluidosSet = new Set(mergedComunicadosExcluidosCoop.map((e) => e.id));

  const cloudLivroCaixaExcluidos = operacionalSliceArray<LivroCaixaExcluidoRef>(
    rawCloud,
    "livroCaixaExcluidos",
    cloud,
    legacyIgnorarDominios
  ).map((e) => ({
    ...e,
    cooperativaId: e.cooperativaId ?? coopId,
  }));
  const replaceLivroExcl = operacionalColecaoReplaceDominio(
    colecoesReplace,
    rawCloud,
    "livroCaixaExcluidos",
    legacyIgnorarDominios
  );
  const mergedLivroCaixaExcluidosCoop = replaceLivroExcl
    ? cloudLivroCaixaExcluidos
    : !dominioFornecido("livroCaixaExcluidos")
      ? (data.livroCaixaExcluidos ?? []).filter((e) => !e.cooperativaId || e.cooperativaId === coopId)
      : mergeLivroCaixaExcluidosFromCloud(
          (data.livroCaixaExcluidos ?? []).filter((e) => !e.cooperativaId || e.cooperativaId === coopId),
          cloudLivroCaixaExcluidos
        );
  const livroCaixaExcluidosSet = new Set(mergedLivroCaixaExcluidosCoop.map((e) => e.id));

  const notasExcluidasCoopEffectivas = replaceNotasExcl
    ? cloudExcluidasNotas
    : !dominioFornecido("notasPedidoExcluidas")
      ? (data.notasPedidoExcluidas ?? []).filter((e) => e.cooperativaId === coopId)
      : mergedNotasExcluidasCoop;
  const idsNotasExcluidasCoopMerge = idsNotasPedidoExcluidas(
    { notasPedidoExcluidas: notasExcluidasCoopEffectivas } as AppData,
    coopId
  );
  const fichaEntraNoMergeOperacional = (f: FichaCorrida) =>
    !f.notaPedidoId || !idsNotasExcluidasCoopMerge.has(f.notaPedidoId);

  const fullResetMergeReconciliarGuard = computeFullResetMergeReconciliarGuard(
    data,
    cloud,
    coopId,
    idsNotasExcluidasCoopMerge
  );
  const reconciliarGuard =
    cloud.fullReset === true && !resolvedPullSeguro.permitirMergeAutoritativo
      ? {
          reconciliarApesarFullReset: true,
          motivo: "H814E: fullReset sem completude — reconciliar para preservar fichas locais",
        }
      : fullResetMergeReconciliarGuard;

  let next: AppData = {
    ...data,
    arquivosMensais: [
      ...filterCoop(data.arquivosMensais, (a) => a.cooperativaId === coopId),
      ...(replaceArquivos
        ? cloudArquivos
        : !dominioFornecido("arquivosMensais")
          ? data.arquivosMensais.filter((a) => a.cooperativaId === coopId)
          : mergeArquivosMensaisFromCloud(
              data,
              data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
              cloudArquivos
            )),
    ],
    ajustesFichaMes: [
      ...filterCoop(data.ajustesFichaMes ?? [], (a) => a.cooperativaId === coopId),
      ...(replaceAjustes
        ? cloudAjustes
        : !dominioFornecido("ajustesFichaMes")
          ? (data.ajustesFichaMes ?? []).filter((a) => a.cooperativaId === coopId)
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
      ...(replaceComunicados
        ? cloudComunicados.filter((c) => !comunicadosExcluidosSet.has(c.id))
        : !dominioFornecido("comunicados")
          ? data.comunicados.filter((c) => c.cooperativaId === coopId)
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
      ...(replaceMensalidades
        ? mensalidadesCloudVisiveis
        : !dominioFornecido("mensalidades")
          ? mensalidadesLocaisVisiveis
          : mergeOperacionalArrayFromCloud(
              mensalidadesLocaisVisiveis,
              mensalidadesCloudVisiveis,
              cloudSyncTime
            )),
    ],
    descontos: [
      ...data.descontos.filter((d) => !cooperadoIds.has(d.cooperadoId)),
      ...(replaceDescontos
        ? cloudDescontos
        : !dominioFornecido("descontos")
          ? data.descontos.filter((d) => cooperadoIds.has(d.cooperadoId))
          : mergeOperacionalArrayFromCloud(
              data.descontos.filter((d) => cooperadoIds.has(d.cooperadoId)),
              cloudDescontos,
              cloudSyncTime
            )),
    ],
    valoresAvulsosReceber: [
      ...filterCoop(data.valoresAvulsosReceber ?? [], (v) => v.cooperativaId === coopId),
      ...(replaceAvulsos
        ? cloudAvulsos
        : !dominioFornecido("valoresAvulsosReceber")
          ? (data.valoresAvulsosReceber ?? []).filter((v) => v.cooperativaId === coopId)
          : mergeOperacionalArrayFromCloud(
              (data.valoresAvulsosReceber ?? []).filter((v) => v.cooperativaId === coopId),
              cloudAvulsos,
              cloudSyncTime
            )),
    ],
    livroCaixa: [
      ...filterCoop(data.livroCaixa ?? [], (l) => l.cooperativaId === coopId),
      ...(replaceLivro
        ? cloudLivro.filter((l) => !livroCaixaExcluidosSet.has(l.id))
        : !dominioFornecido("livroCaixa")
          ? (data.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId)
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
      ...(replacePrest
        ? cloudPrest.filter((p) => !prestacoesExcluidasIds.has(p.id))
        : !dominioFornecido("prestacoesContas")
          ? localPrestCoop
          : mergeOperacionalArrayFromCloud(localPrestCoop, cloudPrest, cloudSyncTime).filter(
              (p) => !prestacoesExcluidasIds.has(p.id)
            )),
    ],
    prestacoesContasExcluidas: [
      ...filterCoop(data.prestacoesContasExcluidas ?? [], (e) => e.cooperativaId === coopId),
      ...(replacePrestExcl
        ? cloudExcluidas
        : !dominioFornecido("prestacoesContasExcluidas")
          ? (data.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId)
          : mergedExcluidasCoop),
    ],
    notasPedidoExcluidas: [
      ...filterCoop(data.notasPedidoExcluidas ?? [], (e) => e.cooperativaId === coopId),
      ...(replaceNotasExcl ? cloudExcluidasNotas : notasExcluidasCoopEffectivas),
    ],
    fichaCorrida: dominioFornecido("fichaCorrida")
      ? dedupeFichaCorridaPorNota(
          [
            ...filterCoop(data.fichaCorrida ?? [], (f) => f.cooperativaId === coopId),
            ...(cloudAuthoritative
              ? mergeFichaCorridaFromCloud(
                  (data.fichaCorrida ?? [])
                    .filter((f) => f.cooperativaId === coopId)
                    .filter(fichaEntraNoMergeOperacional),
                  cloudFichas.filter(fichaEntraNoMergeOperacional),
                  mergedPagamentosCoop
                )
              : mergeFichaCorridaFromCloud(
                  (data.fichaCorrida ?? [])
                    .filter((f) => f.cooperativaId === coopId)
                    .filter(fichaEntraNoMergeOperacional),
                  cloudFichas.filter(fichaEntraNoMergeOperacional),
                  [...localPagCoop, ...cloudPagamentos]
                )),
          ],
          data.notasPedido
        )
      : dedupeFichaCorridaPorNota(
          (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === coopId),
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
      ...(replacePareceres
        ? cloudPareceres
        : !dominioFornecido("pareceresContabeis")
          ? (data.pareceresContabeis ?? []).filter((p) => p.cooperativaId === coopId)
          : mergePareceresContabeisFromCloud(
              (data.pareceresContabeis ?? []).filter((p) => p.cooperativaId === coopId),
              cloudPareceres
            )),
    ],
    fechamentoSnapshots: [
      ...filterCoop(data.fechamentoSnapshots ?? [], (s) => s.cooperativaId === coopId),
      ...(replaceSnapshots
        ? cloudSnapshots
        : !dominioFornecido("fechamentoSnapshots")
          ? (data.fechamentoSnapshots ?? []).filter((s) => s.cooperativaId === coopId)
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

  const posMergeFinanceiro = (draft: AppData): AppData => {
    const runReconciliar =
      !colecoesReplace || reconciliarGuard.reconciliarApesarFullReset;
    const pos = runReconciliar
      ? posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(draft))
      : posProcessarIntegridadePagamentosCooperativa(draft);
    return reaplicarFichaPagoMergePosIntegridade(draft, pos, coopId);
  };

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
  options?: {
    authoritative?: boolean;
    skipOperationalResetPush?: boolean;
    forceOperacionalPush?: boolean;
    /** Evita N POST /api/cooperados antes do operacional (conferência / notas). */
    skipBulkCooperadosCloudPush?: boolean;
  }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  pushOperacionalPublicTestEnterHook?.();
  if (!isOperacionalPushSingleFlightEnabled()) {
    return pushOperacionalToCloudInternal(cnpj, data, coopId, options);
  }
  return enqueueOperacionalCoordination(digits, () =>
    pushOperacionalToCloudInternal(cnpj, data, coopId, options)
  );
}

/** Push autoritativo pós-conferência: getData() usa view scoped e omitia fichas já conferidas (ex.: após reload). */
function dataBaselineForOperacionalPush(explicit: AppData | undefined, authoritative: boolean | undefined): AppData {
  if (authoritative) return getDataOperationalTruth();
  return explicit ?? getData();
}

function relreadDataForOperacionalPush(authoritative: boolean | undefined): AppData {
  return authoritative ? getDataOperationalTruth() : getData();
}

/** Corpo operacional (POST, dedupe, merge). Não chama a API pública nem `enqueueOperacionalPush`. */
export async function pushOperacionalToCloudInternal(
  cnpj: string,
  data?: AppData,
  coopId?: string,
  options?: {
    authoritative?: boolean;
    skipOperationalResetPush?: boolean;
    forceOperacionalPush?: boolean;
    skipBulkCooperadosCloudPush?: boolean;
  }
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

  const authoritativePush = options?.authoritative === true;
  const readPushData = () => relreadDataForOperacionalPush(authoritativePush);

  // Snapshot inicial só para resolver CNPJ/coop; após awaits reler baseline do push.
  const seed = dataBaselineForOperacionalPush(data, authoritativePush);
  const cid = coopId ?? resolveCoopId(seed, digits);
  if (!cid) return;

  await ensureComunicadosAudioUploaded(digits, cid, readPushData()).catch(() => {});

  bundle = await fetchSyncBundle(digits);
  let cloudCooperados: Cooperado[] = (await fetchCooperadosFromCloud(digits)).cooperados;

  const fresh = aplicarPrestacoesContasExcluidas(readPushData());
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
  const skipBulkCooperados =
    options?.skipBulkCooperadosCloudPush === true || isConferenciaOperacionalPushScopeActive();
  if (!skipBulkCooperados) {
    await Promise.all(cooperadosCoop.map((c) => pushCooperadoToCloud(digits, c)));
  }

  // Após awaits dos cooperados, reler de novo e remontar payload se o responsável
  // salvou algo nesse intervalo — evita last-write-wins com blob antigo.
  const afterPushCoop = aplicarPrestacoesContasExcluidas(readPushData());
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
      console.warn(
        "[operacional-push]",
        res.status,
        json.code ?? "",
        json.error ?? res.statusText
      );
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
    const patch: Record<string, unknown> = {
      nome: cooperativa.nome,
      endereco: cooperativa.endereco,
      telefone: cooperativa.telefone,
      responsavel: cooperativa.responsavel,
      email: cooperativa.email,
      mensalidadeConfig: cooperativa.mensalidadeConfig,
    };
    /** Só altera senha de cadastro na nuvem quando o perfil enviou texto (nova/remoção); omitir não apaga o hash. */
    if (typeof cooperativa.senhaCadastroCooperado === "string") {
      patch.senhaCadastroCooperado = cooperativa.senhaCadastroCooperado.trim();
    }
    if (cooperativa.senhaAreaAdminHash?.trim()) {
      patch.senhaAreaAdminHash = cooperativa.senhaAreaAdminHash.trim();
    }
    await secureApiFetch(`/api/cooperativas/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
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

export type CooperadoOperacionalPullCode =
  | "ok"
  | "invalid_cnpj"
  | "fetch_failed"
  | "no_operacional"
  | "no_coop_id"
  | "stale_discarded";

export type SyncOperacionalFromCloudResult = {
  ok: boolean;
  code: CooperadoOperacionalPullCode;
  /** Pagamentos da cooperativa no AppData após tentativa (0 se não persistiu). */
  pagamentosCoopCount: number;
};

function countPagamentosCooperativa(data: AppData, coopId: string): number {
  return (data.pagamentosCooperado ?? []).filter((p) => p.cooperativaId === coopId).length;
}

function countPagamentosCooperativaCloud(
  operacional: OperacionalSyncPayload,
  coopId: string
): number {
  return (operacional.pagamentosCooperado ?? []).filter(
    (p) => !p.cooperativaId || p.cooperativaId === coopId
  ).length;
}

/** Diagnóstico cooperado: nuvem tinha pagamentos e local ficou vazio após merge+save. */
export function detectCooperadoPagamentosNaoMaterializados(
  coopId: string,
  operacional: OperacionalSyncPayload,
  data: AppData
): boolean {
  const cloudN = countPagamentosCooperativaCloud(operacional, coopId);
  const localN = countPagamentosCooperativa(data, coopId);
  return cloudN > 0 && localN === 0;
}

export async function syncOperacionalFromCloud(
  cnpj: string,
  opts?: { sessionLease?: CooperativaSyncSessionLease }
): Promise<SyncOperacionalFromCloudResult> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) {
    return { ok: false, code: "invalid_cnpj", pagamentosCoopCount: 0 };
  }

  const pullLease = opts?.sessionLease ?? acquireOperacionalPullLease(digits);
  const bundle = await fetchSyncBundle(digits);
  if (!bundle) {
    return { ok: false, code: "fetch_failed", pagamentosCoopCount: 0 };
  }
  if (!bundle.operacional) {
    return { ok: false, code: "no_operacional", pagamentosCoopCount: 0 };
  }
  let current = getData();
  const coopId = resolveCoopId(current, digits);
  if (!coopId) {
    return { ok: false, code: "no_coop_id", pagamentosCoopCount: 0 };
  }

  const pullSeguro = avaliarFullResetOperacionalPullSeguro(
    current,
    bundle.operacional,
    coopId,
    cnpj
  );

  const pagamentosBaseline = current.pagamentosCooperado.filter((p) => p.cooperativaId === coopId);

  if (pullSeguro.permitirAplicarResetLegado) {
    const permitirPreemptiveClear = operacionalRestorePreemptiveClearPermitido(
      current,
      bundle.operacional,
      coopId,
      cnpj
    );
    const restoreOpts = { permitirPreemptiveClear };
    const stale = reapplyCloudOperationalSliceIfStale(
      current,
      cnpj,
      coopId,
      bundle.operacional,
      restoreOpts
    );
    if (stale.changed) current = stale.data;

    const reset = applyCloudOperationalResetIfNeeded(
      current,
      cnpj,
      coopId,
      bundle.operacional,
      restoreOpts
    );
    if (reset.changed) current = reset.data;
  }

  const cloudAuthoritativePull =
    bundle.operacional.fullReset === true && pullSeguro.permitirMergeAutoritativo;
  if (
    pullSeguro.permitirClearFinanceiro &&
    cloudOperacionalRestoreAtivo(bundle.operacional) &&
    operacionalColecoesReplaceAutoritativo(
      cloudAuthoritativePull,
      bundle.operacional,
      pullSeguro
    )
  ) {
    current = clearOperacionalFinanceiroForCooperativa(current, coopId);
  }

  const cloudCooperados = (await fetchCooperadosFromCloud(cnpj)).cooperados;
  const pullPagamentos = prepararOperacionalPullPagamentosMonotonicos(
    pagamentosBaseline,
    bundle.operacional,
    coopId,
    pullSeguro
  );
  const merged = mergeOperacionalIntoData(
    current,
    pullPagamentos.operacional,
    coopId,
    cloudCooperados,
    pullSeguro,
    pullPagamentos.mergeOptions
  );
  if (!pullLease.isCurrent()) {
    console.info("[OPERACIONAL_PULL] resultado obsoleto descartado", {
      cnpj: pullLease.cnpj,
      generation: pullLease.generation,
    });
    return {
      ok: true,
      code: "stale_discarded",
      pagamentosCoopCount: countPagamentosCooperativa(getData(), coopId),
    };
  }

  saveDataSafe(merged);
  const after = getData();
  if (detectCooperadoPagamentosNaoMaterializados(coopId, bundle.operacional, after)) {
    console.warn("[COOP_FIN_SYNC] pagamentos da nuvem não materializados no AppData após merge", {
      cnpj: digits,
      coopId,
      cloudPagamentos: countPagamentosCooperativaCloud(bundle.operacional, coopId),
    });
  }
  if (pullSeguro.permitirCloudAuthoritative && cloudOperacionalRestoreAtivo(bundle.operacional)) {
    markOperacionalCloudAuthoritative(digits, bundle.operacional.operationalResetVersion ?? 1);
    noteOperacionalPullMergedUpdatedAt(digits, bundle.operacional.updatedAt);
  } else {
    clearOperacionalCloudAuthoritative(digits);
  }
  return {
    ok: true,
    code: "ok",
    pagamentosCoopCount: countPagamentosCooperativa(after, coopId),
  };
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
  preferredCoopId?: string,
  sessionLease?: CooperativaSyncSessionLease
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;

  const bundle = await fetchSyncBundle(digits);
  if (!bundle?.operacional?.fullReset) return false;

  const current = getData();
  const coopId = preferredCoopId ?? resolveCoopId(current, digits);
  if (!coopId) return false;

  const pullSeguro = avaliarFullResetOperacionalPullSeguro(
    current,
    bundle.operacional,
    coopId,
    digits
  );
  if (!pullSeguro.permitirAplicarResetLegado) return false;

  let working = current;
  const permitirPreemptiveClear = operacionalRestorePreemptiveClearPermitido(
    working,
    bundle.operacional,
    coopId,
    digits
  );
  const restoreOpts = { permitirPreemptiveClear };
  const stale = reapplyCloudOperationalSliceIfStale(
    working,
    digits,
    coopId,
    bundle.operacional,
    restoreOpts
  );
  if (stale.changed) working = stale.data;

  const reset = applyCloudOperationalResetIfNeeded(
    working,
    digits,
    coopId,
    bundle.operacional,
    restoreOpts
  );
  if (reset.changed || stale.changed) {
    saveAppDataIfSyncLeaseCurrent(sessionLease, reset.changed ? reset.data : working);
    return true;
  }

  return false;
}

export type SyncCooperativaBackgroundOpts = {
  sessionLease?: CooperativaSyncSessionLease;
};

/** Sync leve em background (cooperado no celular): perfil, cooperados, notas e operacional. */
export async function syncCooperativaBackground(
  cnpj: string,
  preferredCoopId?: string,
  cooperadoId?: string,
  opts?: SyncCooperativaBackgroundOpts
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  const session = opts?.sessionLease ?? acquireCooperativaSyncSessionLease(digits);

  beginCloudSync();
  try {
    await ensureCloudOperationalResetApplied(digits, preferredCoopId, session);

    const bundleHint = await fetchSyncBundle(digits);
    const restoreAtivo = cloudOperacionalRestoreAtivo(bundleHint?.operacional);

    await runWithBatchedSaveAsync(
      async () => {
        await syncCooperativaProfileFromCloud(digits);
        const coopId = preferredCoopId ?? resolveCoopId(getData(), digits);
        await syncCooperadosFromCloud(digits, coopId);
        const notasOpts = { sessionLease: session };
        if (restoreAtivo) {
          await syncOperacionalFromCloud(digits, { sessionLease: session });
          await syncNotasPedidoFromCloud(digits, notasOpts);
        } else {
          await syncNotasPedidoFromCloud(digits, notasOpts);
          await syncOperacionalFromCloud(digits, { sessionLease: session });
        }
        await syncContratosFromCloud(digits);
        const operacionalCloud = (await fetchSyncBundle(digits))?.operacional ?? null;
        if (coopId && !isOperacionalCloudAuthoritative(digits)) {
          await repararIntegridadeFichaNotas(digits, coopId, cooperadoId, { sessionLease: session });
        }
        saveAppDataIfSyncLeaseCurrent(
          session,
          finalizeOperacionalPullLocalState(getData(), operacionalCloud, digits)
        );
        if (cooperadoId && coopId) {
          const after = getData();
          const limpo = limparFichaObsoletaCooperado(after, cooperadoId, coopId);
          if (limpo !== after) saveAppDataIfSyncLeaseCurrent(session, limpo);
        }
      },
      { shouldPersistBatch: () => session.isCurrent() }
    );
  } finally {
    endCloudSync();
  }
}

/**
 * Cooperado tocou «Atualizar»: ficha/notas/perfil sem contratos (mais rápido que background completo).
 */
export async function syncCooperadoAtualizarFromCloud(
  cnpj: string,
  preferredCoopId: string,
  cooperadoId: string,
  opts?: SyncCooperativaBackgroundOpts
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  const session = opts?.sessionLease ?? acquireCooperativaSyncSessionLease(digits);

  beginCloudSync();
  try {
    await ensureCloudOperationalResetApplied(digits, preferredCoopId, session);

    const bundleHint = await fetchSyncBundle(digits);
    const restoreAtivo = cloudOperacionalRestoreAtivo(bundleHint?.operacional);

    await runWithBatchedSaveAsync(
      async () => {
        await syncCooperativaProfileFromCloud(digits);
        await syncCooperadosFromCloud(digits, preferredCoopId);
        const notasOpts = { sessionLease: session };
        if (restoreAtivo) {
          await syncOperacionalFromCloud(digits, { sessionLease: session });
          await syncNotasPedidoFromCloud(digits, notasOpts);
        } else {
          await syncNotasPedidoFromCloud(digits, notasOpts);
          await syncOperacionalFromCloud(digits, { sessionLease: session });
        }
        const operacionalCloud =
          bundleHint?.operacional ?? (await fetchSyncBundle(digits))?.operacional ?? null;
        if (!isOperacionalCloudAuthoritative(digits)) {
          await repararIntegridadeFichaNotas(digits, preferredCoopId, cooperadoId, {
            sessionLease: session,
          });
        }
        saveAppDataIfSyncLeaseCurrent(
          session,
          finalizeOperacionalPullLocalState(getData(), operacionalCloud, digits)
        );
        const after = getData();
        const limpo = limparFichaObsoletaCooperado(after, cooperadoId, preferredCoopId);
        if (limpo !== after) saveAppDataIfSyncLeaseCurrent(session, limpo);
      },
      { shouldPersistBatch: () => session.isCurrent() }
    );
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
  cooperadoId?: string,
  opts?: { sessionLease?: CooperativaSyncSessionLease }
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
  await syncNotasPedidoFromCloud(digits, { retryFull: true, sessionLease: opts?.sessionLease });
  await syncOperacionalFromCloud(digits, { sessionLease: opts?.sessionLease });
  saveAppDataIfSyncLeaseCurrent(opts?.sessionLease, posProcessarFinanceiroLocal(getData(), digits));
  return true;
}

/**
 * Recuperação agressiva quando o cooperado abre o app sem ficha nem notas locais.
 */
export async function ensureCooperadoFinanceiroFromCloud(
  cnpj: string,
  cooperativaId: string,
  cooperadoId: string,
  opts?: { sessionLease?: CooperativaSyncSessionLease }
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;

  let data = getData();
  const limpoInicial = limparFichaObsoletaCooperado(data, cooperadoId, cooperativaId);
  if (limpoInicial !== data) {
    saveAppDataIfSyncLeaseCurrent(opts?.sessionLease, limpoInicial);
    data = getData();
  }
  if (cooperadoFichaValoresDesalinhados(data, cooperadoId, cooperativaId)) {
    if (!isOperacionalCloudAuthoritative(digits)) {
      saveAppDataIfSyncLeaseCurrent(opts?.sessionLease, posProcessarFinanceiroLocal(data, digits));
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
    await syncNotasPedidoFromCloud(digits, { retryFull: true, sessionLease: opts?.sessionLease });
    await syncOperacionalFromCloud(digits, { sessionLease: opts?.sessionLease });
    saveAppDataIfSyncLeaseCurrent(opts?.sessionLease, posProcessarFinanceiroLocal(getData(), digits));

    data = getData();
    if (
      !isOperacionalCloudAuthoritative(digits) &&
      cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId)
    ) {
      await repararIntegridadeFichaNotas(digits, cooperativaId, cooperadoId, opts);
    }
    data = getData();
    const limpoFinal = limparFichaObsoletaCooperado(data, cooperadoId, cooperativaId);
    if (limpoFinal !== data) saveAppDataIfSyncLeaseCurrent(opts?.sessionLease, limpoFinal);
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
 * HX 8.4 — pull parcial da gestão conforme tier (sem push autoritativo).
 */
export async function syncStaffTieredPullFromCloud(
  cnpj: string,
  coopId: string | undefined,
  tier: SyncTier
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const plan = resolveSyncTierPlan84(tier, "staff");
  if (plan.bidirectionalFull) {
    await syncCooperativaBidirectionalInternal(cnpj, coopId);
    return;
  }

  await ensureCloudOperationalResetApplied(digits, coopId);

  await runWithBatchedSaveAsync(async () => {
    if (plan.pullProfile) await syncCooperativaProfileFromCloud(digits);
    const cid = coopId ?? resolveCoopId(getData(), digits);
    if (plan.pullCooperados && cid) await syncCooperadosFromCloud(digits, cid);
    if (plan.pullOperacional) await syncOperacionalFromCloud(digits);
    if (plan.pullContratos) await syncContratosFromCloud(digits);
    if (plan.pullNotas) await syncNotasPedidoFromCloudStaffCoalesced(digits);
    if (plan.pullOperacional || plan.pullNotas) {
      const operacionalCloud = (await fetchSyncBundle(digits))?.operacional ?? null;
      saveDataSafe(finalizeOperacionalPullLocalState(getData(), operacionalCloud, digits));
    }
  });
}

/**
 * Corpo do sync bidirectional (gestão). Deve rodar dentro de `enqueueOperacionalCoordination`
 * quando a coordenação estiver ON — não chama `pushOperacionalToCloud` público.
 */
export async function syncCooperativaBidirectionalInternal(
  cnpj: string,
  coopId?: string,
  options?: { pushCatalog?: boolean; pushMensalidades?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  const resetExecutedInJob = needsOperationalResetCloudPush();
  if (resetExecutedInJob) {
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
    await pushOperacionalToCloudInternal(digits, undefined, cid, {
      authoritative: true,
      skipOperationalResetPush: resetExecutedInJob,
    });
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
  if (!isOperacionalPushSingleFlightEnabled()) {
    return syncCooperativaBidirectionalInternal(cnpj, coopId, options);
  }
  return enqueueOperacionalCoordination(digits, () =>
    syncCooperativaBidirectionalInternal(cnpj, coopId, options)
  );
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
