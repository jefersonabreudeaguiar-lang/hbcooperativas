/**
 * HX 9.0 — abertura cooperado: última sessão na tela, sync silencioso em background.
 * Não altera regras de negócio; só orquestra boot e visibilidade de sync.
 */

import type { User } from "@/types";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  cooperadoFinanceiroBloqueiaEntradaApp,
} from "@/services/fichaSyncGuard";
import { getData, getSession, isAppDataWarm, preloadAppData } from "@/services/dataStore";
import {
  inicioCardCacheProntoParaAbertura,
  lerInicioCardPersistidoFlex,
} from "@/lib/cooperadoInicioCardPersistencia";
import { filtrarInicioCardPersistidoLeituraBic } from "@/lib/cooperadoInicioCardPolicy";
import { markRqlColdStartPhase } from "@/lib/performance/rqlMarks";
import {
  hasCooperadoEventDrivenGrant,
  isCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Mesma chave que `cooperadoEventDrivenSync` — evita import circular no cold start. */
const HB_OPERACIONAL_SYNCED_BUILD = "hb-coop-operacional-synced-build";

function cooperadoOperacionalSyncedBuildMismatch(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(HB_OPERACIONAL_SYNCED_BUILD);
  const n = Number(raw);
  const stored = Number.isFinite(n) && n > 0 ? n : 0;
  return stored !== APP_BUILD_VERSION;
}

/** Fail-closed: desligar com NEXT_PUBLIC_COOPERADO_INSTANT_RESUME=false */
export function isCooperadoInstantResumeEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = (process.env.NEXT_PUBLIC_COOPERADO_INSTANT_RESUME ?? "true").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

/**
 * Cooperado: sync operacional (ficha/notas/votação) só no botão Atualizar.
 * HB Créditos mantém refresh próprio — não usar isto lá.
 */
export function isCooperadoManualOperacionalSync(): boolean {
  /** Fail-closed: sem `process` no cliente, não reativar sync operacional automático. */
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_COOPERADO_MANUAL_SYNC ?? "true")
      : "true";
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function cooperadoOperacionalSyncPermitido(): boolean {
  if (!isCooperadoManualOperacionalSync()) return true;
  if (isCooperadoUserSyncVisible()) return true;
  if (isCooperadoEventDrivenSync() && hasCooperadoEventDrivenGrant()) return true;
  return false;
}

let pendingSilentSync = false;
let coldStartSyncScheduled = false;
let userVisibleSyncDepth = 0;

export function markNextCooperadoSyncSilent(): void {
  pendingSilentSync = true;
}

export function takePendingCooperadoSilentSync(): boolean {
  const silent = pendingSilentSync;
  pendingSilentSync = false;
  return silent;
}

export function markCooperadoUserSyncVisible(): void {
  userVisibleSyncDepth += 1;
}

export function clearCooperadoUserSyncVisible(): void {
  userVisibleSyncDepth = Math.max(0, userVisibleSyncDepth - 1);
}

export function resetCooperadoUserSyncVisible(): void {
  userVisibleSyncDepth = 0;
}

export function isCooperadoUserSyncVisible(): boolean {
  return userVisibleSyncDepth > 0;
}

export function isCooperadoColdStartSyncScheduled(): boolean {
  return coldStartSyncScheduled;
}

/** Evita requestAppSyncImmediate / votacao duplicados na mesma abertura. */
export function shouldSkipCooperadoSecondaryMountSync(): boolean {
  return isCooperadoInstantResumeEnabled() && coldStartSyncScheduled;
}

export function ensureCooperadoAppDataEagerWarm(): void {
  if (!isCooperadoInstantResumeEnabled()) return;
  preloadAppData({ eager: true });
}

/** Mesmo eager warm — cooperado e responsável (HX 9.1). */
export const ensureAppDataEagerWarm = ensureCooperadoAppDataEagerWarm;

export function isStaffGestaoRole(role: string | undefined): boolean {
  return role === "responsavel" || role === "tesoureiro" || role === "admin";
}

/** Sessão + localStorage prontos — pinta a última versão sem esperar a nuvem. */
export function appLocalResumeReady(user: { role?: string } | null | undefined): boolean {
  if (!isCooperadoInstantResumeEnabled()) return false;
  if (!user || !getSession()) return false;
  ensureAppDataEagerWarm();
  return isAppDataWarm();
}

function cooperadoResumeContext(user: Omit<User, "password"> | null): {
  cooperadoId: string;
  cooperativaId: string;
} | null {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return null;
  if (!isAppDataWarm()) return null;
  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!cooperativaId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  return { cooperadoId, cooperativaId };
}

/** Dados locais suficientes para não bloquear a UI na abertura. */
export function cooperadoLocalResumeReady(user: Omit<User, "password"> | null): boolean {
  if (!isCooperadoInstantResumeEnabled()) return false;
  if (!user || user.role !== "cooperado") return false;
  if (!getSession()) return false;
  ensureCooperadoAppDataEagerWarm();
  if (!isAppDataWarm()) return false;

  const ctx = cooperadoResumeContext(user);
  if (!ctx) return false;

  const data = getData();
  if (
    !cooperadoFinanceiroBloqueiaEntradaApp(data, ctx.cooperadoId, ctx.cooperativaId)
  ) {
    return true;
  }

  const cache = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(ctx.cooperadoId, ctx.cooperativaId)
  );
  return inicioCardCacheProntoParaAbertura(cache);
}

