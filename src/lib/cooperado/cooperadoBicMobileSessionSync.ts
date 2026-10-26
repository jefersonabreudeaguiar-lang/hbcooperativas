/**
 * Cooperado mobile + BIC: abertura pinta o cache local.
 * Operacional/notas da nuvem só no «Atualizar» — o pull imediato travava o celular.
 */
import type { User } from "@/types";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import {
  isCooperadoBicHybridLightEnabled,
  scheduleCooperadoBicHybridIdleTask,
} from "@/lib/cooperado/cooperadoBicHybridLight";
import { markCooperadoBicSessionRematerialized } from "@/lib/cooperado/cooperadoBicSessionReinforcementSkip";
import { cooperadoBrowserDesktopFinanceiroEstavel } from "@/lib/cooperado/cooperadoBrowserDesktopPerf";
import { cooperadoGaInicioSomenteCasca } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoInicioAberturaQuiescenceActive } from "@/lib/cooperado/cooperadoInicioAberturaQuiescence";

let activeUserId: string | null = null;
let scheduled = false;

function rematerializarBicSnapshots(user: Omit<User, "password">): void {
  const run = () => {
    cooperadoPilotForcarRematerializacaoFinanceira(user);
    cooperadoRematerializarFinanceiroLocalSePossivel(user);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
    markCooperadoBicSessionRematerialized(user.id);
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
  };
  if (isCooperadoBicHybridLightEnabled()) {
    scheduleCooperadoBicHybridIdleTask(run);
  } else {
    run();
  }
}

/**
 * Abertura BIC: só rematerializa snapshots + GET HB. Sem operacional_full.
 */
export function scheduleCooperadoBicMobileSessionSync(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (!isCooperadoMobileBicLeituraAuthority(user)) return;
  if (cooperadoBrowserDesktopFinanceiroEstavel(user)) return;

  if (activeUserId === user!.id && scheduled) return;

  activeUserId = user!.id;
  scheduled = true;
  const fire = () => {
    if (
      cooperadoGaInicioSomenteCasca(user) &&
      cooperadoInicioAberturaQuiescenceActive()
    ) {
      window.setTimeout(fire, 2_500);
      return;
    }
    rematerializarBicSnapshots(user!);
  };
  scheduleCooperadoPostInteractiveTask(fire);
}

export function cancelCooperadoBicMobileSessionSync(): void {
  scheduled = false;
  activeUserId = null;
}
