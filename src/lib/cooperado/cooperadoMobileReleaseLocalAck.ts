import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  persistOperacionalSyncedAppBuild,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoGaExibicaoFinanceiraConfiavel } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  getEmbeddedClientRelease,
  runtimeBundleBehindCanonical,
  type ClientReleaseInfo,
} from "@/lib/pwa/clientRelease";
import { markClientReleaseSeen } from "@/lib/pwa/fetchOfficialClientRelease";

/**
 * Novo build + AppData/snapshots locais OK → não repetir `requestCooperadoAppReleaseSync` a cada abertura.
 * Nuvem operacional completa continua no botão Atualizar.
 */
export function tryAckCooperadoAppReleaseWhenLocalReady(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
  if (!cooperadoAppReleaseNeedsOperacionalSync()) return;

  if (cooperadoGaExibicaoFinanceiraConfiavel(user)) {
    persistOperacionalSyncedAppBuild();
    return;
  }

  if (!isAppDataWarm() || !user.cooperadoId) return;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) {
    persistOperacionalSyncedAppBuild();
  }
}

/** Bundle já na release oficial — grava build visto e evita fila pós-deploy repetida. */
export function ackCooperadoPwaReleaseWhenCanonicalMatch(
  user: Omit<User, "password"> | null | undefined,
  official: ClientReleaseInfo | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !official?.build) return;
  const embedded = getEmbeddedClientRelease();
  if (runtimeBundleBehindCanonical(official, embedded)) return;
  markClientReleaseSeen(official);
  tryAckCooperadoAppReleaseWhenLocalReady(user);
}
