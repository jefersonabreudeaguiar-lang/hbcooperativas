"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  LifeStateTransition,
  ReplayComparison,
  TimelineEntry,
  TimelineFilterCategory,
  TimelineSnapshotView,
} from "@lab/hobelisco-hx/organism/TimelineTypes";

const FILTERS: { id: TimelineFilterCategory; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "AUTH", label: "AUTH" },
  { id: "API", label: "API" },
  { id: "SYNC", label: "SYNC" },
  { id: "DATABASE", label: "DATABASE" },
  { id: "HB_CREDIT", label: "HB CREDIT" },
  { id: "FINANCIAL", label: "FINANCIAL" },
  { id: "INTEGRITY", label: "INTEGRITY" },
  { id: "PERFORMANCE", label: "PERFORMANCE" },
  { id: "DEVICE", label: "DEVICE" },
  { id: "BEHAVIOR", label: "BEHAVIOR" },
  { id: "DEFENSE", label: "DEFENSE" },
  { id: "GUARDIAN", label: "GUARDIAN" },
  { id: "LEARNING", label: "LEARNING" },
  { id: "DEATH", label: "DEATH" },
  { id: "REINCARNATION", label: "REINCARNATION" },
];

const LIFE_STATES = [
  "BIRTH", "BOOT", "AWAKE", "WATCHING", "DEFENDING", "FORTRESS",
  "RECOVERING", "LEARNING", "HIBERNATING", "SAFE_MODE", "FAILED", "DEAD", "ANALYSIS", "REINCARNATING",
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

interface Props {
  initialEntries?: TimelineEntry[];
  initialLife?: LifeStateTransition[];
  initialSnapshot?: TimelineSnapshotView | null;
}

export function HobeliscoTimelinePanel({ initialEntries = [], initialLife = [], initialSnapshot = null }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [life, setLife] = useState(initialLife);
  const [snapshot, setSnapshot] = useState<TimelineSnapshotView | null>(initialSnapshot);
  const [filter, setFilter] = useState<TimelineFilterCategory>("ALL");
  const [selected, setSelected] = useState<TimelineEntry | null>(null);
  const [replay, setReplay] = useState<ReplayComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"timeline" | "life" | "immune" | "snapshot">("timeline");

  const filtered = useMemo(() => {
    if (filter === "ALL") return entries;
    return entries.filter((e) => e.filterCategory === filter);
  }, [entries, filter]);

  const activeLifeStates = useMemo(() => {
    const set = new Set(life.flatMap((t) => [t.from, t.to]));
    return LIFE_STATES.filter((s) => set.has(s));
  }, [life]);

  const loadDemo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/hobelisco/timeline", { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      setEntries(json.entries ?? []);
      setLife(json.lifeTransitions ?? []);
      setSnapshot(json.snapshot ?? null);
      setSelected(null);
      setReplay(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const runReplay = useCallback(async (entryId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/hobelisco/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replay", entryId }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setReplay(json.comparison ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-transparent p-4 backdrop-blur-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">Timeline do Organismo</p>
          <p className="text-[10px] text-slate-500">Eventos reais do Lab Runtime · não LLM</p>
        </div>
        <button
          type="button"
          onClick={() => void loadDemo()}
          disabled={loading}
          className="text-xs rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-cyan-300 hover:bg-cyan-900/40 disabled:opacity-50"
        >
          {loading ? "Executando…" : "Executar ciclo demo"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["timeline", "life", "immune", "snapshot"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`text-[10px] rounded-full px-3 py-1 border ${
              tab === t ? "border-cyan-400 text-cyan-300 bg-cyan-950/50" : "border-slate-700 text-slate-500"
            }`}
          >
            {t === "timeline" ? "Eventos" : t === "life" ? "Life Timeline" : t === "immune" ? "Imunológico" : "Snapshot"}
          </button>
        ))}
      </div>

      {tab === "timeline" && (
        <>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`text-[10px] rounded-full px-2 py-0.5 border ${
                  filter === f.id ? "border-violet-400 text-violet-300" : "border-slate-700 text-slate-500"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {filtered.length === 0 && (
                <p className="text-xs text-slate-500">Nenhum evento. Clique em &quot;Executar ciclo demo&quot;.</p>
              )}
              {filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { setSelected(e); setReplay(null); }}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-xs ${
                    selected?.id === e.id ? "border-cyan-500/50 bg-cyan-950/30" : "border-slate-700/60 bg-slate-950/40"
                  }`}
                >
                  <span className="text-slate-500 font-mono">{formatTime(e.timestamp)}</span>
                  <span className="ml-2 text-cyan-400">{e.organ}</span>
                  <span className="ml-2 text-slate-400">{e.eventType}</span>
                  <p className="text-slate-500 mt-1 truncate">{e.action} → {e.result}</p>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-slate-700/50 bg-black/30 p-4 text-xs space-y-2 min-h-[200px]">
              {!selected && <p className="text-slate-500">Selecione um incidente para ver o pipeline.</p>}
              {selected && (
                <>
                  <p className="font-mono text-cyan-400">{selected.id} · {selected.severity.toUpperCase()}</p>
                  {(selected.pipeline ?? [selected.organ, selected.eventType, selected.action, selected.result]).map((step, i, arr) => (
                    <div key={step}>
                      <span className="text-slate-300">{step}</span>
                      {i < arr.length - 1 && <p className="text-slate-600 ml-2">↓</p>}
                    </div>
                  ))}
                  {selected.explanation && <p className="text-slate-400 mt-3 border-t border-slate-800 pt-2">{selected.explanation}</p>}
                  <div className="flex flex-wrap gap-2 mt-3 text-[10px]">
                    {selected.contained && <span className="text-emerald-400">CONTAINED</span>}
                    {selected.humanRequired && <span className="text-amber-400">HUMAN REQUIRED</span>}
                    {selected.falsePositive && <span className="text-orange-400">FALSE POSITIVE</span>}
                    {selected.falseNegative && <span className="text-rose-400">FALSE NEGATIVE</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void runReplay(selected.id)}
                    className="mt-3 text-[10px] rounded border border-violet-500/40 px-2 py-1 text-violet-300"
                  >
                    REPLAY
                  </button>
                  {replay && replay.incidentId === selected.id && (
                    <div className="mt-3 border-t border-slate-800 pt-2 space-y-1">
                      <p className={replay.match ? "text-emerald-400" : "text-rose-400"}>
                        {replay.match ? "MATCH" : `DIVERGENCE @ ${replay.divergedAt}`}
                      </p>
                      <p className="text-slate-500">Original: {replay.original.state} / {replay.original.result}</p>
                      <p className="text-slate-500">Replay: {replay.replayed.state} / {replay.replayed.result}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "life" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Transições reais registradas no runtime</p>
          <div className="flex flex-wrap gap-2">
            {LIFE_STATES.map((s) => (
              <span
                key={s}
                className={`text-[10px] rounded-full px-2 py-1 border ${
                  activeLifeStates.includes(s) ? "border-emerald-500/50 text-emerald-300 bg-emerald-950/30" : "border-slate-800 text-slate-600"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 text-xs font-mono">
            {life.map((t, i) => (
              <p key={i} className="text-slate-400">
                {formatTime(t.at)} {t.from} → {t.to} <span className="text-slate-600">({t.auditKind})</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {tab === "immune" && snapshot && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            ["Threat DNA", snapshot.dna],
            ["Active Defense", snapshot.activeDefense],
            ["Risk", snapshot.risk],
            ["Vitality", `${snapshot.vitality}/100`],
            ["Antibodies", String(snapshot.antibodies)],
            ["Memory", `${snapshot.memory.short}/${snapshot.memory.mid}/${snapshot.memory.long}`],
            ["Immunity", `${snapshot.immunityReadiness} (${snapshot.immunityClass})`],
            ["Audit", String(snapshot.auditLength)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-2">
              <p className="text-slate-500">{k}</p>
              <p className="text-slate-200 font-semibold truncate">{v}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "snapshot" && snapshot && (
        <pre className="text-[10px] text-slate-400 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      )}
    </div>
  );
}
