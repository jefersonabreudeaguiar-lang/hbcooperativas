/**
 * PWA cooperado mobile — modo “mensageiro”: telas só leem cache local;
 * AppData atualiza em sync pontual (versão do app, revisão na nuvem, Atualizar).
 */
import type { User } from "@/types";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaEntregasResumosSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import {
  dispatchCooperadoPwaLeveUiSnapshotRefresh,
  persistirInicioCardCooperadoNotificarPwaLeve,
} from "@/lib/cooperado/cooperadoPwaLeveUi";

export function isCooperadoPwaMessengerMode(): boolean {
  return isCooperadoPwaMobileLeveUi();
}

/** Painéis cooperado PWA não assinam domínios do AppData (evita re-render a cada sync). */
export function cooperadoPwaUiSubscribesAppData(): boolean {
  return !isCooperadoPwaMessengerMode();
}

/** Grava todos os snapshots locais após um sync bem-sucedido. */
export function persistirCooperadoPwaMessengerCaches(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
  persistirInicioCardCooperadoNotificarPwaLeve(user);
  persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
  persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
}
