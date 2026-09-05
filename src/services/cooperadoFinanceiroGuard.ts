import type { AppData, User } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  cooperadoFinanceiroLocalAusente,
  cooperadoPrecisaFullSyncFinanceiro,
  limparFichaObsoletaCooperado,
} from "@/services/fichaSyncGuard";
import { requestAppSync } from "@/services/syncRequest";
import { saveDataSafe, getData } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

const RECOVERY_GAP_MS = 30_000;
let lastRecoveryRequestAt = 0;

/** Cooperado com ficha/notas financeiras prontas para exibição. */
export function cooperadoFinanceiroPronto(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  return !cooperadoFinanceiroLocalAusente(data, cooperadoId, cooperativaId);
}

/** Dispara sync de recuperação com antirajada. */
export function solicitarRecuperacaoFinanceiroCooperado(): void {
  const now = Date.now();
  if (now - lastRecoveryRequestAt < RECOVERY_GAP_MS) return;
  lastRecoveryRequestAt = now;
  requestAppSync();
}

/**
 * Verifica integridade financeira do cooperado logado.
 * Se incompleta, agenda recuperação automática na nuvem.
 */
export function avaliarIntegridadeFinanceiroCooperado(
  data: AppData,
  user: Omit<User, "password">
): boolean {
  if (user.role !== "cooperado" || !user.cooperadoId) return true;

  const cooperativaId = getUserCooperativaId(user, data);
  if (!cooperativaId) {
    solicitarRecuperacaoFinanceiroCooperado();
    return false;
  }

  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  const limpo = limparFichaObsoletaCooperado(data, cooperadoId, cooperativaId);
  if (limpo !== data) {
    saveDataSafe(limpo);
    data = getData();
  }
  if (cooperadoPrecisaFullSyncFinanceiro(data, cooperadoId, cooperativaId)) {
    solicitarRecuperacaoFinanceiroCooperado();
  }
  if (cooperadoFinanceiroPronto(data, cooperadoId, cooperativaId)) {
    return true;
  }

  solicitarRecuperacaoFinanceiroCooperado();
  return false;
}
