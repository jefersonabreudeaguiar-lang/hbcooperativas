"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import type { InicioCardMotorSnapshot } from "@/lib/cooperadoInicioCardPolicy";
import { isCooperadoBicCentralUiEnabled } from "@/lib/bic/cooperadoBicCentralUi";

type Props = {
  snapshot: InicioCardMotorSnapshot;
  /** Sync ativo (política endurecida já preserva valor quando aplicável). */
  atualizando?: boolean;
  exibirReciboAssinatura?: boolean;
};

function temPendencia(s: InicioCardMotorSnapshot): boolean {
  if (isCooperadoBicCentralUiEnabled()) return s.valor > 0;
  return s.valor > 0 || s.aguardandoAssinatura || s.valorRecibo > 0;
}

/** Card fixo do início — shell sempre visível; valor vem da política endurecida + motor BIC. */
export function CooperadoInicioValorReceberCard({
  snapshot,
  atualizando = false,
  exibirReciboAssinatura = true,
}: Props) {
  const base = snapshot;

  const modoRecibo =
    base.aguardandoAssinatura && exibirReciboAssinatura && base.valorRecibo > 0 && base.valor <= 0;
  const modoValor = base.valor > 0;
  const modoAssinaturaComAberto =
    base.aguardandoAssinatura && base.valorRecibo > 0 && base.valor > 0;
  const mesLabel = base.mesLabel.trim() || "—";
  const visualPendencia = temPendencia(base);

  const shellClass = modoRecibo
    ? "bg-gradient-to-br from-emerald-600 to-green-700 text-white border border-emerald-500"
    : modoValor || modoAssinaturaComAberto || (visualPendencia && atualizando)
      ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white"
      : "bg-white text-gray-900 border-2 border-amber-200";

  const rotulo = modoRecibo
    ? `Pagamento registrado · ${mesLabel}`
    : modoAssinaturaComAberto
      ? `A receber · ${mesLabel}`
      : modoValor
        ? `A receber · ${mesLabel}`
        : `A receber · ${mesLabel}`;

  const valorGrande = modoRecibo
    ? formatCurrency(base.valorRecibo)
    : formatCurrency(base.valor);

  const subtitulo = atualizando
    ? "Atualizando valores…"
    : modoAssinaturaComAberto
      ? `Recibo ${formatCurrency(base.valorRecibo)} aguardando assinatura na ficha.`
      : modoRecibo
        ? `Aberto na ficha: ${formatCurrency(base.valor)}`
        : modoValor
          ? "Confira descontos e detalhes na ficha."
          : "Nenhum valor pendente no momento.";

  const href =
    base.aguardandoAssinatura && (modoRecibo || modoAssinaturaComAberto)
      ? "/ficha-corrida?assinar=1"
      : "/ficha-corrida";
  const acao =
    base.aguardandoAssinatura && (modoRecibo || modoAssinaturaComAberto) ? "Assinar recibo" : "Ver detalhes";

  return (
    <div className={`rounded-2xl p-6 shadow-sm flex flex-col ${shellClass}`}>
      <Wallet
        size={28}
        className={`mb-3 shrink-0 ${modoRecibo || modoValor || modoAssinaturaComAberto ? "opacity-90" : "text-amber-600"}`}
      />
      <p
        className={`text-sm ${modoRecibo ? "text-emerald-100" : modoValor || modoAssinaturaComAberto ? "text-amber-100" : "text-gray-600"}`}
      >
        {rotulo}
      </p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{valorGrande}</p>
      <p
        className={`text-sm mt-2 min-h-[2.5rem] ${
          modoRecibo ? "text-emerald-100" : modoValor || modoAssinaturaComAberto ? "text-amber-100" : "text-gray-500"
        }`}
      >
        {subtitulo}
      </p>
      <Link
        href={href}
        className={`inline-block mt-4 text-sm font-medium px-4 py-2 rounded-lg w-fit ${
          modoRecibo || modoValor || modoAssinaturaComAberto
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
        }`}
      >
        {acao}
      </Link>
    </div>
  );
}
