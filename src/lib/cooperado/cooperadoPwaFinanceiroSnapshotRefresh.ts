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
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { persistOperacionalSyncedAppBuild } from "@/lib/performance/cooperadoEventDrivenSync";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { cooperadoGaInicioSomenteCasca } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoGaPausaTrabalhoFinanceiroPesado } from "@/lib/cooperado/cooperadoGaPausaTrabalhoPesado";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { cooperadoBrowserDesktopBicPerfActive } from "@/lib/cooperado/cooperadoBrowserDesktopPerf";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
import { scheduleCooperadoJefersonMaterializarAba } from "@/lib/cooperado/cooperadoJefersonAbasDadosReais";
import { scheduleCooperadoBicMaterializacaoProtegida } from "@/lib/cooperado/cooperadoBicMaterializacaoPerf";

/** Piloto Jeferson — Início primeiro; demais abas sob demanda ao visitar. */
export function cooperadoJefersonPosSyncSnapshotLeve(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado") return;
  scheduleCooperadoBicMaterializacaoProtegida(() => {
    scheduleCooperadoJefersonMaterializarAba(user, "/dashboard");
  });
}

/** Após troca de build ou purge — recria snapshots do AppData local (paridade com o browser). */
export function cooperadoRematerializarFinanceiroLocalSePossivel(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (isCooperadoJefersonSomenteAtualizarPilot(user)) return false;
  if (cooperadoGaPausaTrabalhoFinanceiroPesado(user)) return false;
  if (!isAppDataWarm()) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (!cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) return false;
  cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user, { light: true });
  persistOperacionalSyncedAppBuild();
  return true;
}

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
  user: Omit<User, "password"> | null | undefined,
  opts?: { light?: boolean; skipInicioDashboardView?: boolean }
): void {
  const skipInicioView = opts?.skipInicioDashboardView ?? cooperadoGaInicioSomenteCasca(user);
  if (!user || user.role !== "cooperado") return;
  if (isCooperadoJefersonSomenteAtualizarPilot(user)) {
    cooperadoJefersonPosSyncSnapshotLeve(user);
    return;
  }
  if (isCooperadoPwaMessengerMode()) {
    persistirCooperadoPwaMessengerCaches(user, { light: opts?.light });
    clearCooperadoPwaDadosDesatualizados();
    return;
  }
  if (isCooperadoMobileBicLeituraAuthority(user)) {
    // Browser desktop: card lê AppData/BIC ao vivo — snapshots PWA regravam valor transitório (ex.: 124) no meio do sync.
    if (cooperadoBrowserDesktopBicPerfActive(user)) return;
    persistirInicioCardCooperadoNotificarPwaLeve(user);
    persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
    if (!skipInicioView) {
      persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
    }
    clearCooperadoPwaDadosDesatualizados();
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
    return;
  }
  if (!isCooperadoPwaMobileLeveUi() && !isCooperadoMobilePilotPerfActive(user)) return;
  persistirInicioCardCooperadoNotificarPwaLeve(user);
  persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
  if (!skipInicioView) {
    persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
  }
  if (!opts?.light) {
    void import("@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot").then((mod) => {
      mod.persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
    });
  }
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
}
