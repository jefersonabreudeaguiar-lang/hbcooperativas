"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoInstantShellReady } from "@/lib/performance/cooperadoColdStart";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { markRqlColdStartPhase } from "@/lib/performance/rqlMarks";
import { getSession } from "@/services/dataStore";
import { repairBrowserProfileIfStale } from "@/lib/pwa/browserProfileRepair";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

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
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profileRepairDone, setProfileRepairDone] = useState(false);

  useLayoutEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?hb-pwa=${APP_BUILD_VERSION}`);
    }
    if (!loading && user) {
      markRqlColdStartPhase("auth_ready");
    }
    if (!loading || cooperadoInstantShellReady(getSession())) {
      dismissCooperadoBootShell();
    }
  }, [user, loading, router]);

  useLayoutEffect(() => {
    if (loading || !user) {
      setProfileRepairDone(false);
      return;
    }
    let cancelled = false;
    const session = getSession();
    const instantCoop =
      user.role === "cooperado" && cooperadoInstantShellReady(session);
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
  }, [loading, user?.id]);

  if (loading && user && cooperadoInstantShellReady(getSession()) && profileRepairDone) {
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
