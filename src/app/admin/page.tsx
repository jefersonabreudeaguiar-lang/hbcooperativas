"use client";

import Link from "next/link";
import { AlertTriangle, Shield } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { isAppCreator } from "@/lib/security/appCreator";
import { PlatformAdminDashboard } from "@/components/admin/PlatformAdminDashboard";
import { AdminPortalShell } from "@/components/admin/AdminPortalShell";
import { AdminPortalLogin } from "@/components/admin/AdminPortalLogin";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AdminPortalPage() {
  const { user, loading: authLoading, loginCreatorAdmin } = useAuth();
  const data = useAppData();

  if (authLoading) {
    return (
      <AdminPortalShell>
        <div className="flex items-center justify-center min-h-[50vh] text-sm text-gray-500">
          Carregando…
        </div>
      </AdminPortalShell>
    );
  }

  if (!user) {
    return <AdminPortalLogin onLogin={loginCreatorAdmin} />;
  }

  if (!data) {
    return (
      <AdminPortalShell>
        <div className="flex items-center justify-center min-h-[50vh] text-sm text-gray-500">
          Carregando dados…
        </div>
      </AdminPortalShell>
    );
  }

  if (!isAppCreator(user)) {
    return (
      <AdminPortalShell subtitle="Acesso negado">
        <div className="max-w-lg mx-auto">
          <Card title="Acesso restrito">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
              <div>
                <p className="text-sm text-gray-700">
                  Somente o criador da plataforma pode usar <strong>/admin</strong>.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Conta atual: <strong>{user.email}</strong>
                </p>
              </div>
            </div>
            <Link href="/dashboard">
              <Button variant="secondary">Ir para o app</Button>
            </Link>
          </Card>
        </div>
      </AdminPortalShell>
    );
  }

  return (
    <AdminPortalShell subtitle={`Criador · ${user.email}`}>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
        <Shield size={18} className="shrink-0" />
        <span>Painel geral da plataforma — todas as cooperativas, uso e limites do servidor</span>
      </div>
      <PlatformAdminDashboard user={user} />
    </AdminPortalShell>
  );
}
