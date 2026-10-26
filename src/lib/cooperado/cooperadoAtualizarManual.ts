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
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { ackCooperadoPwaReleaseWhenCanonicalMatch } from "@/lib/cooperado/cooperadoMobileReleaseLocalAck";

/** Mensagem de conforto enquanto o cooperado aguarda a nuvem (piloto / PWA mobile). */
export const COOPERADO_ATUALIZAR_MENSAGEM_AMOR = "Jesus te ama";

/**
 * Botão Atualizar — dispara o sync na hora (sem esperar 12s de parse).
 * Retorna false se offline (sync não será enfileirado).
 */
export async function executarCooperadoAtualizarManual(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const release = await runClientReleaseShield("cooperado_manual_atualizar");
  if (release === "aligning") return true;
  const session = readCooperadoSessionLite() ?? getSession();
  grantCooperadoEventDrivenSync();
  unlockCooperadoGaDataWarmForSession();
  markCooperadoUserSyncVisible();
  await yieldCooperadoMobileUiBeforeHeavyWork();
  if (
    session?.role === "cooperado" &&
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
    const official = await fetchOfficialClientRelease({ bypassCache: true });
    ackCooperadoPwaReleaseWhenCanonicalMatch(session, official);
  }
  return true;
}
