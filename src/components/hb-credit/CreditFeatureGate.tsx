"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function CreditFeatureGate({ children }: { children: React.ReactNode }) {
  const { enabled, loading, status, errorMessage } = useHbCreditEnabled();
  const router = useRouter();

  useEffect(() => {
    if (status === "disabled") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (loading) return <PageSkeleton />;

  if (status === "error") {
    return (
      <AlertBanner variant="warning" title="HB Créditos indisponível">
        Não foi possível confirmar o módulo no servidor. Verifique a conexão e tente novamente.
        {errorMessage ? ` (${errorMessage})` : ""}
      </AlertBanner>
    );
  }

  if (!enabled) {
    return (
      <AlertBanner variant="warning" title="HB Créditos indisponível">
        Módulo desativado neste ambiente.
      </AlertBanner>
    );
  }

  return <>{children}</>;
}
