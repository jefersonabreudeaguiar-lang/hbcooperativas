import { AppShell } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { EntregaAprovadaNotifier } from "@/components/cooperado/EntregaAprovadaNotifier";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <EntregaAprovadaNotifier />
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
