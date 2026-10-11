/**
 * PWA cooperado — recria snapshots locais (A receber + Financeiro) após sync na nuvem.
 */
import type { User } from "@/types";
import {
  dispatchCooperadoPwaLeveUiSnapshotRefresh,
  isCooperadoPwaMobileLeveUi,
  persistirInicioCardCooperadoNotificarPwaLeve,
} from "@/lib/cooperado/cooperadoPwaLeveUi";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import {
  isCooperadoPwaMessengerMode,
  persistirCooperadoPwaMessengerCaches,
} from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

/** PWA mensageiro — ao voltar ao app, checa revisão na nuvem (lançamento do responsável). */
export function scheduleCooperadoMessengerStaffRevisionPull(
  user: Omit<User, "password"> | null | undefined,
  cooperativaId: string | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
  scheduleCooperadoPostInteractiveTask(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (!isAppDataWarm()) return;
    const data = getData();
    const coopId = cooperativaId ?? getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) return;
    const cooperadoId = user.cooperadoId;
    void resolveCooperativaCnpj(data, coopId, user).then((cnpj) => {
      if (!cnpj || (typeof document !== "undefined" && document.hidden)) return;
      void runCooperadoForegroundOperacionalCheck(cnpj, {
        cooperadoId,
        cooperativaId: coopId,
      });
    });
  });
}

/** Cache limpo ou dados novos na nuvem — grava card, ficha e painel Início no celular. */
export function cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado") return;
  if (isCooperadoPwaMessengerMode()) {
    persistirCooperadoPwaMessengerCaches(user);
    return;
  }
  if (!isCooperadoPwaMobileLeveUi()) return;
  persistirInicioCardCooperadoNotificarPwaLeve(user);
  persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
  persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
  void import("@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot").then((mod) => {
    mod.persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
  });
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
}
