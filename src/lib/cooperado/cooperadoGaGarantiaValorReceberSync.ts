/**
 * Garantia cooperado GA — busca na nuvem até exibição resolvida (valor ou zero comprovado).
 * Prioridade: lançamento do responsável deve aparecer; não manter R$ 0,00 indeterminado.
 */
import type { User } from "@/types";
import {
  cooperadoMobileDeferOperacionalSyncNaAbertura,
  isCooperadoMobileGaPromoted,
} from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoGaDispatchPrimeiraCargaSilenciosa } from "@/lib/cooperado/cooperadoGaColdBootstrap";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { requestCooperadoGaFinanceiroExibicaoRecoverySync } from "@/services/syncRequest";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { rematerializarCooperadoPwaSnapshotsSeNecessario } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import { markCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { requestSyncTier } from "@/services/syncRequest";
import { runCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import {
  cooperadoFinanceiroDesatualizado,
  cooperadoFinanceiroStaleRecuperavelEmBackground,
} from "@/services/fichaSyncGuard";
import { cooperadoMobileSyncTrace } from "@/lib/cooperado/cooperadoMobileSyncTrace";
import { cooperadoGaPausaTrabalhoFinanceiroPesado } from "@/lib/cooperado/cooperadoGaPausaTrabalhoPesado";

const GARANTIA_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 180_000] as const;

let activeUserId: string | null = null;
const timerIds: number[] = [];

function clearGarantiaTimers(): void {
  for (const id of timerIds) window.clearTimeout(id);
  timerIds.length = 0;
}

function pullNuvemFinanceiro(user: Omit<User, "password">, attempt: number): void {
  if (
    cooperadoGaPausaTrabalhoFinanceiroPesado(user) &&
    !cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)
  ) {
    return;
  }
  if (cooperadoGaValorReceberExibicaoResolvida(user)) {
    cooperadoMobileSyncTrace("garantia_resolvida_local", `attempt=${attempt}`);
    clearGarantiaTimers();
    return;
  }

  cooperadoPilotForcarRematerializacaoFinanceira(user);
  rematerializarCooperadoPwaSnapshotsSeNecessario(user);
  cooperadoRematerializarFinanceiroLocalSePossivel(user);

  if (!cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) {
    cooperadoMobileSyncTrace("garantia_skip_nuvem", "recovery_nao_necessario");
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
    return;
  }

  if (cooperadoMobileDeferOperacionalSyncNaAbertura(user)) {
    if (cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) {
      cooperadoGaDispatchPrimeiraCargaSilenciosa(user, { allowRepeat: attempt > 0 });
    }
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
    return;
  }

  cooperadoMobileSyncTrace("garantia_pull_nuvem", `attempt=${attempt}`);
  cooperadoGaDispatchPrimeiraCargaSilenciosa(user, { allowRepeat: attempt > 0 });

  if (attempt >= 3) {
    markCooperadoUserSyncVisible();
    requestSyncTier("operacional_full", {
      force: true,
      immediate: true,
      eventDriven: true,
    });
  } else {
    requestCooperadoGaFinanceiroExibicaoRecoverySync({ garantia: true });
  }
  scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
  void runCooperadoGaSyncBaseInformacoesFinanceiras(user, { force: attempt >= 1, silent: true });

  if (!isAppDataWarm() || !user.cooperadoId) return;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const staleRecuperavel = cooperadoFinanceiroStaleRecuperavelEmBackground(
    data,
    cooperadoId,
    coopId
  );
  const desatualizado =
    cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId) && !staleRecuperavel;
  void resolveCooperativaCnpj(data, coopId, user).then((cnpj) => {
    if (!cnpj || (typeof document !== "undefined" && document.hidden)) return;
    void runCooperadoForegroundOperacionalCheck(cnpj, {
      cooperadoId,
      cooperativaId: coopId,
      financeiroDesatualizado: desatualizado,
    });
  });
}

function onGarantiaTick(user: Omit<User, "password">, attempt: number): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (activeUserId !== user.id) return;
  if (cooperadoGaPausaTrabalhoFinanceiroPesado(user)) return;

  if (cooperadoGaValorReceberExibicaoResolvida(user)) {
    clearGarantiaTimers();
    return;
  }

  pullNuvemFinanceiro(user, attempt);
}

/** Enquanto indeterminado, repete rematerialização + sync (com teto por sessão). */
export function scheduleCooperadoGarantiaValorReceberUntilResolvido(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
  if (cooperadoGaValorReceberExibicaoResolvida(user)) return;

  if (activeUserId === user.id && timerIds.length > 0) return;

  clearGarantiaTimers();
  activeUserId = user.id;

  const arm = () => {
    GARANTIA_DELAYS_MS.forEach((delayMs, index) => {
      const id = window.setTimeout(() => onGarantiaTick(user, index), delayMs);
      timerIds.push(id);
    });
  };

  scheduleCooperadoPostInteractiveTask(arm);
}

export function cancelCooperadoGarantiaValorReceberSync(): void {
  clearGarantiaTimers();
  activeUserId = null;
}
