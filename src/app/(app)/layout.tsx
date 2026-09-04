import { AppShell } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { EntregaAprovadaNotifier } from "@/components/cooperado/EntregaAprovadaNotifier";
import { ComunicadoNotifier } from "@/components/cooperado/ComunicadoNotifier";
import { CooperativaSyncProvider } from "@/components/sync/CooperativaSyncProvider";
import { CooperadoFinanceiroGate } from "@/components/cooperado/CooperadoFinanceiroGate";

import { GestaoAccessGuard } from "@/components/permissions/GestaoAccessGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <CooperativaSyncProvider>
        <CooperadoFinanceiroGate>
          <GestaoAccessGuard>
            <EntregaAprovadaNotifier />
            <ComunicadoNotifier />
            <AppShell>{children}</AppShell>
          </GestaoAccessGuard>
        </CooperadoFinanceiroGate>
      </CooperativaSyncProvider>
    </ProtectedRoute>
  );
}
