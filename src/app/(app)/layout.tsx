import { AppShell } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { EntregaAprovadaNotifier } from "@/components/cooperado/EntregaAprovadaNotifier";
import { CooperativaSyncProvider } from "@/components/sync/CooperativaSyncProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <CooperativaSyncProvider>
        <EntregaAprovadaNotifier />
        <AppShell>{children}</AppShell>
      </CooperativaSyncProvider>
    </ProtectedRoute>
  );
}
