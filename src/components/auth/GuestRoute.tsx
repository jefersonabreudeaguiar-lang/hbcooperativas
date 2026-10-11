"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

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
      if (isStandalonePwa()) {
        const path = authenticatedRedirect;
        if (window.location.pathname !== path) {
          window.location.replace(path);
        }
      } else {
        router.replace(authenticatedRedirect);
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
