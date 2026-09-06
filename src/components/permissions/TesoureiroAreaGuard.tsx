"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { canAccessTesoureiroArea } from "@/permissions";
import { AlertBanner } from "@/components/ui/AlertBanner";

/** Bloqueia perfil admin da área financeira/tesouraria da cooperativa. */
export function TesoureiroAreaGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessTesoureiroArea(user)) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || !user) return null;

  if (!canAccessTesoureiroArea(user)) {
    return (
      <div className="max-w-lg p-4">
        <AlertBanner variant="warning" title="Acesso restrito">
          Esta área é exclusiva da equipe financeira da cooperativa. O perfil administrador geral do app não
          acessa tesouraria, pagamentos e HB Créditos.
        </AlertBanner>
      </div>
    );
  }

  return <>{children}</>;
}
