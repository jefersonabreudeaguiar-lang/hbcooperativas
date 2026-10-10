/**
 * PWA / mobile — alinha card “A receber” e AppData local com a nuvem ao voltar ao app,
 * sem exigir novo login no desktop (paridade Orlando ↔ celular).
 */
import type { User } from "@/types";
import {
  isCooperadoEventDrivenSync,
  readCooperadoLastOperacionalSyncAt,
} from "@/lib/performance/cooperadoEventDrivenSync";
import {
  isCooperadoManualOperacionalSync,
  scheduleCooperadoPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";
import { scheduleCooperadoPostShellSync } from "@/lib/performance/cooperadoPostShellSync";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import { refreshCooperadoPwaInicioCachesFromMotor } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

let lastForegroundPullAt = 0;
let lastMessengerUiParidadeAt = 0;
const FOREGROUND_PULL_GAP_MS = 90_000;
const RECENT_OPERACIONAL_SYNC_SKIP_MS = 2 * 60_000;
const MESSENGER_UI_PARIDADE_GAP_MS = 60_000;

export function cooperadoOperacionalParidadeRefreshAtivo(): boolean {
  return isCooperadoManualOperacionalSync() && isCooperadoEventDrivenSync();
}

/** Atualiza cache local do card a partir do motor (mesma leitura do dashboard). */
export function refreshCooperadoInicioCardFromMotor(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado") return;
  refreshCooperadoPwaInicioCachesFromMotor(user, true);
}

/**
 * PWA mensageiro — atualiza card “A receber” + snapshot HB no idle (sem sync operacional na abertura).
 */
export function scheduleCooperadoMessengerBicHbUiParidadeRefresh(
  user: Omit<User, "password"> | null | undefined,
  opts?: { force?: boolean }
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
  const now = Date.now();
  if (!opts?.force && now - lastMessengerUiParidadeAt < MESSENGER_UI_PARIDADE_GAP_MS) return;
  lastMessengerUiParidadeAt = now;

  scheduleCooperadoPostInteractiveTask(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    refreshCooperadoInicioCardFromMotor(user);
    void import("@/services/hbCreditAccountPersistenciaService").then(
      ({ persistirHbCreditAccountCooperado }) => {
        void persistirHbCreditAccountCooperado(user);
      }
    );
  });
}

/**
 * Ao reabrir PWA ou voltar à aba: persiste card + checagem leve de revisão na nuvem.
 * Throttle evita rajada em visibility/pageshow duplicados.
 */
export function scheduleCooperadoPwaOperacionalParidadePull(
  user: Omit<User, "password"> | null | undefined,
  cooperativaId: string | undefined,
  opts?: { force?: boolean }
): void {
  if (!user || user.role !== "cooperado" || !cooperativaId) return;
  if (isCooperadoPwaMessengerMode()) return;
  if (!cooperadoOperacionalParidadeRefreshAtivo()) return;

  refreshCooperadoInicioCardFromMotor(user);

  const now = Date.now();
  const lastSync = readCooperadoLastOperacionalSyncAt();
  if (
    !opts?.force &&
    lastSync != null &&
    now - lastSync < RECENT_OPERACIONAL_SYNC_SKIP_MS
  ) {
    return;
  }
  if (!opts?.force && now - lastForegroundPullAt < FOREGROUND_PULL_GAP_MS) return;
  lastForegroundPullAt = now;

  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  scheduleCooperadoPostShellSync(() => {
    if (!isAppDataWarm()) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const data = getData();
    if (!user.cooperadoId) return;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
    const financeiroDesatualizado = cooperadoFinanceiroDesatualizado(
      data,
      cooperadoId,
      cooperativaId
    );
    void resolveCooperativaCnpj(data, cooperativaId, user).then((cnpj) => {
      if (!cnpj || (typeof document !== "undefined" && document.hidden)) return;
      void runCooperadoForegroundOperacionalCheck(cnpj, { financeiroDesatualizado });
    });
  });
}

/** PWA instalado ou viewport mobile — onde a paridade com desktop costuma falhar. */
export function shouldRunCooperadoPwaParidadeHooks(): boolean {
  if (typeof window === "undefined") return false;
  if (isCooperadoPwaMessengerMode()) return false;
  if (isAppStandalone()) return true;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}
