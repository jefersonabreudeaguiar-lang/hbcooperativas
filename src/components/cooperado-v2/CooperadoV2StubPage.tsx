"use client";

import { CooperadoV2Shell } from "@/components/cooperado-v2/CooperadoV2Shell";

export function CooperadoV2StubPage({ titulo }: { titulo: string }) {
  return (
    <CooperadoV2Shell>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-2">
        <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
        <p className="text-sm text-gray-600">Fase 2 do piloto v2 — mesma aparência do app oficial, motor na nuvem.</p>
      </div>
    </CooperadoV2Shell>
  );
}
