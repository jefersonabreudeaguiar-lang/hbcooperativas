"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Play, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface V2Status {
  version: string;
  environment: string;
  running: boolean;
  observeOnly: boolean;
  persistence: {
    mode: string;
    connectionStatus: string;
    stagingConfigured: boolean;
    stats: Record<string, number>;
  };
  metrics: {
    observationsReceived: number;
    observationsPersisted: number;
    incidentsObserved: number;
    boundaryBlocks: number;
  } | null;
  heartbeat: { status: string; lines: string[] } | null;
  principles: {
    mutation: boolean;
    autoDefense: boolean;
    humanRequired: boolean;
  };
}

export function HobeliscoV2Panel() {
  const [status, setStatus] = useState<V2Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [cycleResult, setCycleResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/hobelisco/v2");
      if (res.status === 404) {
        setStatus(null);
        setError("V2 observer desabilitado. Configure HB_HOBELISCO_V2_ENABLED=true");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const runCycle = useCallback(async () => {
    setLoading(true);
    setCycleResult(null);
    try {
      const res = await fetch("/api/lab/hobelisco/v2", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCycleResult(`Sensores: ${json.sensorCount} | Probes HB: ${json.probeCount} | Human required: sim`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-cyan-100 flex items-center gap-2">
          <Eye className="h-5 w-5" />
          HOBELISCO V2 — Observador HB Coop
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void runCycle()} disabled={loading}>
            <Play className="h-4 w-4 mr-1" />
            Ciclo observe
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-black/30 p-2">
          <div className="text-cyan-400/70">Ambiente</div>
          <div className="font-mono text-cyan-100">{status?.environment ?? "—"}</div>
        </div>
        <div className="rounded-lg bg-black/30 p-2">
          <div className="text-cyan-400/70">Observer</div>
          <div className="font-mono text-cyan-100">{status?.running ? "RUNNING" : "STOPPED"}</div>
        </div>
        <div className="rounded-lg bg-black/30 p-2">
          <div className="text-cyan-400/70">Persistência</div>
          <div className={`font-mono ${status?.persistence.connectionStatus === "OK" ? "text-emerald-400" : "text-red-400"}`}>
            {status?.persistence.connectionStatus ?? "—"}
          </div>
        </div>
        <div className="rounded-lg bg-black/30 p-2">
          <div className="text-cyan-400/70">Observe-only</div>
          <div className="font-mono text-emerald-400">{status?.observeOnly ? "SIM" : "NÃO"}</div>
        </div>
      </div>

      {status?.metrics && (
        <div className="text-xs font-mono text-cyan-200/80 space-y-1">
          <div>Received: {status.metrics.observationsReceived} | Persisted: {status.metrics.observationsPersisted}</div>
          <div>Incidents (candidates): {status.metrics.incidentsObserved} | Boundary blocks: {status.metrics.boundaryBlocks}</div>
        </div>
      )}

      {status?.heartbeat && (
        <div className="text-xs font-mono text-cyan-300/70 border-t border-cyan-500/20 pt-2">
          Heartbeat: {status.heartbeat.status}
          {status.heartbeat.lines.slice(0, 3).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}

      {status?.persistence.connectionStatus === "ERROR" && (
        <p className="text-xs text-red-400">
          Persistência ERROR: URLs/chaves inválidas no .env.local. Reinicie o dev server após corrigir.
        </p>
      )}

      <div className="flex items-start gap-2 text-xs text-amber-200/80 border border-amber-500/20 rounded-lg p-2">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Read-only. Nunca muta HB Coop. Defesa sempre exige humano. Produção bloqueada.
        </span>
      </div>

      {cycleResult && <p className="text-xs text-emerald-400">{cycleResult}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
