"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { HbCreditOpsHealthSnapshot } from "@/lib/hb-credit/security/hbCreditOpsHealth";
import { HB_CREDIT_RUNBOOK_STEPS } from "@/lib/hb-credit/security/hbCreditOpsRunbook";
import { fetchCreditOpsHealth } from "@/services/creditApiService";
import { cn, formatDateTime } from "@/utils/format";
import { Loader2, RefreshCw } from "lucide-react";

type Props = {
  cnpj: string;
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ok ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"
      )}
    >
      {label}
    </span>
  );
}

export function ContaCoopOpsHealthPanel({ cnpj }: Props) {
  const [snapshot, setSnapshot] = useState<HbCreditOpsHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await fetchCreditOpsHealth(cnpj);
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a saúde HB.");
    } finally {
      setLoading(false);
    }
  }, [cnpj]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-600">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        Carregando saúde HB…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Saúde HB Créditos</h2>
          <p className="text-sm text-gray-600">
            Operação, fases de segurança e runbook — cooperado só é afetado se operações pausarem ou enforce
            estiver ligado.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      {snapshot && (
        <>
          <AlertBanner variant="info" title="Impacto no cooperado (agora)">
            {snapshot.cooperadoImpact}
          </AlertBanner>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="space-y-2 !p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Runtime</p>
              <div className="flex flex-wrap gap-2">
                <StatusPill ok={snapshot.runtime.moduleEnabled} label="Módulo HB" />
                <StatusPill ok={snapshot.runtime.operationsEnabled} label="Operações" />
                <StatusPill ok={snapshot.runtime.apiSecurityEnforced} label="API segura" />
              </div>
              <p className="text-xs text-gray-500">
                Atualizado {formatDateTime(snapshot.checkedAt)}
              </p>
            </Card>
            <Card className="space-y-2 !p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fases A e B</p>
              <p className="text-sm text-gray-800">
                <span className="font-medium">A (integridade):</span> {snapshot.phaseA.label}
              </p>
              <p className="text-sm text-gray-800">
                <span className="font-medium">B (antifraude):</span> {snapshot.phaseB.label}
              </p>
            </Card>
          </div>

          <Card className="!p-4">
            <p className="text-sm font-semibold text-gray-900">Alertas nas últimas 24 h</p>
            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              {snapshot.guards24h.map((g) => (
                <li key={g.action} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-2">
                  <span className="font-mono text-xs">{g.action}</span>
                  <span>
                    {g.count24h} evento(s)
                    {g.highPriority24h > 0 ? ` · ${g.highPriority24h} HIGH` : ""}
                    {g.lastAt ? ` · último ${formatDateTime(g.lastAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {snapshot.recentEvents.length > 0 && (
            <Card className="!p-4">
              <p className="text-sm font-semibold text-gray-900">Últimos eventos</p>
              <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
                {snapshot.recentEvents.map((ev, i) => (
                  <li key={`${ev.createdAt}-${i}`}>
                    <span className="text-xs text-gray-400">{formatDateTime(ev.createdAt)}</span>
                    {" — "}
                    {ev.summary}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {snapshot.recommendations.length > 0 && (
            <AlertBanner variant="warning" title="Recomendações">
              <ul className="list-disc pl-5 text-sm">
                {snapshot.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </AlertBanner>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Runbook (Fase C)</h3>
            {HB_CREDIT_RUNBOOK_STEPS.map((section) => (
              <details key={section.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <summary className="cursor-pointer font-medium text-gray-900">{section.title}</summary>
                <p className="mt-2 text-xs text-gray-500">{section.when}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
