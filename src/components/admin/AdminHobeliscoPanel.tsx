"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, RefreshCw, Shield, ExternalLink } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { secureApiFetch } from "@/lib/security/clientSession";
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";
import { HobeliscoIncidentsSection } from "@/components/admin/HobeliscoIncidentsSection";
import { HobeliscoLabMirrorBadge } from "@/components/admin/HobeliscoLabMirrorBadge";
import type { HobeliscoAdminOverview } from "@/lib/lab/hobeliscoAdminOverview";

export function AdminHobeliscoPanel() {
  const [overview, setOverview] = useState<HobeliscoAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await secureApiFetch("/api/admin/hobelisco/overview", { cache: "no-store" });
      if (res.ok) setOverview(await res.json());
      else setOverview(null);
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  const handleIncident = useCallback(
    async (incidentId: string, action: "confirm" | "dismiss") => {
      setBusyId(incidentId);
      try {
        await secureApiFetch("/api/admin/hobelisco/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, incidentId }),
        });
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  if (loading && !overview) {
    return <p className="text-sm text-gray-500 py-12 text-center">Carregando Hobelisco…</p>;
  }

  if (!overview?.enabled) {
    return (
      <div className="space-y-4">
        <AdminSectionHeader
          title="Hobelisco"
          description="LAB espelho isolado — Hobelisco nunca opera na produção oficial."
        />
        <HobeliscoLabMirrorBadge />
        <AlertBanner variant="info">
          Observer V2 desativado neste deploy ou fronteira bloqueada. Para o espelho LAB, copie{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">.env.hobelisco-lab.example</code>{" "}
          e execute{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">npm run hobelisco:lab:activate</code>.
          Staging observe-only:{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">npm run hobelisco:staging:activate</code>.
          Ver{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">docs/hobelisco/lab-mirror-runbook.md</code>.
        </AlertBanner>
        <Link href="/lab/hobelisco">
          <Button variant="secondary" size="sm">
            <ExternalLink size={14} className="mr-1" />
            Abrir LAB Hobelisco
          </Button>
        </Link>
      </div>
    );
  }

  const integrity = Math.round((overview.metrics?.observationIntegrityRate ?? 0) * 100);
  const pending = overview.incidents.filter((i) => i.status === "CORRELATED" || i.status === "OBSERVED");
  const alerts = pending.filter((i) => i.confidence >= overview.alertThreshold);

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Hobelisco"
        description="Perceber → correlacionar → resumir em português → você decide e executa."
      />

      <HobeliscoLabMirrorBadge />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin mr-1" : "mr-1"} />
          Atualizar
        </Button>
        <Link href="/lab/hobelisco">
          <Button variant="secondary" size="sm">
            <ExternalLink size={14} className="mr-1" />
            LAB completo
          </Button>
        </Link>
      </div>

      {overview.observeOnly && (
        <AlertBanner variant="info">
          Modo <strong>STAGING observe-only</strong> — Hobelisco registra eventos e alertas. Não bloqueia login, sync ou
          crédito. Você escolhe se aplica as medidas sugeridas.
        </AlertBanner>
      )}

      {alerts.length > 0 && (
        <AlertBanner variant="warning">
          <strong>{alerts.length}</strong> incidente(s) com confiança ≥ {(overview.alertThreshold * 100).toFixed(0)}%
          aguardam sua decisão abaixo.
        </AlertBanner>
      )}

      <Card title="Incidentes">
        <HobeliscoIncidentsSection
          incidents={overview.incidents}
          alertThreshold={overview.alertThreshold}
          busyId={busyId}
          useAdminApi
          onRefresh={load}
          onConfirm={(id) => void handleIncident(id, "confirm")}
          onDismiss={(id) => void handleIncident(id, "dismiss")}
        />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ambiente", value: overview.environment, icon: Shield },
          { label: "Observer", value: overview.running ? "Ativo" : "Parado", icon: Eye },
          { label: "Integridade", value: `${integrity}%`, icon: RefreshCw },
          { label: "Pendentes", value: String(overview.pendingCount), icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="!p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Icon size={14} />
              {label}
            </div>
            <p className="text-lg font-semibold text-gray-900">{value}</p>
          </Card>
        ))}
      </div>

      <Card title="Restrições operacionais">
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Somente leitura — nunca altera HB Coop automaticamente</li>
          <li>Medidas sempre executadas por você, fora do Hobelisco</li>
          <li>Produção bloqueada por design nesta fase</li>
          <li>Persistência: {overview.persistence.connectionStatus}</li>
        </ul>
      </Card>
    </div>
  );
}
