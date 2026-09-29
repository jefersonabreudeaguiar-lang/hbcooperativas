"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function CreditFeatureGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { enabled, navEnabled, loading, status, errorMessage } = useHbCreditEnabled(user);
  const router = useRouter();
  const cooperadoExperience = Boolean(user && isCooperadoAppUser(user));
  const pageAllowed = enabled || (cooperadoExperience && navEnabled);

  useEffect(() => {
    if (status === "disabled" && !pageAllowed) {
      router.replace("/dashboard");
    }
  }, [status, router, pageAllowed]);

  if (loading && !pageAllowed) return <PageSkeleton />;

  if (status === "error" && !pageAllowed) {
    return (
      <AlertBanner variant="warning" title="HB Créditos indisponível">
        Não foi possível confirmar o módulo no servidor. Verifique a conexão e tente novamente.
        {errorMessage ? ` (${errorMessage})` : ""}
      </AlertBanner>
    );
  }

  if (!pageAllowed) {
    return (
      <AlertBanner variant="warning" title="HB Créditos indisponível">
        Módulo desativado neste ambiente.
      </AlertBanner>
    );
  }

  return (
    <>
      {status === "error" && cooperadoExperience && (
        <AlertBanner variant="warning" title="Conexão com o módulo">
          Não foi possível confirmar o status remoto agora. Você pode usar a HB Créditos; se algo falhar, atualize a
          página.
          {errorMessage ? ` (${errorMessage})` : ""}
        </AlertBanner>
      )}
      {children}
    </>
  );
}
