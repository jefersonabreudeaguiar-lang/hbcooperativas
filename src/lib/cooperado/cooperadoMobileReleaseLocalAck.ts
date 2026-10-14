import type { User } from "@/types";
import { cooperadoFinanceiroExibicaoCachePronto } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { cooperadoPwaInstantPaintReady } from "@/lib/cooperado/cooperadoPwaInstantResume";
import { cooperadoInstantShellReady, cooperadoLocalResumeReady } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  persistOperacionalSyncedAppBuild,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

/**
 * Novo build + AppData/snapshots locais OK → não repetir `requestCooperadoAppReleaseSync` a cada abertura.
 * Nuvem operacional completa continua no botão Atualizar.
 */
export function tryAckCooperadoAppReleaseWhenLocalReady(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
  if (!cooperadoAppReleaseNeedsOperacionalSync()) return;
  if (cooperadoInstantShellReady(user) && !isAppDataWarm()) {
    persistOperacionalSyncedAppBuild();
    return;
  }
  if (!isAppDataWarm() || !user.cooperadoId) return;

  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const podePintar =
    cooperadoFinanceiroExibicaoCachePronto(user) ||
    cooperadoPwaInstantPaintReady(user) ||
    cooperadoLocalResumeReady(user);
  if (!podePintar && !cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) return;

  persistOperacionalSyncedAppBuild();
}
