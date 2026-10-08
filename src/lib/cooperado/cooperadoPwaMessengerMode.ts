/**
 * PWA cooperado mobile — modo “mensageiro”:
 * - Telas só leem snapshots/localStorage (sem assinar AppData a cada mudança).
 * - AppData / nuvem só em sync pontual: botão Atualizar, envio de foto (não sync de release na abertura).
 * - 1º frame: snapshots + sessão; parse do AppData em idle após pintar o shell.
 * - Sem pilot HB periódico nem pull de foreground na abertura (evita travar a UI).
 */
import type { User } from "@/types";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaEntregasResumosSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import {
  dispatchCooperadoPwaLeveUiSnapshotRefresh,
  persistirInicioCardCooperadoNotificarPwaLeve,
} from "@/lib/cooperado/cooperadoPwaLeveUi";
import { materializeCooperadoScopedReadModels } from "@/lib/cooperado/cooperadoScopedReadModels";

export function isCooperadoPwaMessengerMode(): boolean {
  return isCooperadoPwaMobileLeveUi();
}

/** Painéis cooperado PWA não assinam domínios do AppData (evita re-render a cada sync). */
export function cooperadoPwaUiSubscribesAppData(): boolean {
  return !isCooperadoPwaMessengerMode();
}

function scheduleMessengerCacheMaterialization(
  user: Omit<User, "password">
): void {
  const run = () => {
    materializeCooperadoScopedReadModels(user);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 2_500 });
    return;
  }
  window.setTimeout(run, 0);
}

/** Grava todos os snapshots locais após um sync bem-sucedido. */
export function persistirCooperadoPwaMessengerCaches(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
  persistirInicioCardCooperadoNotificarPwaLeve(user);
  persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
  persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
  scheduleMessengerCacheMaterialization(user);
}
