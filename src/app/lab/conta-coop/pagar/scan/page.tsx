"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";

/** Simula leitor de QR no lab — cola ou usa intent demo do mercado. */
export default function ContaCoopScanPage() {
  const router = useRouter();
  const [hint, setHint] = useState("");

  return (
    <LabShell title="Escanear QR" subtitle="Protótipo — use câmera real em fase futura." backHref="/lab/conta-coop/pagar">
      <div className="aspect-square rounded-2xl border-2 border-dashed border-teal-500/40 bg-black/30 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-300">Área do leitor experimental</p>
        <p className="text-xs text-slate-500 mt-2">
          Gere um QR no Mercado Laboratório e cole o código na opção &quot;Colar código&quot;, ou use o botão abaixo
          após criar uma cobrança no mercado.
        </p>
      </div>
      {hint && <p className="text-xs text-amber-200 mt-3">{hint}</p>}
      <div className="mt-4 space-y-2">
        <LabPrimaryButton href="/lab/conta-coop/pagar/codigo">Colar código do QR</LabPrimaryButton>
        <LabPrimaryButton
          onClick={() => {
            setHint("Abra o Mercado Lab, crie uma venda e copie o QR gerado.");
            router.push("/lab/mercado/nova-venda");
          }}
        >
          Ir ao Mercado Lab
        </LabPrimaryButton>
      </div>
    </LabShell>
  );
}
