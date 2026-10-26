import {
  enqueueAppSyncRequest,
  registerAppSchedulerSyncDispatch,
  startAppScheduler,
} from "@/lib/performance/appScheduler";
import {
  cooperadoOperacionalSyncPermitido,
  isCooperadoManualOperacionalSync,
  markCooperadoUserSyncVisible,
  markNextCooperadoSyncSilent,
  takePendingCooperadoSilentSync,
} from "@/lib/performance/cooperadoColdStart";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  grantCooperadoEventDrivenSync,
  isCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import {
  consumeCooperadoGaFinanceExibicaoSyncPending,
  consumeCooperadoPrimeiraCargaSyncPending,
  cooperadoGaBloqueiaOperacionalFullAutomatico,
  cooperadoGaTemFinanceExibicaoSyncPending,
  cooperadoGaTemPrimeiraCargaSyncPending,
  markCooperadoGaFinanceExibicaoSyncPending,
} from "@/lib/cooperado/cooperadoGaSyncPolicy";
import {
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoMobileSyncTrace } from "@/lib/cooperado/cooperadoMobileSyncTrace";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { runCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import { scheduleCooperadoGaValorRevisionLightSync } from "@/lib/cooperado/cooperadoGaRevisionLightSync";
import { getSession } from "@/services/dataStore";
import {
  capStaffConferenciaSyncTierRequest,
  shouldBlockStaffAutoSyncDuringConferencia,
} from "@/lib/performance/staffConferenciaSyncTier";
import { staffGestaoPausaTrabalhoPesadoAutomatico } from "@/lib/staff/staffGestaoPausaTrabalhoPesado";
import {
  defaultForceForSyncTier,
  type SyncTier,
} from "@/lib/performance/syncTier";

export type SyncRunOptions = {
  force?: boolean;
  silent?: boolean;
  userInitiated?: boolean;
  eventDriven?: boolean;
  tier?: SyncTier;
  /** Gestão: tick periódico — não expande pull operacional (evita zerar painel). */
  staffLiveBackground?: boolean;
};

type SyncHandler = (opts: SyncRunOptions) => void;

let syncHandler: SyncHandler | null = null;
let schedulerBridgeAttached = false;

const SYNC_DEBOUNCE_MS = 450;

function dispatchSync(opts: {
  force: boolean;
  userInitiated?: boolean;
  eventDriven?: boolean;
  tier?: SyncTier;
}): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const silent = takePendingCooperadoSilentSync();
  syncHandler?.({
    force: opts.force,
    silent,
    userInitiated: opts.userInitiated === true,
    eventDriven: opts.eventDriven === true,
    tier: opts.tier,
  });
}

function ensureSchedulerBridge(): void {
  if (schedulerBridgeAttached) return;
  schedulerBridgeAttached = true;
  startAppScheduler();
  registerAppSchedulerSyncDispatch(dispatchSync);
}

/** Registra o handler de sync global (CooperativaSyncProvider). */
export function registerSyncHandler(handler: SyncHandler): () => void {
  ensureSchedulerBridge();
  syncHandler = handler;
  return () => {
    if (syncHandler === handler) syncHandler = null;
  };
}

/**
 * HX 8.0 — pedido de sync por tier (coalescência + debounce no AppScheduler).
 * `force` explícito prevalece; senão usa default do tier.
 */
function cooperadoBloqueiaSyncOperacionalAutomatico(opts?: {
  userInitiated?: boolean;
  eventDriven?: boolean;
}): boolean {
  if (!isCooperadoManualOperacionalSync()) return false;
  const session = getSession();
  if (session?.role !== "cooperado") return false;
  if (opts?.userInitiated || opts?.eventDriven) return false;
  return !cooperadoOperacionalSyncPermitido();
}

