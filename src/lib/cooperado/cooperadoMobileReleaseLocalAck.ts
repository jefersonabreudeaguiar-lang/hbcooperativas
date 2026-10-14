import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  persistOperacionalSyncedAppBuild,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoGaExibicaoFinanceiraConfiavel } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";

/**
 * Novo build + AppData/snapshots locais OK → não repetir `requestCooperadoAppReleaseSync` a cada abertura.
 * Nuvem operacional completa continua no botão Atualizar.
 */
export function tryAckCooperadoAppReleaseWhenLocalReady(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
  if (!cooperadoAppReleaseNeedsOperacionalSync()) return;
  if (!cooperadoGaExibicaoFinanceiraConfiavel(user)) return;

  persistOperacionalSyncedAppBuild();
}
