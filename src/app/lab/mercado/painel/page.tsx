"use client";

import Link from "next/link";
import { LabShell, LabPrimaryButton, LabSecondaryLink } from "@/modules/hb-credit-lab/components/LabShell";

export default function MercadoPainelPage() {
  return (
    <LabShell title="Painel do mercado" subtitle="Mercado Laboratório A · LAB_ONLY">
      <div className="space-y-2">
        <LabPrimaryButton href="/lab/mercado/nova-venda">Nova venda</LabPrimaryButton>
        <LabSecondaryLink href="/lab/mercado/recebiveis">Recebíveis simulados</LabSecondaryLink>
        <LabSecondaryLink href="/lab/conta-coop">Conta Coop (cooperado)</LabSecondaryLink>
      </div>
      <p className="text-xs text-slate-500 mt-6">
        <Link href="/lab/mercado" className="underline">
          Sair do painel
        </Link>
      </p>
    </LabShell>
  );
}
