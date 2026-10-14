import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import {
  cooperadoPwaFinanceiroSnapshotsAusentes,
  cooperadoPwaFinanceiroSnapshotsMaterializados,
} from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { persistirInicioCardCooperadoNotificarPwaLeve } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { rematerializarCooperadoPwaSnapshotsSeNecessario } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { getData, isAppDataWarm, subscribe, waitForAppDataWarm } from "@/services/dataStore";
import { requestCooperadoFinanceiroRecoverySync } from "@/services/syncRequest";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoFinanceiroExibicaoCachePronto } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";

function pilotFinanceCtx(user: Omit<User, "password">) {
  if (!user.cooperadoId) return null;
  const data = isAppDataWarm() ? getData() : null;
  const coopId = data
    ? getUserCooperativaId(user, data) ?? user.cooperativaId
    : user.cooperativaId;
  if (!coopId) return null;
  const cooperadoId = data
    ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
    : user.cooperadoId;
  return { cooperadoId, cooperativaId: coopId };
}

/** AppData local já tem fatia financeira — rematerialização é só leitura (sem sync). */
export function cooperadoPilotAppDataTemFinanceiroLocal(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isAppDataWarm()) return false;
  const ctx = pilotFinanceCtx(user);
  if (!ctx) return false;
  return cooperadoTemDadosFinanceirosMinimos(getData(), ctx.cooperadoId, ctx.cooperativaId);
}

/** Há cache local legível (card/ficha) — pode pintar antes do sync, como HB Créditos. */
export function cooperadoPilotFinanceiroExibirComSnapshotsLocais(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  return cooperadoFinanceiroExibicaoCachePronto(user);
}

/** Recria card + ficha a partir do AppData local (O(leitura)); dispara refresh da UI. */
export function tentarCooperadoPilotFinanceiroRematerializacaoLocal(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (!cooperadoPilotAppDataTemFinanceiroLocal(user)) return false;
  const ok = cooperadoRematerializarFinanceiroLocalSePossivel(user);
  if (ok) dispatchCooperadoPwaLeveUiSnapshotRefresh();
  return ok;
}

const recoveryLeaseByUser = new Map<string, () => void>();

/** Rematerializa card + ficha do AppData local e notifica Início/Financeiro (piloto). */
export function cooperadoPilotForcarRematerializacaoFinanceira(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;

  const run = () => {
    if (!isAppDataWarm()) return;
    rematerializarCooperadoPwaSnapshotsSeNecessario(user);
    tentarCooperadoPilotFinanceiroRematerializacaoLocal(user);
    persistirInicioCardCooperadoNotificarPwaLeve(user);
    persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  };

  if (isAppDataWarm()) {
    run();
    return;
  }
  void waitForAppDataWarm(12_000).then((warm) => {
    if (warm) run();
  });
}

/**
 * Piloto Jeferson: após purge de snapshot (novo build) ou AppData atrasado,
 * detecta dados locais e rematerializa; se ainda vazio, pede sync financeiro leve (leitura).
 */
export function scheduleCooperadoPilotFinanceReadRecovery(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
  const leaseKey = user.id;
  recoveryLeaseByUser.get(leaseKey)?.();

  let cloudFallbackScheduled = false;

  const attempt = (): boolean => {
    const ctx = pilotFinanceCtx(user);
    if (!ctx) return false;

    if (cooperadoPwaFinanceiroSnapshotsAusentes(ctx.cooperadoId, ctx.cooperativaId)) {
      tentarCooperadoPilotFinanceiroRematerializacaoLocal(user);
    }

    const materialized = cooperadoPwaFinanceiroSnapshotsMaterializados(
      ctx.cooperadoId,
      ctx.cooperativaId
    );
    if (materialized) {
      dispatchCooperadoPwaLeveUiSnapshotRefresh();
      return true;
    }
    if (cooperadoPilotAppDataTemFinanceiroLocal(user)) {
      dispatchCooperadoPwaLeveUiSnapshotRefresh();
      return true;
    }
    return false;
  };

  if (attempt()) return;

  const unsub = subscribe(() => {
    if (attempt()) {
      const release = recoveryLeaseByUser.get(leaseKey);
      release?.();
    }
  });

  const release = () => {
    unsub();
    recoveryLeaseByUser.delete(leaseKey);
  };
  recoveryLeaseByUser.set(leaseKey, release);

  const scheduleCloudRead = () => {
    if (cloudFallbackScheduled || attempt()) return;
    cloudFallbackScheduled = true;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    requestCooperadoFinanceiroRecoverySync();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(scheduleCloudRead, { timeout: 1_500 });
  } else {
    window.setTimeout(scheduleCloudRead, 800);
  }
}

/** Re-tenta rematerialização (ex.: abriu Início ainda zerado). */
export function cooperadoPilotFinanceRecoveryOnForeground(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || !isCooperadoMobileGaPromoted(user)) return;
  cooperadoPilotForcarRematerializacaoFinanceira(user);
  scheduleCooperadoPilotFinanceReadRecovery(user);
}
