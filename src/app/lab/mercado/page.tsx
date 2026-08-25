"use client";

import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";
import { LAB_DEMO_MARKET_SESSION } from "@/modules/hb-credit-lab/mock/labSeed";

export default function MercadoLabLoginPage() {
  const router = useRouter();

  const enter = () => {
    sessionStorage.setItem(LAB_DEMO_MARKET_SESSION, "LAB_ONLY_market_a");
    router.push("/lab/mercado/painel");
  };

  return (
    <LabShell title="Mercado Laboratório" subtitle="Acesso conceitual — sem conta real.">
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-center">
        <Store className="mx-auto text-violet-300" size={36} />
        <p className="mt-3 text-sm text-slate-300">Simule o caixa de um mercado parceiro HB.</p>
      </div>
      <div className="mt-6">
        <LabPrimaryButton onClick={enter}>Entrar no painel experimental</LabPrimaryButton>
      </div>
    </LabShell>
  );
}
