import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getPrivateAppRobotsMetadata } from "@/lib/security/crawlerPolicy";
import { CooperativaSyncProvider } from "@/components/sync/CooperativaSyncProvider";
import { CooperadoFinanceiroGate } from "@/components/cooperado/CooperadoFinanceiroGate";
import { HbCreditNavPrefetch } from "@/hooks/useHbCreditNavPrefetch";
import { AppSchedulerBootstrap } from "@/components/performance/AppSchedulerBootstrap";
import { AppIdleSecondaryBootstraps } from "@/components/performance/AppIdleSecondaryBootstraps";

import { GestaoAccessGuard } from "@/components/permissions/GestaoAccessGuard";

/** Reforço noindex — área autenticada (cooperado, mercado, responsável). */
export const metadata: Metadata = {
  robots: getPrivateAppRobotsMetadata(),
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <CooperativaSyncProvider>
        <AppSchedulerBootstrap />
        <HbCreditNavPrefetch />
        <AppIdleSecondaryBootstraps />
        <GestaoAccessGuard>
          <AppShell>
            <CooperadoFinanceiroGate>{children}</CooperadoFinanceiroGate>
          </AppShell>
        </GestaoAccessGuard>
      </CooperativaSyncProvider>
    </ProtectedRoute>
  );
}
