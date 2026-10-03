"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser, canAccessTesoureiroArea, isParceiroAppUser } from "@/permissions";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function CreditFeatureGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { enabled, navEnabled, loading, status, errorMessage, parceiroNavEligible } = useHbCreditEnabled(user);
  const router = useRouter();
  const cooperadoExperience = Boolean(user && isCooperadoAppUser(user));
  const parceiroExperience = Boolean(user && isParceiroAppUser(user));
  const canEnterHbArea =
    Boolean(user) &&
    (cooperadoExperience || parceiroExperience || (user ? canAccessTesoureiroArea(user) : false));
  const pageAllowed =
    canEnterHbArea &&
    (navEnabled || (parceiroExperience && (loading || status === "loading" || parceiroNavEligible)));

  useEffect(() => {
    if (parceiroExperience) return;
    if (status === "disabled" && !pageAllowed) {
      router.replace("/dashboard");
    }
  }, [status, router, pageAllowed, parceiroExperience]);

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
      {status === "error" && pageAllowed && (
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
