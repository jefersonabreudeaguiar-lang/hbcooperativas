"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { SyncAuditReport } from "@lab/sync-update/types";

interface SyncLabViewProps {
  report: SyncAuditReport;
}

export function SyncLabView({ report: initial }: SyncLabViewProps) {
  const router = useRouter();
  const [report, setReport] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/sync-audit", { cache: "no-store" });
      if (!res.ok) {
        setError("Laboratório indisponível.");
        return;
      }
      const json = (await res.json()) as SyncAuditReport;
      setReport(json);
      router.refresh();
    } catch {
      setError("Falha ao recarregar auditoria.");
    } finally {
      setLoading(false);
    }
  }

  const sim = report.simulation;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Laboratório isolado — não é produção
            </p>
            <h1 className="text-lg font-bold text-gray-900">Sync / Atualização — Antes vs Depois</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Recalculando…" : "Recalcular"}
            </Button>
            <Link
              href="/"
              className="text-sm text-green-700 hover:text-green-800 font-medium"
            >
              Voltar ao app
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <p className="text-sm text-gray-600">
          Escala simulada: {report.scale.cooperados} cooperados · {report.scale.cooperativas}{" "}
          cooperativas · código em <code className="text-xs bg-gray-100 px-1 rounded">lab/sync-update/</code>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Nota ANTES" value={`${report.beforeOverall}/10`} variant="warning" />
          <StatCard title="Nota DEPOIS (lab)" value={`${report.afterOverall}/10`} variant="success" />
          <StatCard title="Delta" value={`+${report.delta}`} variant="success" />
          <StatCard
            title="Economia bytes/dia"
            value={`${sim.savingsBytesPct}%`}
            subtitle={`${sim.savingsRequestsPct}% requisições`}
            variant="success"
          />
        </div>

        <Card title="Dimensões — Antes vs Depois">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-4">Dimensão</th>
                  <th className="py-2 px-2 text-center">Antes</th>
                  <th className="py-2 px-2 text-center">Depois</th>
                  <th className="py-2 px-2 text-center">Δ</th>
                </tr>
              </thead>
              <tbody>
                {report.before.map((b, i) => {
                  const a = report.after[i];
                  const delta = Math.round((a.score - b.score) * 10) / 10;
                  return (
                    <tr key={b.id} className="border-b border-gray-50">
                      <td className="py-3 pr-4 font-medium text-gray-800">{b.label}</td>
                      <td className="py-3 px-2 text-center text-gray-600">{b.score}/10</td>
                      <td className="py-3 px-2 text-center font-semibold text-green-700">{a.score}/10</td>
                      <td className="py-3 px-2 text-center text-green-600">+{delta}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Simulação — 1 dia operacional">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Requisições Edge (baseline)</dt>
                <dd className="font-mono font-medium">{sim.baseline.edgeRequests.toLocaleString("pt-BR")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Requisições Edge (proposta)</dt>
                <dd className="font-mono font-medium text-green-700">
                  {sim.proposed.edgeRequests.toLocaleString("pt-BR")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Bytes baseline</dt>
                <dd className="font-mono">{sim.baseline.bytesTransferredMb.toLocaleString("pt-BR")} MB</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Bytes proposta</dt>
                <dd className="font-mono text-green-700">
                  {sim.proposed.bytesTransferredMb.toLocaleString("pt-BR")} MB
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Pulls redundantes — antes</dt>
                <dd>{sim.baseline.redundantPullPct}%</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Pulls redundantes — depois</dt>
                <dd className="text-green-700">{sim.proposed.redundantPullPct}%</dd>
              </div>
            </dl>
          </Card>

          <Card title="Coerência — teste sintético">
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-900">Baseline (Build 59)</p>
                <p className="mt-1 text-amber-800">
                  Detecta {report.coherence.baselineIssues} issue(s) com ficha duplicada, mas não bloqueia
                  push estruturalmente.
                </p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="font-medium text-green-900">Proposta lab</p>
                <p className="mt-1 text-green-800">
                  Push bloqueado: {report.coherence.proposedBlocked === 1 ? "SIM" : "NÃO"} · Warnings:{" "}
                  {report.coherence.proposedWarnings}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Notas detalhadas">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {report.before.map((b, i) => {
              const a = report.after[i];
              return (
                <div key={b.id} className="rounded-lg border border-gray-100 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-800">{b.label}</h3>
                    <span className="text-xs text-gray-500">
                      {b.score} → {a.score}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    <span className="font-medium text-amber-800">Antes: </span>
                    {b.notes}
                  </p>
                  <p className="text-xs text-gray-600">
                    <span className="font-medium text-green-800">Depois: </span>
                    {a.notes}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
          <p className="font-semibold">Promoção segura para produção</p>
          <p className="mt-2">
            Somente após: (1) manifest API por slice na nuvem, (2) regressão{" "}
            <code className="bg-white/60 px-1 rounded">npm run test:sync-flows</code>, (3) piloto em 1
            cooperativa. Nada deste lab altera <code className="bg-white/60 px-1 rounded">src/services/cooperativaSyncCloudService.ts</code>.
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Gerado em {new Date(report.generatedAt).toLocaleString("pt-BR")} ·{" "}
          <code>npm run lab:sync-audit</code>
        </p>
      </main>
    </div>
  );
}
