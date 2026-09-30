"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ArenaReport, HobeliscoSnapshot } from "@lab/hobelisco-hx/types";
import { HobeliscoCommandCenter } from "./HobeliscoCommandCenter";
import { HobeliscoLabEnvironmentBanner } from "@/components/lab/HobeliscoLabEnvironmentBanner";

interface HobeliscoLabViewProps {
  initialSnapshot: HobeliscoSnapshot;
  initialArena: ArenaReport;
  boundaryBanner?: {
    title: string;
    subtitle: string;
    variant: "production-safe" | "lab-active" | "danger";
    deployKind?: string;
  };
}

export function HobeliscoLabView({ initialSnapshot, initialArena, boundaryBanner }: HobeliscoLabViewProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [arena, setArena] = useState(initialArena);
  const [loading, setLoading] = useState(false);
  const [arenaLoading, setArenaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/hobelisco", { cache: "no-store" });
      if (!res.ok) {
        setError("Laboratório indisponível.");
        return;
      }
      setSnapshot((await res.json()) as HobeliscoSnapshot);
      router.refresh();
    } catch {
      setError("Falha ao recarregar snapshot.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const runArena = useCallback(async () => {
    setArenaLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/hobelisco", { method: "POST", cache: "no-store" });
      if (!res.ok) {
        setError("Arena indisponível.");
        return;
      }
      const json = (await res.json()) as ArenaReport;
      setArena(json);
      setSnapshot(json.snapshot);
      router.refresh();
    } catch {
      setError("Falha ao executar Arena.");
    } finally {
      setArenaLoading(false);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#030508] text-slate-100">
      {boundaryBanner && (
        <HobeliscoLabEnvironmentBanner
          title={boundaryBanner.title}
          subtitle={boundaryBanner.subtitle}
          variant={boundaryBanner.variant}
          deployKind={boundaryBanner.deployKind}
        />
      )}
      {/* Grid futurista */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/[0.06] blur-[100px]" />
      </div>

      <header className="relative border-b border-white/[0.06] bg-black/40 backdrop-blur-2xl sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-600 shadow-lg shadow-cyan-500/20">
              <Sparkles size={22} className="text-white" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[#030508]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-500/70">
                Command Center · LAB ONLY
              </p>
              <h1 className="text-xl font-bold tracking-tight text-white">HOBELISCO HX</h1>
              <p className="text-[10px] text-slate-500 font-mono">
                {snapshot.version} · {snapshot.defenseDnaVersion} · observe-only
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-cyan-500/30"
          >
            ← Voltar ao app
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <HobeliscoCommandCenter
          snapshot={snapshot}
          arena={arena}
          onRefresh={refresh}
          onRunArena={runArena}
          loading={loading}
          arenaLoading={arenaLoading}
        />

        <p className="text-center text-[10px] text-slate-600 mt-8 pb-6">
          Memória {snapshot.memoryStats.short}/{snapshot.memoryStats.mid}/{snapshot.memoryStats.long} · Audit {snapshot.auditChainLength}
        </p>
      </main>
    </div>
  );
}
