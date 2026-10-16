import {
  isCooperadoEventDrivenSync,
  grantCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import {
  requestAppSyncImmediate,
  requestCooperadoManualRefreshSync,
} from "@/services/syncRequest";
import { preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";

/** Mensagem de conforto enquanto o cooperado aguarda a nuvem (piloto / PWA mobile). */
export const COOPERADO_ATUALIZAR_MENSAGEM_AMOR = "Jesus te ama";

/**
 * Botão Atualizar — garante AppData warm antes do sync e marca UI visível.
 * Retorna false se offline (sync não será enfileirado).
 */
export async function executarCooperadoAtualizarManual(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const release = await runClientReleaseShield("cooperado_manual_atualizar");
  if (release === "aligning") return true;
  grantCooperadoEventDrivenSync();
  preloadAppData();
  await waitForAppDataWarm(12_000);
  if (isCooperadoEventDrivenSync()) {
    requestCooperadoManualRefreshSync();
  } else {
    requestAppSyncImmediate();
  }
  return true;
}
