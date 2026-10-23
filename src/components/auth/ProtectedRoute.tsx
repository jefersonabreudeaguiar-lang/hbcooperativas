"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoInstantShellReady } from "@/lib/performance/cooperadoColdStart";
import { cooperadoPwaInstantPaintReady } from "@/lib/cooperado/cooperadoPwaInstantResume";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { markRqlColdStartPhase } from "@/lib/performance/rqlMarks";
import { getSession } from "@/services/dataStore";
import { repairBrowserProfileIfStale } from "@/lib/pwa/browserProfileRepair";
import { buildCooperadoLoginPath } from "@/lib/cooperado/cooperadoCanonicalEntryUrl";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { evaluateResponsavelIdentidade } from "@/lib/responsavel/responsavelIdentidade";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";

function cooperadoGaSessionInStorage(): boolean {
  if (typeof window === "undefined") return false;
  const session = getSession();
  return Boolean(
    session && session.role === "cooperado" && isCooperadoMobileGaPromoted(session)
  );
}

function protectedRouteInitialProfileRepairDone(): boolean {
  if (typeof window === "undefined") return false;
  const session = getSession();
  if (!session) return false;
  if (isCooperadoMobileGaPromoted(session)) return true;
  if (
    session.role === "cooperado" &&
    (cooperadoInstantShellReady(session) || cooperadoPwaInstantPaintReady(session))
  ) {
    return true;
  }
  return false;
}

function AppAreaLoadingShell() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="h-14 bg-green-900/90 animate-pulse shrink-0" />
      <div className="flex-1 p-4 space-y-3 max-w-lg mx-auto w-full pt-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
        <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, accountUser, loading } = useAuth();
  const router = useRouter();
  const [profileRepairDone, setProfileRepairDone] = useState(protectedRouteInitialProfileRepairDone);

  useLayoutEffect(() => {
    if (!loading && !user) {
      router.replace(buildCooperadoLoginPath());
    }
    if (!loading && user) {
      markRqlColdStartPhase("auth_ready");
    }
    const session = getSession();
    if (
      !loading ||
      cooperadoInstantShellReady(session) ||
      (session && cooperadoPwaInstantPaintReady(session))
    ) {
      dismissCooperadoBootShell();
    }
  }, [user, loading, router]);

  useLayoutEffect(() => {
    if (loading || !user) {
      if (cooperadoGaSessionInStorage()) return;
      setProfileRepairDone(false);
      return;
    }
    const sessionGate = accountUser ?? user;
    const identidade = evaluateResponsavelIdentidade({
      accountUser: sessionGate,
      experienceUser: user,
      dataReady: false,
      mobile: isMobileCooperativaApp(),
    });
    if (identidade.staffPainelUi) {
      setProfileRepairDone(true);
      return;
    }
    if (sessionGate.role !== "cooperado") {
      setProfileRepairDone(true);
      return;
    }
    let cancelled = false;
    const session = getSession();
    const instantCoop =
      user.role === "cooperado" &&
      (isCooperadoMobileGaPromoted(user) ||
        cooperadoInstantShellReady(session) ||
        cooperadoPwaInstantPaintReady(user));
    if (instantCoop) {
      setProfileRepairDone(true);
    }
    void repairBrowserProfileIfStale({ includeStandalone: true }).then((reloaded) => {
      if (cancelled || reloaded) return;
      if (!instantCoop) setProfileRepairDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, accountUser?.id, accountUser?.role]);

  useEffect(() => {
    if (loading || !user || user.role !== "cooperado") return;
    if (profileRepairDone) return;
    const t = window.setTimeout(() => {
      setProfileRepairDone(true);
      dismissCooperadoBootShell();
    }, 4_000);
    return () => window.clearTimeout(t);
  }, [loading, user?.id, user?.role, profileRepairDone]);

  const sessionForPaint = getSession();
  const cooperadoPaintWhileAuth =
    Boolean(user) &&
    user!.role === "cooperado" &&
    (isCooperadoMobileGaPromoted(user!) ||
      cooperadoInstantShellReady(sessionForPaint) ||
      cooperadoPwaInstantPaintReady(user!));
  if (loading && user && cooperadoPaintWhileAuth && profileRepairDone) {
    return <>{children}</>;
  }

  if (loading || (user && !profileRepairDone)) {
    return <AppAreaLoadingShell />;
  }

  if (!user) {
    return <AppAreaLoadingShell />;
  }

  return <>{children}</>;
}
