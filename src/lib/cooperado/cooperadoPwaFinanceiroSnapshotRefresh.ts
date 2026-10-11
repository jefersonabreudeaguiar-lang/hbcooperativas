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
