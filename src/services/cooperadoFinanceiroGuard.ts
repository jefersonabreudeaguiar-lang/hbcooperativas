import type { AppData, User } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  cooperadoFinanceiroBloqueiaEntradaApp,
  cooperadoFinanceiroDesatualizado,
  cooperadoFinanceiroLocalAusente,
  cooperadoPrecisaFullSyncFinanceiro,
  limparFichaObsoletaCooperado,
} from "@/services/fichaSyncGuard";
import { isCooperadoManualOperacionalSync } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { getSession } from "@/services/dataStore";
import { requestAppSync, requestCooperadoFinanceiroRecoverySync } from "@/services/syncRequest";
import { saveDataSafe, getData } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";

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

/** Cache limpo / primeira abertura: ainda não baixou ficha e notas do cooperado. */
export function cooperadoAguardandoPrimeiraFatiaFinanceira(
  data: AppData | null | undefined,
  cooperadoId: string | undefined,
  cooperativaId: string | undefined,
  opts: { syncing: boolean; lastSyncedAt: number | null; offline?: boolean }
): boolean {
  if (opts.offline) return false;
  if (!cooperadoId || !cooperativaId) return true;
  if (!data) return true;
  if (cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, cooperativaId)) return false;
  if (opts.syncing) return true;
  if (opts.lastSyncedAt == null) return true;
  return cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId);
}

/** Nuvem e AppData alinhados — valores na UI podem ser tratados como definitivos. */
export function cooperadoDadosFinanceirosConsistentesParaApresentacao(
  data: AppData | null | undefined,
  cooperadoId: string | undefined,
  cooperativaId: string | undefined,
  opts?: { offline?: boolean }
): boolean {
  if (!data || !cooperadoId || !cooperativaId) return false;
  if (cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, cooperativaId)) return false;
  if (opts?.offline) {
    return cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, cooperativaId);
  }
  return !cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId);
}

/** Dispara sync de recuperação com antirajada. */
export function solicitarRecuperacaoFinanceiroCooperado(): void {
  const session = getSession();
  if (session && isCooperadoMobileGaPromoted(session)) return;
  const now = Date.now();
  if (now - lastRecoveryRequestAt < RECOVERY_GAP_MS) return;
  lastRecoveryRequestAt = now;
  if (isCooperadoManualOperacionalSync()) {
    requestCooperadoFinanceiroRecoverySync();
    return;
  }
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
