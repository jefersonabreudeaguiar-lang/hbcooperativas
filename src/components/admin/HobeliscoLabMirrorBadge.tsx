"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Shield } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Card } from "@/components/ui/Card";
import { secureApiFetch } from "@/lib/security/clientSession";

interface LabMirrorHealthResponse {
  ok: boolean;
  phase: string;
  mode: string;
  boundary: {
    deployKind: string;
    safe: boolean;
    productionLocked: boolean;
    mirrorMode: boolean;
    tripwires: Array<{ id: string; severity: string; message: string }>;
    fingerprint: {
      appSupabaseHost: string | null;
      hobeliscoSupabaseHost: string | null;
      productionRefBlocked: string | null;
    };
    banner: {
      title: string;
      subtitle: string;
      variant: string;
    };
  };
  gates: Record<string, boolean>;
  issues: string[];
  recommendations: string[];
}

export function HobeliscoLabMirrorBadge() {
  const [health, setHealth] = useState<LabMirrorHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await secureApiFetch("/api/admin/hobelisco/lab-health", { cache: "no-store" });
      if (res.ok) setHealth((await res.json()) as LabMirrorHealthResponse);
      else setHealth(null);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !health) {
    return <p className="text-sm text-gray-500">Verificando fronteira LAB…</p>;
  }

  if (!health) {
    return (
      <AlertBanner variant="warning">
        Não foi possível carregar o status do espelho LAB. Execute{" "}
        <code className="text-xs bg-slate-100 px-1 rounded">npm run hobelisco:lab:activate</code>.
      </AlertBanner>
    );
  }

  const { boundary, ok } = health;
  const isProdLock = boundary.productionLocked;
  const Icon = isProdLock ? Shield : ok ? CheckCircle2 : boundary.mirrorMode ? FlaskConical : AlertTriangle;

  return (
    <Card
      title="Fronteira LAB ↔ Produção"
      className={
        isProdLock
          ? "!border-emerald-200"
          : ok
            ? "!border-cyan-200"
            : "!border-amber-200"
      }
    >
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isProdLock
              ? "bg-emerald-100 text-emerald-700"
              : ok
                ? "bg-cyan-100 text-cyan-700"
                : "bg-amber-100 text-amber-700"
          }`}
        >
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isProdLock
                  ? "bg-emerald-100 text-emerald-800"
                  : ok
                    ? "bg-cyan-100 text-cyan-800"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {isProdLock
                ? "Produção protegida"
                : ok
                  ? "Espelho LAB OK"
                  : "Espelho LAB pendente"}
            </span>
            <span className="text-xs text-gray-500">{boundary.deployKind}</span>
          </div>
          <p className="text-sm text-gray-700">{boundary.banner.subtitle}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600">
            <div>
              <dt className="text-gray-400">App Supabase</dt>
              <dd className="font-mono">{boundary.fingerprint.appSupabaseHost ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Hobelisco Supabase</dt>
              <dd className="font-mono">{boundary.fingerprint.hobeliscoSupabaseHost ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Ref produção (bloqueada)</dt>
              <dd className="font-mono">{boundary.fingerprint.productionRefBlocked ?? "—"}</dd>
            </div>
          </dl>
          {boundary.tripwires.length > 0 && (
            <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
              {boundary.tripwires.map((t) => (
                <li key={t.id}>{t.message}</li>
              ))}
            </ul>
          )}
          {health.recommendations.length > 0 && !isProdLock && (
            <p className="text-xs text-gray-500">
              Próximo passo: {health.recommendations[0]}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
