"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import type { InicioCardMotorSnapshot } from "@/lib/cooperadoInicioCardPolicy";
import { cooperadoUsarFluxoReciboAssinaturaNaUi, isCooperadoBicCentralUiEnabled } from "@/lib/bic/cooperadoBicCentralUi";
import { isV2HbOnlyClient } from "@/lib/product/v2HbOnly";

type Props = {
  snapshot: InicioCardMotorSnapshot;
  /** Sync ativo (política endurecida já preserva valor quando aplicável). */
  atualizando?: boolean;
  exibirReciboAssinatura?: boolean;
};

function temPendencia(s: InicioCardMotorSnapshot): boolean {
  return s.valor > 0;
}

/** Modos visuais do card — exportado para testes de blindagem BIC. */
export function resolveCooperadoInicioValorReceberCardModos(
  base: InicioCardMotorSnapshot,
  exibirReciboAssinatura: boolean
): {
  modoRecibo: boolean;
  modoAssinaturaComAberto: boolean;
  acao: string;
} {
  const bicCentral = isCooperadoBicCentralUiEnabled();
  const fluxoReciboUi = cooperadoUsarFluxoReciboAssinaturaNaUi() && exibirReciboAssinatura;

  const modoRecibo =
    fluxoReciboUi && base.aguardandoAssinatura && base.valorRecibo > 0 && base.valor <= 0;
  const modoAssinaturaComAberto =
    fluxoReciboUi && base.aguardandoAssinatura && base.valorRecibo > 0 && base.valor > 0;
  const acao =
    fluxoReciboUi && base.aguardandoAssinatura && (modoRecibo || modoAssinaturaComAberto)
      ? "Assinar recibo"
      : "Ver detalhes";

  return { modoRecibo, modoAssinaturaComAberto, acao };
}

/** Card fixo do início — shell sempre visível; valor vem da política endurecida + motor BIC. */
export function CooperadoInicioValorReceberCard({
  snapshot,
  atualizando = false,
  exibirReciboAssinatura = false,
}: Props) {
  const base = snapshot;
  const v2Hb = isV2HbOnlyClient();

  const { modoRecibo, modoAssinaturaComAberto, acao } = resolveCooperadoInicioValorReceberCardModos(
    base,
    v2Hb ? false : exibirReciboAssinatura
  );
  const modoValor = base.valor > 0;
  const mesLabel = base.mesLabel.trim() || "—";
  const visualPendencia = temPendencia(base);
  const aguardandoValor = atualizando && !modoValor && !modoRecibo && !modoAssinaturaComAberto;

  const shellClass = modoRecibo
    ? "bg-gradient-to-br from-emerald-600 to-green-700 text-white border border-emerald-500"
    : modoValor || modoAssinaturaComAberto || aguardandoValor || (visualPendencia && atualizando)
      ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white"
      : "bg-white text-gray-900 border-2 border-amber-200";

  const rotulo = v2Hb
    ? `Ficha HB · ${mesLabel}`
    : modoRecibo
      ? `Pagamento registrado · ${mesLabel}`
      : modoAssinaturaComAberto
        ? `A receber · ${mesLabel}`
        : `A receber · ${mesLabel}`;

  const valorGrande = modoRecibo
    ? formatCurrency(base.valorRecibo)
    : aguardandoValor
      ? "—"
      : formatCurrency(base.valor);

  const subtitulo = atualizando
    ? "Atualizando valores…"
    : v2Hb
      ? modoValor
        ? "Bruto da ficha HB menos crédito já usado — veja entregas e mensalidades."
        : "Responsável ainda não lançou a ficha HB deste ciclo."
      : modoAssinaturaComAberto
        ? `Recibo ${formatCurrency(base.valorRecibo)} aguardando assinatura na ficha.`
        : modoRecibo
          ? `Aberto na ficha: ${formatCurrency(base.valor)}`
          : modoValor
            ? "Confira descontos e detalhes na ficha."
            : "Nenhum valor pendente no momento.";

  const href = v2Hb
    ? "/minha-ficha-hb"
    : modoRecibo || modoAssinaturaComAberto
      ? "/ficha-corrida?assinar=1"
      : "/ficha-corrida";

  const acaoV2 = v2Hb ? "Ver minha ficha HB" : acao;

  return (
    <div
      className={`rounded-2xl p-6 shadow-sm flex flex-col ${shellClass}`}
      data-cooperado-inicio-valor-card="1"
    >
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
        {acaoV2}
      </Link>
    </div>
  );
}
