/**
 * PWA cooperado mobile — modo “mensageiro”:
 * - Telas só leem snapshots/localStorage (sem assinar AppData a cada mudança).
 * - AppData / nuvem só em sync pontual: botão Atualizar, envio de foto (não sync de release na abertura).
 * - 1º frame: snapshots + sessão; parse do AppData em idle após pintar o shell.
 * - Sem pilot HB periódico na abertura (evita travar a UI).
 * - Início + Financeiro: leitura somente (snapshots); atualiza após sync (manual, release ou revisão do responsável).
 * - Versão + Atualizar no header mobile (`CooperadoMobileBuildBadge`) — escape hatch manual.
 */
import type { User } from "@/types";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { getSession } from "@/services/dataStore";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaEntregasResumosSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { persistirInicioCardCooperadoNotificarPwaLeve } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { materializeCooperadoScopedReadModels } from "@/lib/cooperado/cooperadoScopedReadModels";

export function isCooperadoPwaMessengerMode(): boolean {
  if (!isCooperadoPwaMobileLeveUi()) return false;
  const session = getSession();
  if (session && session.role !== "cooperado") return false;
  return true;
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

/** Grava snapshots locais — `light` evita entregas/read models na abertura (menos travamento). */
export function persistirCooperadoPwaMessengerCaches(
  user: Omit<User, "password"> | null | undefined,
  opts?: { light?: boolean }
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
  persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
  persistirInicioCardCooperadoNotificarPwaLeve(user);
  persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
  if (opts?.light) return;
  const runEntregasSnapshotPesado = () => {
    persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
    scheduleMessengerCacheMaterialization(user);
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(runEntregasSnapshotPesado, { timeout: 12_000 });
  } else {
    window.setTimeout(runEntregasSnapshotPesado, 2_000);
  }
  void import("@/services/hbCreditAccountPersistenciaService").then(({ persistirHbCreditAccountCooperado }) => {
    void persistirHbCreditAccountCooperado(user);
  });
}
