"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { getResumoMensalidadesCooperado, isAvisoMensalidadeVenceAmanha, textoAvisoMensalidadeAmanha } from "@/services/mensalidadeService";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";

export function MensalidadeStatusBanner({
  cooperadoId,
  modo = "geral",
}: {
  cooperadoId: string;
  /** No início oculta mensalidade já paga (aguardando confirmação) ou em dia. */
  modo?: "inicio" | "geral";
}) {
  const data = useAppData();
  if (!data) return null;

  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coop = cooperado ? data.cooperativas.find((c) => c.id === cooperado.cooperativaId) : undefined;
  const cfg = coop?.mensalidadeConfig;

  if (cfg && isAvisoMensalidadeVenceAmanha(cfg)) {
    const dia = Math.min(Math.max(cfg.diaVencimento || 10, 1), 28);
    return (
      <AlertBanner variant="warning" title="Mensalidade vence amanhã">
        {textoAvisoMensalidadeAmanha(cfg)}
        <Link href="/mensalidades">
          <Button size="sm" className="mt-3">Ver mensalidade · dia {dia}</Button>
        </Link>
      </AlertBanner>
    );
  }

  const resumo = getResumoMensalidadesCooperado(data, cooperadoId, cooperado?.cooperativaId);
  if (resumo.situacao === "sem_mensalidade" || resumo.situacao === "em_dia") return null;

  const mesAtual = resumo.mensalidadeMesAtual;

  if (resumo.situacao === "aguardando_confirmacao") {
    if (modo === "inicio") return null;
    return (
      <AlertBanner variant="info" title="Mensalidade aguardando confirmação">
        Você informou o pagamento
        {resumo.qtdAguardandoConfirmacao > 1
          ? ` de ${resumo.qtdAguardandoConfirmacao} mensalidades`
          : ""}
        . A cooperativa está conferindo no extrato.
        <Link href="/mensalidades">
          <Button size="sm" variant="secondary" className="mt-3">Acompanhar</Button>
        </Link>
      </AlertBanner>
    );
  }

  if (resumo.situacao === "atrasada") {
    return (
      <AlertBanner variant="error" title="Mensalidade em atraso">
        {resumo.qtdAtrasadas === 1
          ? "Você tem 1 mensalidade atrasada"
          : `Você tem ${resumo.qtdAtrasadas} mensalidades atrasadas`}
        {resumo.valorEmAberto > 0 && ` · total em aberto: ${formatCurrency(resumo.valorEmAberto)}`}.
        Regularize o pagamento para evitar bloqueios.
        <Link href="/mensalidades">
          <Button size="sm" className="mt-3">Ver mensalidades</Button>
        </Link>
      </AlertBanner>
    );
  }

  if (resumo.situacao === "pendente" && mesAtual) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Clock size={24} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Mensalidade pendente</p>
            <p className="text-sm text-amber-800 mt-1">
              {formatMesReferencia(mesAtual.mesReferencia)} · {formatCurrency(mesAtual.valor)}
              {mesAtual.vencimento && (
                <> · vence em {formatDate(mesAtual.vencimento)}</>
              )}
            </p>
          </div>
        </div>
        <Link href="/mensalidades">
          <Button size="sm">Pagar mensalidade</Button>
        </Link>
      </div>
    );
  }

  return null;
}
