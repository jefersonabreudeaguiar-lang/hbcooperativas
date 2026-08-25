"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Shield, Wallet, List, History, ArrowLeft } from "lucide-react";
import { LabBanner, LabPrimaryButton, LabSecondaryLink } from "@/modules/hb-credit-lab/components/LabShell";
import { formatCentsBRL } from "@/modules/hb-credit-lab/engine/money";
import type { LabActivityItem, LabCreditAccount } from "@/modules/hb-credit-lab/types";

export default function ContaCoopHomePage() {
  const [hideBalance, setHideBalance] = useState(false);
  const [account, setAccount] = useState<LabCreditAccount | null>(null);
  const [activities, setActivities] = useState<LabActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/lab/credit/account", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setAccount(json.account ?? null);
        setActivities(json.activities ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400 text-sm">
        Carregando Conta Coop (lab)…
      </div>
    );
  }

  const nome = account?.cooperadoNome ?? "Cooperado Laboratório";

  return (
    <>
      <LabBanner />
      <div className="px-5 pt-6 pb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-400 mb-4">
          <ArrowLeft size={16} /> Voltar ao app
        </Link>
        <p className="text-sm text-slate-400">Olá, {nome.split(" ")[0]}</p>
        <h1 className="text-2xl font-semibold mt-1">Conta Coop</h1>
        <p className="text-xs text-teal-300/80 mt-1">Experimento HB Credit Engine</p>
      </div>

      <section className="mx-5 rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-700 p-5 shadow-lg">
        <div className="flex items-center justify-between text-teal-50/90 text-sm">
          <span>Saldo disponível (teste)</span>
          <button
            type="button"
            onClick={() => setHideBalance((v) => !v)}
            className="p-1 rounded-lg hover:bg-white/10"
            aria-label={hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
          >
            {hideBalance ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <p className="text-3xl font-bold mt-2 tabular-nums">
          {formatCentsBRL(account?.saldoDisponivelCents ?? 0, hideBalance)}
        </p>
      </section>

      <div className="px-5 mt-6 space-y-3">
        <LabPrimaryButton href="/lab/conta-coop/pagar">
          <Wallet size={18} className="mr-2 inline" /> Pagar
        </LabPrimaryButton>

        <div className="grid grid-cols-1 gap-2">
          <LabSecondaryLink href="/lab/conta-coop/extrato">
            <span className="flex items-center gap-2">
              <List size={16} /> Extrato
            </span>
          </LabSecondaryLink>
          <LabSecondaryLink href="/lab/conta-coop/origem">
            <span className="flex items-center gap-2">
              <History size={16} /> Origem do meu saldo
            </span>
          </LabSecondaryLink>
          <LabSecondaryLink href="/lab/conta-coop/seguranca">
            <span className="flex items-center gap-2">
              <Shield size={16} /> Segurança da conta
            </span>
          </LabSecondaryLink>
        </div>
      </div>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Última atividade</h2>
        <ul className="space-y-2">
          {activities.slice(0, 3).map((a) => (
            <li key={a.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{a.titulo}</p>
                  <p className="text-xs text-slate-400">{a.subtitulo}</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${a.tipo === "debito" ? "text-rose-300" : "text-teal-300"}`}>
                  {a.tipo === "debito" ? "-" : "+"}
                  {formatCentsBRL(a.amountCents)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
