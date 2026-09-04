"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import {
  canAccessPainelResponsavel,
  isGestaoOnlyRoute,
} from "@/lib/security/responsavelPanelAccess";

export function GestaoAccessGuard({ children }: { children: React.ReactNode }) {
  const { accountUser } = useAuth();
  const data = useAppData();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!accountUser || !data) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (canAccessPainelResponsavel(accountUser, data)) return;
    router.replace("/dashboard");
  }, [accountUser, data, pathname, router]);

  return <>{children}</>;
}
