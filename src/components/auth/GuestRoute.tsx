"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";

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
    if (!loading && user && authenticatedRedirect) {
      router.replace(authenticatedRedirect);
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

  if (user) return null;

  return <>{children}</>;
}
