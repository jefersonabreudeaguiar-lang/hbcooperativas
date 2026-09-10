"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Card } from "@/components/ui/Card";
import { secureApiFetch } from "@/lib/security/clientSession";
import type { SecurityStackHealth } from "@/lib/security/securityStackHealth";

export function AdminSecurityStackCard() {
  const [health, setHealth] = useState<SecurityStackHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void secureApiFetch("/api/admin/security/health", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<SecurityStackHealth>) : null))
      .then(setHealth)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Segurança da plataforma" action={<Shield size={18} className="text-gray-400" />}>
      {loading ? (
        <p className="text-sm text-gray-500 py-4">Verificando stack…</p>
      ) : !health ? (
        <p className="text-sm text-gray-500">Indisponível.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {[
              ["API security", health.apiSecurityEnforced ? "Ativo" : "Dev/local"],
              ["Rate limit distribuído", health.distributedRateLimit ? "Upstash OK" : "Fallback local"],
              ["CRON_SECRET", health.cronSecretConfigured ? "Configurado" : "Ausente"],
              ["Reconciliação crédito", health.reconciliationCoopConfigured ? "CNPJ OK" : "Definir env"],
              ["MFA equipe", health.staffMfaFeatureEnabled ? (health.staffMfaPolicyEnforced ? "Obrigatório" : "Opcional") : "Desligado"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-gray-800 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Crons Vercel</p>
            <ul className="text-xs text-gray-600 space-y-1">
              {health.crons.map((c) => (
                <li key={c.path}>
                  <code>{c.path}</code> — {c.schedule} — {c.description}
                </li>
              ))}
            </ul>
          </div>
          {health.recommendations.length > 0 && (
            <AlertBanner variant="info">
              <ul className="list-disc list-inside text-xs space-y-1">
                {health.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </AlertBanner>
          )}
        </div>
      )}
    </Card>
  );
}
