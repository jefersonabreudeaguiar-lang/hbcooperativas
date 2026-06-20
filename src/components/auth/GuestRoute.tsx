"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    if (!loading && user && authenticatedRedirect) {
      router.replace(authenticatedRedirect);
    }
  }, [user, loading, router, authenticatedRedirect]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  return <>{children}</>;
}
