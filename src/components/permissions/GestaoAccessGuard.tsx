"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector, useAppDataReady } from "@/hooks/useAppData";
import {
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
  isGestaoOnlyRoute,
} from "@/lib/security/responsavelPanelAccess";
import {
  shouldRenderStaffPainelUi,
  shouldRenderStaffPainelUiSession,
} from "@/lib/staffNavigationUser";
import { getData, isAppDataWarm } from "@/services/dataStore";

export function GestaoAccessGuard({ children }: { children: React.ReactNode }) {
  const { accountUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const dataReady = useAppDataReady();
  const canGestaoFromData = useAppDataSelector(
    (data) => (accountUser ? canAccessPainelResponsavel(accountUser, data) : false),
    [accountUser?.id, accountUser?.email, accountUser?.role, accountUser?.cooperadoId]
  );
  const coldData = isAppDataWarm() ? getData() : null;
  const canGestao = dataReady
    ? canGestaoFromData
    : accountUser
      ? canAccessPainelResponsavelSession(accountUser, coldData)
      : false;

  const staffPainelUiWarm = useAppDataSelector(
    (data) => Boolean(accountUser && shouldRenderStaffPainelUi(accountUser, data)),
    [accountUser?.id, accountUser?.email, accountUser?.role, accountUser?.cooperadoId]
  );
  const staffPainelUi = dataReady
    ? Boolean(staffPainelUiWarm)
    : Boolean(accountUser && shouldRenderStaffPainelUiSession(accountUser, coldData));

  useEffect(() => {
    if (!accountUser) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (!canGestao || !staffPainelUi) {
      router.replace("/dashboard");
    }
  }, [accountUser, canGestao, staffPainelUi, pathname, router]);

  return <>{children}</>;
}
