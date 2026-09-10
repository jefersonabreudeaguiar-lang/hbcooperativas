import { NextResponse } from "next/server";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { buildHobeliscoAdminOverview } from "@/lib/lab/hobeliscoAdminOverview";
import { checkStagingObserveHealth } from "@/lib/lab/hobeliscoStagingConfig";
import { initHobeliscoObserver, getHobeliscoObserver } from "@lab/hobelisco-hx/observer/ObserverSingleton";

export const dynamic = "force-dynamic";

/** Health check STAGING observe-only — admin only */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const health = checkStagingObserveHealth();
  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  const overview = await buildHobeliscoAdminOverview();

  return NextResponse.json({
    ...health,
    running: observer?.isRunning() ?? false,
    overview: {
      metrics: overview.metrics,
      pendingCount: overview.pendingCount,
      alertCount: overview.alertCount,
      persistence: overview.persistence,
    },
    principles: {
      blocksRequests: false,
      mutatesFinancialData: false,
      humanConfirmationRequired: true,
    },
  });
}
