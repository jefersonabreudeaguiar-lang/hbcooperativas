"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { isAppCreator } from "@/lib/security/appCreator";
import { secureApiFetch } from "@/lib/security/clientSession";
import { getCurrentMesReferencia } from "@/utils/format";
import type { ContaCoopPlatformOverview } from "@/services/platformContaCoopAdminService";
import { AdminInicioPanel } from "@/components/admin/AdminInicioPanel";
import { AdminCobrancaPanel } from "@/components/admin/AdminCobrancaPanel";
import { AdminContaCoopPanel } from "@/components/admin/AdminContaCoopPanel";
import { AdminCooperativasPanel } from "@/components/admin/AdminCooperativasPanel";
import { AdminSistemaPanel } from "@/components/admin/AdminSistemaPanel";
import { AdminPortalShell } from "@/components/admin/AdminPortalShell";
import { AdminPortalLogin } from "@/components/admin/AdminPortalLogin";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { listarCobrancasSaasAdmin } from "@/services/cobrancaSaasService";
import type { AdminSection } from "@/components/admin/AdminNav";

export default function AdminPortalPage() {
  const { user, loading: authLoading, loginCreatorAdmin } = useAuth();
  const canAccess = !authLoading && !!user && isAppCreator(user);
  const data = useAppData();
  const [section, setSection] = useState<AdminSection>("inicio");
  const [contaCoopPendentes, setContaCoopPendentes] = useState(0);

  useEffect(() => {
    if (!canAccess) return;
    const controller = new AbortController();
    void secureApiFetch(`/api/admin/conta-coop-overview?mes=${getCurrentMesReferencia()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json: { overview?: ContaCoopPlatformOverview }) => {
        if (controller.signal.aborted) return;
        const overview = json.overview;
        if (!overview) {
          setContaCoopPendentes(0);
          return;
        }
        const pendentes = overview.cooperativas.filter(
          (row) => row.appRepassePendenteCents > 0 && !row.repasseConfirmado
        ).length;
        setContaCoopPendentes(pendentes);
      })
      .catch(() => { if (!controller.signal.aborted) setContaCoopPendentes(0); });
    return () => controller.abort();
  }, [canAccess, user?.id]);

  const badges = useMemo(() => {
    if (!canAccess || !data) return {};
    const rows = listarCobrancasSaasAdmin(data);
    const cobrancaPendente = rows.filter((r) => r.aguardandoConfirmacao || r.statusMes === "bloqueado").length;
    return {
      cobranca: cobrancaPendente > 0 ? cobrancaPendente : undefined,
      "conta-coop": contaCoopPendentes > 0 ? contaCoopPendentes : undefined,
    } satisfies Partial<Record<AdminSection, number>>;
  }, [canAccess, contaCoopPendentes, data]);

  if (authLoading) {
    return (
      <AdminPortalShell activeSection={section} onSectionChange={setSection}>
        <div className="flex items-center justify-center min-h-[40vh] text-sm text-gray-500">Carregando…</div>
      </AdminPortalShell>
    );
  }

  if (!user) {
    return <AdminPortalLogin onLogin={loginCreatorAdmin} />;
  }

  if (!isAppCreator(user)) {
    return (
      <AdminPortalShell activeSection={section} onSectionChange={setSection} subtitle="Acesso negado">
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
    <AdminPortalShell
      activeSection={section}
      onSectionChange={setSection}
      subtitle={`Criador · ${user.email}`}
      badges={badges}
    >
      {section === "inicio" && <AdminInicioPanel onNavigate={setSection} />}
      {section === "cobranca" && <AdminCobrancaPanel user={user} />}
      {section === "conta-coop" && <AdminContaCoopPanel />}
      {section === "cooperativas" && <AdminCooperativasPanel />}
      {section === "sistema" && <AdminSistemaPanel user={user} />}
    </AdminPortalShell>
  );
}
