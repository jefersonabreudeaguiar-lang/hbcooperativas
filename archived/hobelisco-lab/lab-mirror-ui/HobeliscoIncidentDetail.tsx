"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import {
  buildIncidentBriefing,
  isIncidentPending,
  OUTCOME_LABELS,
  type HobeliscoPlaybook,
  type PlaybookOutcomeType,
} from "@/lib/lab/hobeliscoPlaybooks";
import { Button } from "@/components/ui/Button";
import { secureApiFetch } from "@/lib/security/clientSession";

interface Props {
  incident: HobeliscoIncidentV2;
  alertThreshold: number;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  useAdminApi?: boolean;
  playbookApiBase?: "admin" | "lab";
  dark?: boolean;
  /** Histórico: card recolhível */
  compact?: boolean;
  defaultExpanded?: boolean;
}

function BriefSection({
  title,
  items,
  dark,
  accent,
}: {
  title: string;
  items: string[];
  dark: boolean;
  accent: "blue" | "amber" | "violet";
}) {
  const accentBorder = {
    blue: dark ? "border-cyan-500/30" : "border-sky-200",
    amber: dark ? "border-amber-500/30" : "border-amber-200",
    violet: dark ? "border-violet-500/30" : "border-violet-200",
  }[accent];

  const accentTitle = {
    blue: dark ? "text-cyan-200" : "text-sky-900",
    amber: dark ? "text-amber-200" : "text-amber-900",
    violet: dark ? "text-violet-200" : "text-violet-900",
  }[accent];

  return (
    <div className={`rounded-lg border p-3 ${accentBorder} ${dark ? "bg-black/20" : "bg-white/60"}`}>
      <p className={`text-xs font-semibold mb-2 ${accentTitle}`}>{title}</p>
      <ul className={`space-y-1.5 text-xs list-disc list-inside ${dark ? "text-slate-300" : "text-gray-700"}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function HobeliscoIncidentDetail({
  incident,
  alertThreshold,
  busy,
  onConfirm,
  onDismiss,
  useAdminApi = false,
  playbookApiBase = "admin",
  dark = false,
  compact = false,
  defaultExpanded = true,
}: Props) {
  const briefing = useMemo(() => buildIncidentBriefing(incident), [incident]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  const [playbookLoaded, setPlaybookLoaded] = useState<HobeliscoPlaybook | null>(null);

  const pending = isIncidentPending(incident);
  const isConfirmed = incident.status === "CONFIRMED";
  const isDismissed = incident.status === "DISMISSED";
  const isAlert = pending && incident.confidence >= alertThreshold;

  const loadPlaybook = useCallback(async () => {
    if (!isConfirmed) return;
    const base =
      playbookApiBase === "lab"
        ? `/api/lab/hobelisco/v2/playbook?incidentId=${encodeURIComponent(incident.incidentId)}`
        : `/api/admin/hobelisco/playbook?incidentId=${encodeURIComponent(incident.incidentId)}`;
    const fetcher = playbookApiBase === "lab" ? fetch : secureApiFetch;
    const res = await fetcher(base, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { playbook: HobeliscoPlaybook | null };
      setPlaybookLoaded(json.playbook);
    }
  }, [incident.incidentId, isConfirmed, playbookApiBase]);

  useEffect(() => {
    void loadPlaybook();
  }, [loadPlaybook]);

  const saveOutcome = async (outcome: PlaybookOutcomeType) => {
    setOutcomeBusy(true);
    try {
      const url =
        playbookApiBase === "lab" ? "/api/lab/hobelisco/v2/playbook" : "/api/admin/hobelisco/playbook";
      const fetcher = playbookApiBase === "lab" ? fetch : secureApiFetch;
      await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: incident.incidentId,
          outcome,
          notes: outcomeNotes.trim() || undefined,
        }),
      });
      setOutcomeSaved(true);
    } finally {
      setOutcomeBusy(false);
    }
  };

  const border = isAlert
    ? dark
      ? "border-amber-500/40 bg-amber-950/20"
      : "border-amber-300 bg-amber-50/50"
    : dark
      ? "border-white/5 bg-white/[0.02]"
      : "border-gray-200 bg-gray-50/50";

  const statusBadge =
    isAlert && pending
      ? {
          label: "Alerta — revisar agora",
          className: dark ? "border-amber-400/50 text-amber-200 bg-amber-950/40" : "border-amber-400 text-amber-700 bg-amber-50",
        }
      : isConfirmed
        ? {
            label: "Medidas aceitas",
            className: dark ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/30" : "border-emerald-500/40 text-emerald-700 bg-emerald-50",
          }
        : isDismissed
          ? {
              label: "Arquivado",
              className: dark ? "border-slate-600 text-slate-400 bg-slate-900/40" : "border-slate-400 text-slate-600 bg-slate-50",
            }
          : {
              label: briefing.statusLabel,
              className: dark ? "border-sky-500/40 text-sky-200 bg-sky-950/30" : "border-sky-400 text-sky-700 bg-sky-50",
            };

  const decisionLabel = isConfirmed
    ? "Medidas aceitas pelo operador"
    : isDismissed
      ? "Medidas não aplicadas — arquivado"
      : null;

  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`w-full text-left rounded-xl border p-3 transition-colors ${
          dark
            ? "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
            : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${dark ? "text-slate-200" : "text-gray-900"}`}>{briefing.title}</p>
            <p className={`text-[10px] mt-1 ${dark ? "text-slate-500" : "text-gray-500"}`}>
              {decisionLabel ?? briefing.eventTypeLabel}
              {incident.cooperativeId ? ` · ${incident.cooperativeId}` : ""}
              {" · "}
              {new Date(incident.updatedAt).toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] rounded-full px-2 py-0.5 border font-medium ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            <ChevronDown size={14} className={dark ? "text-slate-500" : "text-gray-400"} />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0 space-y-1">
          <p className={`text-base font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{briefing.title}</p>
          <p className={`text-xs ${dark ? "text-slate-400" : "text-gray-500"}`}>
            {briefing.eventTypeLabel}
            {incident.cooperativeId ? ` · Cooperativa ${incident.cooperativeId}` : ""}
            {" · "}
            Gravidade {briefing.severityLabel.toLowerCase()}
            {" · "}
            Confiança {(incident.confidence * 100).toFixed(0)}%
          </p>
          <p className={`font-mono text-[10px] ${dark ? "text-slate-600" : "text-gray-400"}`}>{incident.incidentId}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {compact && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className={`rounded-lg p-1.5 ${dark ? "text-slate-500 hover:text-slate-300 hover:bg-white/5" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
              title="Recolher"
            >
              <ChevronUp size={14} />
            </button>
          )}
          <span className={`text-[10px] rounded-full px-2.5 py-1 border shrink-0 font-medium ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <BriefSection title="O que aconteceu" items={briefing.whatHappened} dark={dark} accent="blue" />
        <BriefSection
          title="O que pode acontecer se nada for feito"
          items={briefing.whatCouldHappen}
          dark={dark}
          accent="amber"
        />
        <div className={`rounded-lg border p-3 ${dark ? "border-violet-500/20 bg-violet-950/10" : "border-violet-200 bg-violet-50/40"}`}>
          <p className={`text-xs font-semibold mb-2 ${dark ? "text-violet-200" : "text-violet-900"}`}>
            Medidas recomendadas — você executa manualmente
          </p>
          <ol className={`space-y-1.5 text-xs list-decimal list-inside ${dark ? "text-slate-300" : "text-gray-700"}`}>
            {briefing.measures.map((s) => (
              <li key={s.order}>{s.text}</li>
            ))}
          </ol>
          <p className={`text-[10px] mt-3 ${dark ? "text-slate-500" : "text-gray-500"}`}>{briefing.disclaimer}</p>
        </div>
      </div>

      {pending && (
        <div className={`mt-4 rounded-lg border p-3 ${dark ? "border-white/10 bg-black/30" : "border-gray-200 bg-white"}`}>
          <p className={`text-xs font-medium mb-3 ${dark ? "text-slate-200" : "text-gray-800"}`}>
            Você vai aplicar estas medidas?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onConfirm} disabled={busy}>
              Sim, vou aplicar estas medidas
            </Button>
            <Button variant="secondary" size="sm" onClick={onDismiss} disabled={busy}>
              Não, não vou aplicar
            </Button>
          </div>
          <p className={`text-[10px] mt-2 ${dark ? "text-slate-500" : "text-gray-500"}`}>
            &quot;Sim&quot; registra que você aceita o playbook e vai executá-lo. &quot;Não&quot; arquiva o alerta como
            falso alarme ou situação ignorada — o Hobelisco não faz nada sozinho.
          </p>
        </div>
      )}

      {isConfirmed && (
        <div className={`mt-4 rounded-lg border p-3 ${dark ? "border-emerald-500/30 bg-emerald-950/10" : "border-emerald-200 bg-emerald-50/50"}`}>
          <p className={`text-xs font-medium ${dark ? "text-emerald-300" : "text-emerald-800"}`}>
            Você confirmou que vai aplicar as medidas acima. Execute o passo a passo e registre o resultado abaixo.
          </p>
          {playbookLoaded && playbookLoaded.title !== briefing.playbookTitle && (
            <p className={`text-[10px] mt-1 ${dark ? "text-slate-500" : "text-gray-500"}`}>{playbookLoaded.title}</p>
          )}
        </div>
      )}

      {isDismissed && (
        <div className={`mt-4 rounded-lg border p-3 ${dark ? "border-slate-600 bg-slate-900/30" : "border-slate-200 bg-slate-50"}`}>
          <p className={`text-xs ${dark ? "text-slate-400" : "text-gray-600"}`}>
            Você optou por não aplicar as medidas. Incidente arquivado — nenhuma ação automática foi executada.
          </p>
        </div>
      )}

      {isConfirmed && (useAdminApi || playbookApiBase === "lab") && !outcomeSaved && (
        <div className="mt-4 space-y-2">
          <p className={`text-xs font-medium ${dark ? "text-slate-300" : "text-gray-700"}`}>
            Depois de executar, como ficou?
          </p>
          <textarea
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            placeholder="Opcional: o que você fez ou encontrou…"
            className={`w-full rounded-lg border px-3 py-2 text-xs ${
              dark ? "border-white/10 bg-black/30 text-slate-200" : "border-gray-200 bg-white text-gray-800"
            }`}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(OUTCOME_LABELS) as PlaybookOutcomeType[]).map((key) => (
              <Button key={key} variant="secondary" size="sm" disabled={outcomeBusy} onClick={() => void saveOutcome(key)}>
                {OUTCOME_LABELS[key]}
              </Button>
            ))}
          </div>
        </div>
      )}

      {outcomeSaved && (
        <p className={`mt-3 text-xs ${dark ? "text-emerald-400" : "text-emerald-700"}`}>
          Resultado registrado. Aprendizado proposto para revisão futura.
        </p>
      )}
    </div>
  );
}
