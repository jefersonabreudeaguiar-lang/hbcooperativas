"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";

export default function ContaCoopPagarCodigoPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/lab/credit/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", qrPayload: code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "QR inválido");
      sessionStorage.setItem("hb_lab_intent", JSON.stringify(json.intent));
      router.push(`/lab/conta-coop/pagar/confirmar?intentId=${json.intent.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível validar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LabShell title="Colar código" subtitle="Cole o payload do QR experimental." backHref="/lab/conta-coop/pagar">
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={5}
        placeholder="hb-credit-lab://pay/..."
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
      />
      {error && <p className="text-sm text-rose-300 mt-2">{error}</p>}
      <div className="mt-4">
        <LabPrimaryButton onClick={() => void validate()} disabled={loading || !code.trim()}>
          {loading ? "Validando…" : "Validar cobrança"}
        </LabPrimaryButton>
      </div>
    </LabShell>
  );
}
