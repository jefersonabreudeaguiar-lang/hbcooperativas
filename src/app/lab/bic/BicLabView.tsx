"use client";

import type { BicLabMirrorHealth } from "@/lib/lab/bicLabMirrorConfig";

type Props = {
  health: BicLabMirrorHealth;
};

export function BicLabView({ health }: Props) {
  const { boundary, config, gates, bicEnvelope, npmAudit, issues, recommendations } = health;
  const banner = boundary.banner;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header
        className={
          banner.variant === "lab-active"
            ? "border-b border-emerald-700/60 bg-emerald-950/40 px-4 py-3"
            : banner.variant === "danger"
              ? "border-b border-amber-700/60 bg-amber-950/40 px-4 py-3"
              : "border-b border-slate-700 bg-slate-900 px-4 py-3"
        }
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">BIC — Banco de Informações Central</p>
        <h1 className="text-lg font-semibold">{banner.title}</h1>
        <p className="text-sm text-slate-300">{banner.subtitle}</p>
        <p className="mt-1 text-xs text-slate-500">
          Deploy: {boundary.deployKind} · Fase: {health.phase} · B4 LAB:{" "}
          {health.bicEnvelope.b4LabAuthority ? "ON" : "OFF"} · FULL:{" "}
          {health.bicEnvelope.labFullIntegration ? "ON" : "OFF"} · Veredito:{" "}
          {health.ok ? "LAB-BIC-GREEN" : "LAB-BIC-RED"}
        </p>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4">
        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Gates</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(gates).map(([k, v]) => (
              <li key={k} className={v ? "text-emerald-400" : "text-red-400"}>
                {v ? "[PASS]" : "[FAIL]"} {k}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Envelope B3 (read-only)</h2>
          <ul className="space-y-1 text-sm text-emerald-300/90">
            {Object.entries(bicEnvelope).map(([k, v]) => (
              <li key={k}>
                {v ? "✓" : "○"} {k}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Fluxo cooperado: login → sync → dashboard (M8) → ficha (M6/M7) → relatórios/fechamento via hub{" "}
            <code className="text-slate-300">bicLeituraCentral*</code>. Escrita operacional permanece legado; BIC LAB não
            substitui ledger de produção.
          </p>
        </section>

        {boundary.tripwires.length > 0 && (
          <section className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
            <h2 className="mb-2 text-sm font-semibold text-amber-200">Tripwires</h2>
            <ul className="space-y-2 text-sm text-amber-100/90">
              {boundary.tripwires.map((t) => (
                <li key={t.id}>
                  [{t.severity}] {t.id}: {t.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(issues.length > 0 || recommendations.length > 0) && (
          <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-sm">
            {issues.length > 0 && (
              <>
                <h2 className="mb-2 font-semibold text-red-300">Problemas</h2>
                <ul className="mb-3 list-disc pl-5 text-slate-300">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </>
            )}
            {recommendations.length > 0 && (
              <>
                <h2 className="mb-2 font-semibold text-slate-200">Recomendações</h2>
                <ul className="list-disc pl-5 text-slate-400">
                  {recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Bateria LAB (terminal)</h2>
          <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs text-slate-300">
            {npmAudit.join("\n")}
          </pre>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-400">
          <p>
            App espelho: pasta <code className="text-slate-200">coopeagriplla-gestao-lab-build</code> — sincronize com{" "}
            <code className="text-slate-200">npm run lab:bic-mirror-sync</code>.
          </p>
          <p className="mt-2">Produção oficial: não alterar sem autorização explícita.</p>
        </section>
      </main>
    </div>
  );
}
