import {
  isCooperadoEventDrivenSync,
  grantCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import {
  requestAppSyncImmediate,
  requestCooperadoManualRefreshSync,
} from "@/services/syncRequest";
import { isAppDataWarm } from "@/services/dataStore";
import { unlockCooperadoGaDataWarmForSession } from "@/lib/cooperado/cooperadoGaDataWarmDefer";
import { readCooperadoSessionLite } from "@/lib/cooperado/cooperadoSessionLite";
import { yieldCooperadoMobileUiBeforeHeavyWork } from "@/lib/cooperado/cooperadoGaMobileAtualizarYield";
import { markCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { rematerializarCooperadoPwaSnapshotsSeNecessario } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { getSession } from "@/services/dataStore";
import {
  fetchOfficialClientRelease,
  requestManualCooperadoReleaseUpgrade,
} from "@/lib/pwa/fetchOfficialClientRelease";
import { ackCooperadoPwaReleaseWhenCanonicalMatch } from "@/lib/cooperado/cooperadoMobileReleaseLocalAck";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
import {
  getEmbeddedClientRelease,
  getPageEmbeddedReleaseFromDom,
  runtimeNeedsReleaseUpgrade,
} from "@/lib/pwa/clientRelease";

/** Mensagem de conforto enquanto o cooperado aguarda a nuvem (piloto / PWA mobile). */
export const COOPERADO_ATUALIZAR_MENSAGEM_AMOR = "Jesus te ama";

/** Permite atualizar o pacote antes das rotinas especiais da aba de entregas/Início. */
export async function atualizarVersaoCooperadoSeNecessario(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const session = readCooperadoSessionLite() ?? getSession();
  if (session?.role !== "cooperado") return false;
  const official = await fetchOfficialClientRelease({ bypassCache: true });
  if (
    !official ||
    !runtimeNeedsReleaseUpgrade(
      official,
      getPageEmbeddedReleaseFromDom(),
      getEmbeddedClientRelease()
    )
  ) {
    return false;
  }
  return requestManualCooperadoReleaseUpgrade();
}

/**
 * Botão Atualizar — dispara o sync na hora (sem esperar 12s de parse).
 * Retorna false se offline (sync não será enfileirado).
 */
export async function executarCooperadoAtualizarManual(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const release = await runClientReleaseShield("cooperado_manual_atualizar");
  if (release === "aligning") return true;
  const session = readCooperadoSessionLite() ?? getSession();
  const official =
    session?.role === "cooperado"
      ? await fetchOfficialClientRelease({ bypassCache: true })
      : null;
  if (
    official &&
    runtimeNeedsReleaseUpgrade(
      official,
      getPageEmbeddedReleaseFromDom(),
      getEmbeddedClientRelease()
    )
  ) {
    const startedReleaseUpgrade = await requestManualCooperadoReleaseUpgrade();
    if (startedReleaseUpgrade) return true;
  }
  grantCooperadoEventDrivenSync();
  unlockCooperadoGaDataWarmForSession();
  markCooperadoUserSyncVisible();
  await yieldCooperadoMobileUiBeforeHeavyWork();
  if (
    session?.role === "cooperado" &&
    !isCooperadoJefersonSomenteAtualizarPilot(session) &&
    isAppDataWarm() &&
    rematerializarCooperadoPwaSnapshotsSeNecessario(session)
  ) {
    clearCooperadoPwaDadosDesatualizados();
  }
  if (isCooperadoEventDrivenSync()) {
    requestCooperadoManualRefreshSync();
  } else {
    requestAppSyncImmediate();
  }
  if (session?.role === "cooperado") {
    ackCooperadoPwaReleaseWhenCanonicalMatch(session, official);
  }
  return true;
}
