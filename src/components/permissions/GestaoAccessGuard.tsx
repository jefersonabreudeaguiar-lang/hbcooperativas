"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import {
  canAccessPainelResponsavel,
  isGestaoOnlyRoute,
} from "@/lib/security/responsavelPanelAccess";

export function GestaoAccessGuard({ children }: { children: React.ReactNode }) {
  const { accountUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const canGestao = useAppDataSelector(
    (data) => (accountUser ? canAccessPainelResponsavel(accountUser, data) : false),
    [accountUser?.id, accountUser?.email, accountUser?.role, accountUser?.cooperadoId]
  );

  useEffect(() => {
    if (!accountUser) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (canGestao) return;
    router.replace("/dashboard");
  }, [accountUser, canGestao, pathname, router]);

  return <>{children}</>;
}