export function requestSyncTier(
  tier: SyncTier,
  options?: { force?: boolean; immediate?: boolean; userInitiated?: boolean; eventDriven?: boolean }
): void {
  if (
    tier === "operacional_full" &&
    cooperadoGaBloqueiaOperacionalFullAutomatico({
      userInitiated: options?.userInitiated,
      eventDriven: options?.eventDriven,
    })
  ) {
    return;
  }
  if (
    !options?.userInitiated &&
    !options?.eventDriven &&
    cooperadoBloqueiaSyncOperacionalAutomatico()
  ) {
    return;
  }
  if (shouldBlockStaffAutoSyncDuringConferencia(options?.userInitiated)) {
    return;
  }
  if (
    !options?.userInitiated &&
    !options?.eventDriven &&
    staffGestaoPausaTrabalhoPesadoAutomatico()
  ) {
    return;
  }
  if (tier === "operacional_full" && cooperadoGaTemPrimeiraCargaSyncPending()) {
    consumeCooperadoPrimeiraCargaSyncPending();
  }
  if (tier === "operacional_full" && cooperadoGaTemFinanceExibicaoSyncPending()) {
    consumeCooperadoGaFinanceExibicaoSyncPending();
  }
  ensureSchedulerBridge();
  const forceDefault = options?.force ?? defaultForceForSyncTier(tier);
  const capped = capStaffConferenciaSyncTierRequest(
    tier,
    forceDefault,
    options?.userInitiated === true
  );
  const session = getSession();
  if (capped.tier === "operacional_full" && session?.role === "cooperado") {
    cooperadoMobileSyncTrace("operacional_full", [
      options?.userInitiated ? "user" : "",
      options?.eventDriven ? "event" : "",
    ]
      .filter(Boolean)
      .join("|") || "auto");
  }
  enqueueAppSyncRequest({
    tier: capped.tier,
    force: capped.force,
    immediate: options?.immediate,
    userInitiated: options?.userInitiated === true,
    eventDriven: options?.eventDriven === true,
  });
}

/** Sync silenciosa após detectar lançamento do responsável na nuvem. */
export function requestCooperadoStaffRevisionSync(): void {
  if (!isCooperadoEventDrivenSync()) return;
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  const session = getSession();
  if (
    session?.role === "cooperado" &&
    isCooperadoMobileGaPromoted(session) &&
    cooperadoGaBloqueiaOperacionalFullAutomatico({ eventDriven: true })
  ) {
    scheduleCooperadoGaValorRevisionLightSync(session);
    return;
  }
  requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
}

/**
 * Cooperado com dados locais inconsistentes ou desatualizados — sync silenciosa
 * (manual sync ON) ou imediata visível (modo legado).
 */
export function requestCooperadoFinanceiroRecoverySync(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const session = getSession();
  if (session?.role === "cooperado") {
    if (!cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(session)) {
      return;
    }
    requestCooperadoGaFinanceiroExibicaoRecoverySync();
    return;
  }
  if (isCooperadoManualOperacionalSync() && isCooperadoEventDrivenSync()) {
    grantCooperadoEventDrivenSync();
    markNextCooperadoSyncSilent();
    requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
    return;
  }
  markCooperadoUserSyncVisible();
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

const GA_FINANCE_EXIBICAO_CLOUD_SESSION = "hb.coop.gaFinanceExibicaoCloud.v1";
const GA_FINANCE_GARANTIA_COUNT_PREFIX = "hb.coop.gaFinanceGarantiaCount";
const GA_FINANCE_GARANTIA_MAX = 4;

function gaFinanceGarantiaCount(userId: string): number {
  if (typeof sessionStorage === "undefined") return GA_FINANCE_GARANTIA_MAX;
  try {
    const raw = sessionStorage.getItem(`${GA_FINANCE_GARANTIA_COUNT_PREFIX}:${userId}`);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return GA_FINANCE_GARANTIA_MAX;
  }
}

function bumpGaFinanceGarantiaCount(userId: string): number {
  const next = gaFinanceGarantiaCount(userId) + 1;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(`${GA_FINANCE_GARANTIA_COUNT_PREFIX}:${userId}`, String(next));
    } catch {
      /* quota */
    }
  }
  return next;
}

function gaFinanceExibicaoCloudRecoveryJaUsada(userId: string): boolean {
  if (typeof sessionStorage === "undefined") return true;
  try {
    return sessionStorage.getItem(`${GA_FINANCE_EXIBICAO_CLOUD_SESSION}:${userId}`) === "1";
  } catch {
    return true;
  }
}

