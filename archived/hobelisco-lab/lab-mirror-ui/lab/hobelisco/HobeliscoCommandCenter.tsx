"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Eye,
  LayoutDashboard,
  MessageCircle,
  Play,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ArenaReport, DialogueReply, HobeliscoSnapshot } from "@lab/hobelisco-hx/types";
import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import { Button } from "@/components/ui/Button";
import { HobeliscoTimelinePanel } from "./HobeliscoTimelinePanel";
import { HobeliscoIncidentsSection } from "@/components/admin/HobeliscoIncidentsSection";

type TabId = "visao" | "observe" | "timeline" | "incidentes" | "canal";

interface V2Status {
  environment: string;
  running: boolean;
  observeOnly: boolean;
  persistence: { connectionStatus: string };
  metrics: {
    observationsReceived: number;
    observationsPersisted: number;
    incidentsObserved: number;
    observationIntegrityRate?: number;
  } | null;
  heartbeat: { status: string; lines: string[] } | null;
}

interface ChatMessage {
  role: "user" | "hobelisco";
  text: string;
  meta?: string;
}

interface Props {
  snapshot: HobeliscoSnapshot;
  arena: ArenaReport;
  onRefresh: () => Promise<void>;
  onRunArena: () => Promise<void>;
  loading: boolean;
  arenaLoading: boolean;
}

const TABS: { id: TabId; label: string; icon: typeof Eye }[] = [
  { id: "visao", label: "Visão", icon: LayoutDashboard },
  { id: "observe", label: "Observe", icon: Eye },
  { id: "timeline", label: "Timeline", icon: Activity },
  { id: "incidentes", label: "Incidentes", icon: AlertTriangle },
  { id: "canal", label: "Canal", icon: MessageCircle },
];

function vitalityColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 65) return "text-amber-400";
  return "text-rose-400";
}

function statusDot(ok: boolean, warn?: boolean): string {
  if (ok) return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
  if (warn) return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
  return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]";
}

