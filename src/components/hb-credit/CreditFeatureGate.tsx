"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function CreditFeatureGate({ children }: { children: React.ReactNode }) {
  const { enabled, loading } = useHbCreditEnabled();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !enabled) {
      router.replace("/dashboard");
    }
  }, [enabled, loading, router]);

  if (loading) return <PageSkeleton />;
  if (!enabled) {
    return (
      <AlertBanner variant="warning" title="Conta Coop indisponível">
        Módulo desativado neste ambiente. Homologação local exige HB_CREDIT_ENABLED=true.
      </AlertBanner>
    );
  }

  return <>{children}</>;
}