export function cooperadoSyncAffectsPresentation(role: string | undefined, syncing: boolean): boolean {
  if (!syncing) return false;
  if (role !== "cooperado") return true;
  if (isCooperadoEventDrivenSync()) {
    return isCooperadoUserSyncVisible();
  }
  if (isCooperadoManualOperacionalSync()) {
    return isCooperadoUserSyncVisible();
  }
  if (!isCooperadoInstantResumeEnabled()) return true;
  return isCooperadoUserSyncVisible();
}

/** Cooperado manual: UI de “sync operacional” só no botão Atualizar. */
export function cooperadoOperacionalSyncUiAtivo(syncing: boolean): boolean {
  return cooperadoSyncAffectsPresentation("cooperado", syncing);
}

export function cooperadoSyncVisibleInUi(role: string | undefined, syncing: boolean): boolean {
  return cooperadoSyncAffectsPresentation(role, syncing);
}

/** Não limpar hydration financeira no runSync se já há UI utilizável localmente. */
export function cooperadoPreserveHydrationOnSilentSync(
  user: Omit<User, "password"> | null,
  alreadyHydrated: boolean
): boolean {
  if (!isCooperadoInstantResumeEnabled() || !user || user.role !== "cooperado") return false;
  if (!alreadyHydrated) return false;
  if (cooperadoOperacionalSyncedBuildMismatch()) return false;
  return cooperadoLocalResumeReady(user);
}

/**
 * Um único runSync silencioso após pintar — substitui rajada de syncs no mount.
 */
export function scheduleCooperadoColdStartSync(run: () => void): void {
  if (!isCooperadoInstantResumeEnabled()) {
    run();
    return;
  }
  if (coldStartSyncScheduled) return;
  coldStartSyncScheduled = true;
  markRqlColdStartPhase("cold_start_scheduled");
  if (typeof window === "undefined") {
    run();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      markRqlColdStartPhase("cold_start_run");
      markNextCooperadoSyncSilent();
      run();
    });
  });
}

export function resetCooperadoColdStartForTests(): void {
  pendingSilentSync = false;
  coldStartSyncScheduled = false;
  userVisibleSyncDepth = 0;
}

const POST_INTERACTIVE_DELAY_MS = 2_800;

/**
 * HX 9.0.5 — alinhamento de deploy / release após UI interativa (evita reload no cold start).
 */
export function scheduleCooperadoPostInteractiveTask(run: () => void): void {
  if (!isCooperadoInstantResumeEnabled()) {
    run();
    return;
  }
  if (typeof window === "undefined") return;

  const fire = () => {
    markRqlColdStartPhase("post_interactive_task");
    run();
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(fire, { timeout: POST_INTERACTIVE_DELAY_MS + 1_500 });
      } else {
        window.setTimeout(fire, POST_INTERACTIVE_DELAY_MS);
      }
    });
  });
}

const STAFF_POST_INTERACTIVE_DELAY_MS = 4_200;

/** Responsável — tarefas pós-pintura só quando o thread estiver ocioso (evita “página sem resposta”). */
export function scheduleStaffPostInteractiveTask(run: () => void): void {
  if (typeof window === "undefined") return;
  const fire = () => {
    markRqlColdStartPhase("staff_post_interactive_task");
    run();
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(fire, { timeout: STAFF_POST_INTERACTIVE_DELAY_MS + 2_000 });
      } else {
        window.setTimeout(fire, STAFF_POST_INTERACTIVE_DELAY_MS);
      }
    });
  });
}
