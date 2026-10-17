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
  const { accountUser, user } = useAuth();
  const gestaoAccount = accountUser ?? user;
  const pathname = usePathname();
  const router = useRouter();

  const dataReady = useAppDataReady();
  const canGestaoFromData = useAppDataSelector(
    (data) => (gestaoAccount ? canAccessPainelResponsavel(gestaoAccount, data) : false),
    [gestaoAccount?.id, gestaoAccount?.email, gestaoAccount?.role, gestaoAccount?.cooperadoId]
  );
  const coldData = isAppDataWarm() ? getData() : null;
  const canGestao = dataReady
    ? canGestaoFromData
    : gestaoAccount
      ? canAccessPainelResponsavelSession(gestaoAccount, coldData)
      : false;

  const staffPainelUiWarm = useAppDataSelector(
    (data) => Boolean(gestaoAccount && shouldRenderStaffPainelUi(gestaoAccount, data)),
    [gestaoAccount?.id, gestaoAccount?.email, gestaoAccount?.role, gestaoAccount?.cooperadoId]
  );
  const staffPainelUi = dataReady
    ? Boolean(staffPainelUiWarm)
    : Boolean(gestaoAccount && shouldRenderStaffPainelUiSession(gestaoAccount, coldData));

  useEffect(() => {
    if (!gestaoAccount) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (!canGestao || !staffPainelUi) {
      router.replace("/dashboard");
    }
  }, [gestaoAccount, canGestao, staffPainelUi, pathname, router]);

  return <>{children}</>;
}
