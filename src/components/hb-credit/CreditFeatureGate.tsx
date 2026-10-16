"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser, canAccessTesoureiroArea, isParceiroAppUser } from "@/permissions";
import { isContaCoopUiPublic } from "@/utils/contaCoopUiVisibility";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function CreditFeatureGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const {
    navEnabled,
    loading: hbStatusLoading,
    status,
    errorMessage,
    parceiroNavEligible,
    cooperadoNavEligible,
    staffNavEligible,
  } = useHbCreditEnabled(user);
  const router = useRouter();
  const cooperadoExperience = Boolean(
    user && (user.role === "cooperado" || isCooperadoAppUser(user))
  );
  const parceiroExperience = Boolean(user && isParceiroAppUser(user));
  const staffHbExperience = Boolean(user && canAccessTesoureiroArea(user));
  const canEnterHbArea =
    Boolean(user) && (cooperadoExperience || parceiroExperience || staffHbExperience);
  const cooperadoHbHubOpen =
    cooperadoExperience && isContaCoopUiPublic() && Boolean(user?.cooperadoId?.trim());
  const staffHbHubOpen =
    staffHbExperience && isContaCoopUiPublic() && !cooperadoExperience && !parceiroExperience;
  const pageAllowed =
    cooperadoHbHubOpen ||
    staffHbHubOpen ||
    (canEnterHbArea &&
      (navEnabled ||
        cooperadoNavEligible ||
        staffNavEligible ||
        (parceiroExperience && (hbStatusLoading || status === "loading" || parceiroNavEligible))));

  useEffect(() => {
    if (authLoading || !user) return;
    if (parceiroExperience || cooperadoHbHubOpen || staffHbHubOpen) return;
    if (status === "disabled" && !pageAllowed) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, status, router, pageAllowed, parceiroExperience, cooperadoHbHubOpen, staffHbHubOpen]);

  if ((authLoading || hbStatusLoading) && !pageAllowed) return <PageSkeleton />;

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
