"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { repairBrowserProfileIfStale } from "@/lib/pwa/browserProfileRepair";
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
    if (!loading && user && authenticatedRedirect) {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      const dest =
        next && next.startsWith("/") && !next.startsWith("//") ? next : authenticatedRedirect;
      const onLoginWithPwaRepair =
        window.location.pathname === "/login" && params.has("hb-pwa");
      if (onLoginWithPwaRepair) {
        if (isStandalonePwa()) {
          markPwaRepairSessionForBuild();
          const pathOnly = dest.split("?")[0];
          if (window.location.pathname !== pathOnly) {
            window.location.replace(dest);
          }
          return;
        }
        void repairBrowserProfileIfStale({ includeStandalone: true }).then((reloaded) => {
          if (reloaded) return;
          const pathOnly = dest.split("?")[0];
          if (window.location.pathname === pathOnly) return;
          router.replace(dest);
        });
        return;
      }

      if (isStandalonePwa()) {
        if (window.location.pathname !== dest.split("?")[0]) {
          window.location.replace(dest);
        }
      } else {
        router.replace(dest);
      }
    }
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
