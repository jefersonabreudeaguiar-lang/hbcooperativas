import { NextResponse } from "next/server";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { buildHobeliscoAdminOverview } from "@/lib/lab/hobeliscoAdminOverview";
import { checkHobeliscoLabMirrorHealth } from "@/lib/lab/hobeliscoLabMirrorConfig";
import { evaluateHobeliscoLabBoundary } from "@/lib/lab/hobeliscoLabBoundary";
import { initHobeliscoObserver, getHobeliscoObserver } from "@lab/hobelisco-hx/observer/ObserverSingleton";

export const dynamic = "force-dynamic";

/** Health check LAB espelho + fronteira — admin only */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const boundary = evaluateHobeliscoLabBoundary();
  const health = checkHobeliscoLabMirrorHealth();

  if (health.ok) {
    initHobeliscoObserver();
  }

  const observer = getHobeliscoObserver();
  const overview = await buildHobeliscoAdminOverview();

  return NextResponse.json({
    ...health,
    running: observer?.isRunning() ?? false,
    overview: {
      enabled: overview.enabled,
      metrics: overview.metrics,
      pendingCount: overview.pendingCount,
      alertCount: overview.alertCount,
      persistence: overview.persistence,
    },
    principles: {
      neverTouchesProduction: boundary.productionLocked || boundary.safe,
      neverPromoteToProduction: true,
      labOnlyOperations: !boundary.productionLocked,
      productionDeployLocked: boundary.productionLocked,
    },
  });
}
