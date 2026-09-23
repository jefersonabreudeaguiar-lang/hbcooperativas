"use client";

import { useMemo, useState } from "react";
import { History, Inbox, Sparkles } from "lucide-react";
import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import { isIncidentPending } from "@/lib/lab/hobeliscoPlaybooks";
import { HobeliscoIncidentDetail } from "@/components/admin/HobeliscoIncidentDetail";
import { Button } from "@/components/ui/Button";
import { secureApiFetch } from "@/lib/security/clientSession";

type TabId = "pendentes" | "historico";

interface Props {
  incidents: HobeliscoIncidentV2[];
  alertThreshold: number;
  busyId: string | null;
  onConfirm: (incidentId: string) => void;
  onDismiss: (incidentId: string) => void;
  useAdminApi?: boolean;
  playbookApiBase?: "admin" | "lab";
  dark?: boolean;
  onRefresh?: () => void | Promise<void>;
}

function sortByUpdatedDesc(a: HobeliscoIncidentV2, b: HobeliscoIncidentV2): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function HobeliscoIncidentsSection({
  incidents,
  alertThreshold,
  busyId,
  onConfirm,
  onDismiss,
  useAdminApi = false,
  playbookApiBase = "admin",
  dark = false,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<TabId>("pendentes");
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const pending = useMemo(
    () => incidents.filter((i) => isIncidentPending(i)).sort(sortByUpdatedDesc),
    [incidents]
  );
  const history = useMemo(
    () =>
      incidents
        .filter((i) => i.status === "CONFIRMED" || i.status === "DISMISSED")
        .sort(sortByUpdatedDesc),
    [incidents]
  );

  const tabBtn = (id: TabId, label: string, count: number, icon: typeof Inbox) => {
    const Icon = icon;
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          active
            ? dark
              ? "bg-cyan-500/15 text-cyan-200 border border-cyan-500/30"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
            : dark
              ? "text-slate-400 hover:text-slate-200 border border-transparent"
              : "text-gray-600 hover:text-gray-900 border border-transparent"
        }`}
      >
        <Icon size={14} />
        {label}
        <span
          className={`rounded-full px-1.5 text-[10px] ${
            active
              ? dark
                ? "bg-cyan-500/20 text-cyan-200"
                : "bg-emerald-100 text-emerald-700"
              : dark
                ? "bg-white/5 text-slate-500"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  const seedDemo = async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const url =
        playbookApiBase === "lab"
          ? "/api/lab/hobelisco/v2/demo-incident"
          : "/api/admin/hobelisco/demo-incident";
      const fetcher = playbookApiBase === "lab" ? fetch : secureApiFetch;
      const res = await fetcher(url, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDemoError(json.error ?? "Não foi possível gerar o exemplo");
        return;
      }
      setTab("pendentes");
      await onRefresh?.();
    } catch {
      setDemoError("Falha ao gerar incidente de exemplo");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
            Painel de decisão — resumo em português
          </p>
          <p className={`text-xs mt-0.5 ${dark ? "text-slate-500" : "text-gray-500"}`}>
            O que aconteceu · o que pode acontecer · medidas sugeridas · você decide
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabBtn("pendentes", "Aguardando decisão", pending.length, Inbox)}
          {tabBtn("historico", "Histórico", history.length, History)}
        </div>
      </div>

      {tab === "pendentes" && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div
              className={`rounded-xl border border-dashed p-8 text-center ${
                dark ? "border-white/10 text-slate-500" : "border-gray-200 text-gray-500"
              }`}
            >
              <Inbox size={28} className={`mx-auto mb-2 ${dark ? "text-slate-600" : "text-gray-400"}`} />
              <p className="text-sm">Nenhum incidente aguardando decisão.</p>
              <p className="text-xs mt-2 max-w-md mx-auto">
                Quando o Hobelisco identificar algo, o resumo completo aparecerá aqui — com o que aconteceu, riscos e
                medidas sugeridas.
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={demoBusy}
                  onClick={() => void seedDemo()}
                  className={dark ? "!border-cyan-500/30 !bg-cyan-950/30 !text-cyan-200" : undefined}
                >
                  <Sparkles size={14} className="mr-1" />
                  {demoBusy ? "Gerando exemplo…" : "Gerar incidente de exemplo"}
                </Button>
                <p className="text-[10px] max-w-sm">
                  Simula 5 falhas de login na cooperativa piloto — só para testar o painel. Não altera dados reais.
                </p>
                {demoError && <p className="text-[10px] text-rose-400">{demoError}</p>}
              </div>
            </div>
          ) : (
            pending.map((inc) => (
              <HobeliscoIncidentDetail
                key={inc.incidentId}
                incident={inc}
                alertThreshold={alertThreshold}
                busy={busyId === inc.incidentId}
                useAdminApi={useAdminApi}
                playbookApiBase={playbookApiBase}
                dark={dark}
                defaultExpanded
                onConfirm={() => onConfirm(inc.incidentId)}
                onDismiss={() => onDismiss(inc.incidentId)}
              />
            ))
          )}
        </div>
      )}

      {tab === "historico" && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <div
              className={`rounded-xl border border-dashed p-8 text-center ${
                dark ? "border-white/10 text-slate-500" : "border-gray-200 text-gray-500"
              }`}
            >
              <History size={28} className={`mx-auto mb-2 ${dark ? "text-slate-600" : "text-gray-400"}`} />
              <p className="text-sm">Histórico vazio.</p>
              <p className="text-xs mt-2">Incidentes confirmados ou arquivados aparecem aqui.</p>
            </div>
          ) : (
            history.map((inc) => (
              <HobeliscoIncidentDetail
                key={inc.incidentId}
                incident={inc}
                alertThreshold={alertThreshold}
                busy={false}
                useAdminApi={useAdminApi}
                playbookApiBase={playbookApiBase}
                dark={dark}
                compact
                onConfirm={() => onConfirm(inc.incidentId)}
                onDismiss={() => onDismiss(inc.incidentId)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
