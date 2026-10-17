"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector, useAppDataReady } from "@/hooks/useAppData";
import { isGestaoOnlyRoute } from "@/lib/security/responsavelPanelAccess";
import { evaluateResponsavelIdentidade } from "@/lib/responsavel/responsavelIdentidade";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import { usePainelResponsavelMobilePref } from "@/hooks/usePainelResponsavelMobilePref";

export function GestaoAccessGuard({ children }: { children: React.ReactNode }) {
  const { accountUser, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const dataReady = useAppDataReady();
  const mobile = isMobileCooperativaApp();
  const preferPainel = usePainelResponsavelMobilePref();

  const identidadeWarm = useAppDataSelector(
    (data) =>
      evaluateResponsavelIdentidade({
        accountUser: accountUser ?? user,
        experienceUser: user,
        data,
        dataReady: true,
        mobile,
        preferPainelResponsavel: preferPainel,
      }),
    [
      accountUser?.id,
      accountUser?.role,
      accountUser?.cooperadoId,
      user?.id,
      user?.role,
      mobile,
      preferPainel,
    ]
  );
  const identidadeCold = evaluateResponsavelIdentidade({
    accountUser: accountUser ?? user,
    experienceUser: user,
    data: isAppDataWarm() ? getData() : null,
    dataReady: false,
    mobile,
    preferPainelResponsavel: preferPainel,
  });
  const identidade = dataReady && identidadeWarm ? identidadeWarm : identidadeCold;

  useEffect(() => {
    if (!accountUser && !user) return;
    if (!isGestaoOnlyRoute(pathname)) return;
    if (!identidade.staffPainelUi) {
      router.replace("/dashboard");
    }
  }, [accountUser, user, identidade.staffPainelUi, pathname, router]);

  return <>{children}</>;
}
