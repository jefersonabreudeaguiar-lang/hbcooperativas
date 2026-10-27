"use client";

import { useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { markPwaRepairSessionForBuild } from "@/lib/pwa/cooperadoPwaInstallPrepare";

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Redireciona usuários já autenticados (login/cadastro). */
export function GuestRoute({
  children,
  authenticatedRedirect = "/dashboard",
}: {
  children: React.ReactNode;
  /** false = não redireciona (ex.: cadastro cooperado → PIX) */
  authenticatedRedirect?: string | false;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useLayoutEffect(() => {
    dismissCooperadoBootShell();
  }, []);

  /** Redirect após o documento commitar — useLayoutEffect + replace abortava /login (couldn’t load). */
  useEffect(() => {
    if (loading || !user || !authenticatedRedirect) return;

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const dest =
      next && next.startsWith("/") && !next.startsWith("//") ? next : authenticatedRedirect;
    const onLoginWithPwaRepair =
      window.location.pathname === "/login" && params.has("hb-pwa");

    const go = () => {
      if (onLoginWithPwaRepair) {
        markPwaRepairSessionForBuild();
      }
      const pathOnly = dest.split("?")[0];
      if (window.location.pathname === pathOnly) return;
      if (isStandalonePwa()) {
        window.location.assign(dest);
      } else {
        router.replace(dest);
      }
    };

    if (document.readyState === "complete") {
      const t = window.setTimeout(go, 0);
      return () => window.clearTimeout(t);
    }
    const onLoad = () => window.setTimeout(go, 0);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, [user, loading, router, authenticatedRedirect]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md px-6 space-y-4 animate-pulse">
          <div className="h-10 bg-gray-200 rounded-lg mx-auto w-40" />
          <div className="h-64 bg-white rounded-2xl border border-gray-200" />
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md px-6 space-y-4 animate-pulse">
          <div className="h-10 bg-gray-200 rounded-lg mx-auto w-40" />
          <div className="h-64 bg-white rounded-2xl border border-gray-200" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
