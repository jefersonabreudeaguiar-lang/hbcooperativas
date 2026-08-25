"use client";

import Link from "next/link";
import { QrCode, Keyboard } from "lucide-react";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";

export default function ContaCoopPagarPage() {
  return (
    <LabShell title="Pagar" subtitle="Use cobranças experimentais do laboratório." backHref="/lab/conta-coop">
      <div className="space-y-4">
        <LabPrimaryButton href="/lab/conta-coop/pagar/scan">
          <QrCode size={18} className="mr-2 inline" /> Escanear QR
        </LabPrimaryButton>
        <LabPrimaryButton href="/lab/conta-coop/pagar/codigo">
          <Keyboard size={18} className="mr-2 inline" /> Colar código do QR
        </LabPrimaryButton>
        <p className="text-xs text-slate-400 leading-relaxed">
          Somente QR gerados no Mercado Laboratório são aceitos. QR de Pix real ou de produção são
          rejeitados.
        </p>
        <Link href="/lab/mercado" className="text-sm text-teal-300 underline">
          Abrir Mercado Laboratório (gerar QR de teste)
        </Link>
      </div>
    </LabShell>
  );
}
