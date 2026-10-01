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
import { shouldRenderStaffPainelUi } from "@/lib/staffNavigationUser";

export function GestaoAccessGuard({ children }: { children: React.ReactNode }) {
  const { accountUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const dataReady = useAppDataReady();
  const canGestaoFromData = useAppDataSelector(
    (data) => (accountUser ? canAccessPainelResponsavel(accountUser, data) : false),
    [accountUser?.id, accountUser?.email, accountUser?.role, accountUser?.cooperadoId]
  );
  const canGestao = dataReady
    ? canGestaoFromData
    : accountUser
      ? canAccessPainelResponsavelSession(accountUser)
      : false;

  const staffPainelUi = useAppDataSelector(
    (data) => Boolean(accountUser && shouldRenderStaffPainelUi(accountUser, data)),
    [accountUser?.id, accountUser?.email, accountUser?.role, accountUser?.cooperadoId]
  );

  useEffect(() => {
    if (!accountUser) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (canGestao === null) return;
    if (!canGestao || !staffPainelUi) {
      router.replace("/dashboard");
    }
  }, [accountUser, canGestao, staffPainelUi, pathname, router]);

  return <>{children}</>;
}
