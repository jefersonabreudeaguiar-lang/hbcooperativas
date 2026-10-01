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

  useEffect(() => {
    if (!accountUser) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (canGestao === null || canGestao) return;
    router.replace("/dashboard");
  }, [accountUser, canGestao, pathname, router]);

  return <>{children}</>;
}