function markGaFinanceExibicaoCloudRecoverySession(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${GA_FINANCE_EXIBICAO_CLOUD_SESSION}:${userId}`, "1");
  } catch {
    /* quota */
  }
}

/**
 * GA — uma operacional_full silenciosa por sessão quando A receber/Financeiro zerados
 * sem cache confiável (ex.: após manutenção de snapshots).
 */
export function requestCooperadoGaFinanceiroExibicaoRecoverySync(opts?: {
  garantia?: boolean;
}): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const session = getSession();
  if (!session || session.role !== "cooperado") return;
  if (opts?.garantia) {
    if (cooperadoGaValorReceberExibicaoResolvida(session)) return;
  } else if (!cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(session)) {
    return;
  }
  if (opts?.garantia) {
    if (bumpGaFinanceGarantiaCount(session.id) > GA_FINANCE_GARANTIA_MAX) return;
  } else if (gaFinanceExibicaoCloudRecoveryJaUsada(session.id)) {
    return;
  } else {
    markGaFinanceExibicaoCloudRecoverySession(session.id);
  }
  markCooperadoGaFinanceExibicaoSyncPending();
  if (isCooperadoEventDrivenSync()) {
    grantCooperadoEventDrivenSync();
    markNextCooperadoSyncSilent();
    requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
    return;
  }
  markCooperadoUserSyncVisible();
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

/** Primeira carga / app novo — uma vez até ter ficha local. */
export function requestCooperadoPrimeiraCargaSync(): void {
  if (!isCooperadoEventDrivenSync()) return;
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
}

/** Nova versão do app publicada — sync operacional única (todos os modos cooperado mobile). */
export function requestCooperadoAppReleaseSync(): void {
  if (typeof window === "undefined") return;
  if (!cooperadoAppReleaseNeedsOperacionalSync()) return;
  if (isCooperadoEventDrivenSync()) {
    grantCooperadoEventDrivenSync();
  }
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", {
    force: true,
    immediate: true,
    eventDriven: isCooperadoEventDrivenSync(),
  });
}

/** Sync leve — HX 8.4: delta de notas (gestão) após conferência/lançamento. */
export function requestAppSyncLight(): void {
  if (cooperadoBloqueiaSyncOperacionalAutomatico()) return;
  requestSyncTier("notas_delta", { force: false });
}

/** GA com fatia local: Atualizar usa sync base (operacional+notas) em vez de fila operacional_full pesada. */
export function cooperadoManualPrefereSyncBaseInformacoes(
  user: ReturnType<typeof getSession>
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoAppReleaseNeedsOperacionalSync()) return false;
  if (typeof window !== "undefined") {
    try {
      if (window.matchMedia("(max-width: 1023px)").matches) return true;
    } catch {
      return true;
    }
  }
  return !cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user);
}

/** Botão Atualizar: força checagem + sync (ação explícita do cooperado). */
export function requestCooperadoManualRefreshSync(): void {
  markCooperadoUserSyncVisible();
  grantCooperadoEventDrivenSync();
  const session = getSession();
  if (session && cooperadoManualPrefereSyncBaseInformacoes(session)) {
    cooperadoMobileSyncTrace("manual_atualizar", "sync_base_financeira");
    void runCooperadoGaSyncBaseInformacoesFinanceiras(session, {
      force: true,
      userInitiated: true,
    });
    return;
  }
  cooperadoMobileSyncTrace("manual_atualizar", "operacional_full");
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

/**
 * Sync após mutação local (staff ou fluxos legados). Não conta como toque em «Atualizar» do cooperado.
 * Cooperado com sync manual: bloqueado aqui — use requestAppSyncImmediate após ação explícita.
 */
export function requestAppSync(): void {
  if (cooperadoBloqueiaSyncOperacionalAutomatico()) return;
  requestSyncTier("operacional_full", { force: true, userInitiated: false });
}

/** Cooperado concluiu envio de entrega — reconcilia fila e puxa status sem exigir «Atualizar». */
export function requestCooperadoPostEntregaSync(): void {
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", {
    force: true,
    immediate: true,
    eventDriven: true,
  });
}

/** Sync imediato — botão “Atualizar agora”. */
export function requestAppSyncImmediate(): void {
  markCooperadoUserSyncVisible();
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

/** Responsável — Atualizar: puxa a nuvem sem sync bidirecional (não zera o painel). */
export function requestStaffGestaoAtualizar(): void {
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

/** @internal — compat com testes que importavam debounce constante */
export const SYNC_REQUEST_DEBOUNCE_MS = SYNC_DEBOUNCE_MS;

type VotacaoOperacionalHandler = () => void;

let votacaoOperacionalHandler: VotacaoOperacionalHandler | null = null;

/** Registra pull leve de operacional (pautas/votos) para cooperado. */
export function registerVotacaoOperacionalSyncHandler(handler: VotacaoOperacionalHandler): () => void {
  votacaoOperacionalHandler = handler;
  return () => {
    if (votacaoOperacionalHandler === handler) votacaoOperacionalHandler = null;
  };
}

/** Baixa pautas de votação da nuvem — ignora intervalo de 2 min da sync completa. */
export function requestVotacaoOperacionalSync(): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  votacaoOperacionalHandler?.();
}