export function HobeliscoCommandCenter({
  snapshot,
  arena,
  onRefresh,
  onRunArena,
  loading,
  arenaLoading,
}: Props) {
  const [tab, setTab] = useState<TabId>(() => "incidentes");
  const [v2, setV2] = useState<V2Status | null>(null);
  const [incidents, setIncidents] = useState<HobeliscoIncidentV2[]>([]);
  const [observeBusy, setObserveBusy] = useState(false);
  const [incidentBusyId, setIncidentBusyId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "hobelisco",
      text: "Canal determinístico ativo. Pergunte sobre saúde, estado, sensores ou ameaças.",
      meta: `${snapshot.state} · ${snapshot.health.overall}/100`,
    },
  ]);

  const loadV2 = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/hobelisco/v2");
      if (res.ok) setV2(await res.json());
    } catch {
      setV2(null);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/hobelisco/v2/incidents");
      if (res.ok) {
        const json = await res.json();
        setIncidents(json.incidents ?? []);
      }
    } catch {
      setIncidents([]);
    }
  }, []);

  useEffect(() => {
    void loadV2();
    void loadIncidents();
    const id = setInterval(() => {
      void loadV2();
      void loadIncidents();
    }, 15000);
    return () => clearInterval(id);
  }, [loadV2, loadIncidents]);

  const runObserve = useCallback(async () => {
    setObserveBusy(true);
    try {
      const res = await fetch("/api/lab/hobelisco/v2", { method: "POST" });
      if (res.ok) {
        await loadV2();
        await loadIncidents();
      }
    } finally {
      setObserveBusy(false);
    }
  }, [loadV2, loadIncidents]);

  const handleIncident = useCallback(
    async (incidentId: string, action: "confirm" | "dismiss") => {
      setIncidentBusyId(incidentId);
      try {
        await fetch("/api/lab/hobelisco/v2/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, incidentId }),
        });
        await loadIncidents();
      } finally {
        setIncidentBusyId(null);
      }
    },
    [loadIncidents]
  );

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setChatBusy(true);
    try {
      const res = await fetch("/api/lab/hobelisco/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        setMessages((m) => [...m, { role: "hobelisco", text: "Canal indisponível." }]);
        return;
      }
      const data = (await res.json()) as { reply: DialogueReply };
      setMessages((m) => [...m, { role: "hobelisco", text: data.reply.answer, meta: data.reply.disclaimer }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatBusy]);

  const integrity = Math.round((v2?.metrics?.observationIntegrityRate ?? 0) * 100);
  const observerOk = v2?.persistence.connectionStatus === "OK" && v2?.running;
  const pendingIncidents = incidents.filter((i) => i.status === "CORRELATED" || i.status === "OBSERVED").length;
  const alertIncidents = incidents.filter(
    (i) =>
      (i.status === "CORRELATED" || i.status === "OBSERVED") && i.confidence >= 0.7
  ).length;

  return (
    <div className="space-y-5">
      {alertIncidents > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>{alertIncidents}</strong> incidente(s) com confiança ≥ 70% — revise o resumo na aba{" "}
            <button type="button" onClick={() => setTab("incidentes")} className="underline hover:text-amber-100">
              Incidentes
            </button>{" "}
            ou em <strong>/admin</strong> → Hobelisco.
          </span>
        </div>
      )}
      {/* Vitals strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: "Vitalidade",
            value: `${snapshot.health.overall}`,
            sub: snapshot.state,
            color: vitalityColor(snapshot.health.overall),
          },
          {
            label: "Observer",
            value: v2?.running ? "ON" : "OFF",
            sub: v2?.environment ?? "—",
            color: observerOk ? "text-emerald-400" : "text-amber-400",
            dot: observerOk,
          },
          {
            label: "Integridade",
            value: v2 ? `${integrity}%` : "—",
            sub: v2?.persistence.connectionStatus ?? "—",
            color: integrity >= 90 ? "text-emerald-400" : "text-amber-400",
          },
          {
            label: "Incidentes",
            value: String(pendingIncidents),
            sub: "aguardam humano",
            color: pendingIncidents ? "text-amber-400" : "text-slate-400",
          },
          {
            label: "Arena",
            value: `${arena.scenariosPassed}/${arena.scenariosRun}`,
            sub: arena.allMandatoryPassed ? "PASS" : "FAIL",
            color: arena.allMandatoryPassed ? "text-emerald-400" : "text-rose-400",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl px-4 py-3"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.04] to-violet-600/[0.04]" />
            <p className="relative text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500">{kpi.label}</p>
            <p className={`relative text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
            <p className="relative text-[10px] text-slate-500 truncate">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Nav + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 p-1 rounded-2xl border border-white/[0.06] bg-black/20">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                tab === id
                  ? "bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-100 border border-cyan-500/30"
                  : "text-slate-500 hover:text-slate-300 border border-transparent"
              }`}
            >
              <Icon size={14} />
              {label}
              {id === "incidentes" && pendingIncidents > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-300">{pendingIncidents}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void onRefresh()} disabled={loading} className="!border-white/10 !bg-white/5">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button size="sm" onClick={() => void onRunArena()} disabled={arenaLoading} className="!from-violet-600 !to-cyan-600">
            <Zap size={14} />
            Arena
          </Button>
        </div>
      </div>

      {/* Tab content */}
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 backdrop-blur-xl min-h-[420px]">
        {tab === "visao" && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-cyan-500/10 bg-cyan-950/10 p-4">
                <div className="flex items-center gap-2 text-cyan-400/80 text-xs uppercase tracking-wider mb-2">
                  <Radio size={14} /> Heartbeat
                </div>
                <pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap">{snapshot.heart.lines.join("\n")}</pre>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {snapshot.sensors.slice(0, 9).map((s) => (
                  <div key={s.sensor} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-400">{s.sensor}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(s.level === "OK", s.level === "WARN")}`} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 truncate">{s.message}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-violet-500/10 bg-violet-950/10 p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Saúde global</p>
                <p className={`text-5xl font-black tabular-nums ${vitalityColor(snapshot.health.overall)}`}>
                  {snapshot.health.overall}
                </p>
              </div>
              <div className="rounded-xl border border-white/5 p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">DNA · Defesa</p>
                <p className="text-xs text-slate-300 font-mono">{snapshot.defenseDnaVersion}</p>
                <p className="text-[10px] text-slate-500">{snapshot.rulesActive} regras · Risco {snapshot.riskLevel}</p>
              </div>
              {snapshot.recentThreats.length > 0 && (
                <div className="rounded-xl border border-rose-500/10 bg-rose-950/10 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-rose-400/80 mb-2">Ameaças</p>
                  {snapshot.recentThreats.slice(0, 3).map((t) => (
                    <p key={t.id} className="text-[10px] text-rose-200/80 font-mono truncate">
                      [{t.severity}] {t.fingerprint}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "observe" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-cyan-100 flex items-center gap-2">
                  <Eye size={18} /> Observador HB Coop
                </h2>
                <p className="text-xs text-slate-500 mt-1">Read-only · HB Credit Watch · humano decide</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await fetch("/api/lab/hobelisco/credit-watch", { method: "POST" });
                    await loadV2();
                    await loadIncidents();
                  }}
                  className="!border-white/10 !bg-white/5"
                >
                  Credit Watch
                </Button>
                <Button size="sm" onClick={() => void runObserve()} disabled={observeBusy} className="!from-cyan-600 !to-emerald-600">
                  <Play size={14} className="mr-1" />
                  {observeBusy ? "Observando…" : "Ciclo observe"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {[
                ["Ambiente", v2?.environment ?? "—"],
                ["Observer", v2?.running ? "RUNNING" : "STOPPED"],
                ["Persistência", v2?.persistence.connectionStatus ?? "—"],
                ["Observe-only", v2?.observeOnly ? "SIM" : "NÃO"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <p className="text-slate-500">{k}</p>
                  <p className="font-mono text-slate-200 mt-1">{v}</p>
                </div>
              ))}
            </div>

            {v2?.metrics && (
              <div className="rounded-xl border border-cyan-500/10 bg-cyan-950/5 p-4 font-mono text-xs text-cyan-200/70 space-y-1">
                <p>Received {v2.metrics.observationsReceived} · Persisted {v2.metrics.observationsPersisted} · Candidates {v2.metrics.incidentsObserved}</p>
                {v2.heartbeat && (
                  <p className="text-slate-500">Heartbeat {v2.heartbeat.status} · {v2.heartbeat.lines[2]}</p>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-950/10 p-3 text-xs text-amber-200/70">
              <Shield size={14} className="shrink-0 mt-0.5" />
              Auto-capture ativo em rotas /api/* (401 auth + tráfego autenticado). Nunca muta HB Coop.
            </div>
          </div>
        )}

        {tab === "timeline" && (
          <div className="p-2">
            <HobeliscoTimelinePanel />
          </div>
        )}

        {tab === "incidentes" && (
          <div className="p-6">
            <HobeliscoIncidentsSection
              incidents={incidents}
              alertThreshold={0.7}
              busyId={incidentBusyId}
              dark
              playbookApiBase="lab"
              onRefresh={loadIncidents}
              onConfirm={(id) => void handleIncident(id, "confirm")}
              onDismiss={(id) => void handleIncident(id, "dismiss")}
            />
          </div>
        )}

        {tab === "canal" && (
          <div className="p-6 flex flex-col h-[480px]">
            <div className="flex items-center gap-2 text-cyan-400/80 text-xs uppercase tracking-wider mb-3">
              <Sparkles size={14} /> Canal estruturado · não LLM
            </div>
            <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-4 space-y-3 mb-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-cyan-500/15 border border-cyan-500/20 text-cyan-50"
                        : "bg-white/5 border border-white/10 text-slate-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.meta && <p className="text-[10px] text-slate-500 mt-1">{m.meta}</p>}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void sendMessage()}
                placeholder="saúde, estado, sensores, ameaças…"
                disabled={chatBusy}
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
              />
              <Button onClick={() => void sendMessage()} disabled={chatBusy || !chatInput.trim()} className="!bg-cyan-600">
                Enviar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
