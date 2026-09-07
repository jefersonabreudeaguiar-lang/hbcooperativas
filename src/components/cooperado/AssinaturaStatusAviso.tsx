"use client";

import Link from "next/link";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  cooperadoAssinaturaDevolvida,
  cooperadoAssinaturaEmAnalise,
  cooperadoMostrarAvisoAssinaturaConfirmada,
} from "@/services/cooperadoAssinaturaService";
import type { Cooperado } from "@/types";

interface AssinaturaStatusAvisoProps {
  cooperado: Cooperado;
  className?: string;
}

/** Avisos globais para o cooperado: em análise, confirmada (24 h), devolvida. */
export function AssinaturaStatusAviso({ cooperado, className }: AssinaturaStatusAvisoProps) {
  if (cooperadoMostrarAvisoAssinaturaConfirmada(cooperado)) {
    return (
      <AlertBanner variant="success" title="Assinatura confirmada" className={className}>
        <CheckCircle2 size={16} className="inline mr-1" />
        A diretoria aprovou sua assinatura. Você já pode usá-la em votações e recibos.
      </AlertBanner>
    );
  }

  if (cooperadoAssinaturaEmAnalise(cooperado)) {
    return (
      <AlertBanner variant="info" title="Assinatura em análise" className={className}>
        <Clock size={16} className="inline mr-1" />
        Sua assinatura foi recebida e aguarda conferência da diretoria. Você será avisado quando for confirmada.
      </AlertBanner>
    );
  }

  if (cooperadoAssinaturaDevolvida(cooperado)) {
    return (
      <AlertBanner variant="warning" title="Assinatura precisa ser reenviada" className={className}>
        <AlertTriangle size={16} className="inline mr-1" />
        {cooperado.assinaturaDevolvidaMotivo?.trim() ||
          "A diretoria solicitou um novo envio da sua assinatura."}{" "}
        <Link href="/meu-cadastro" className="font-semibold underline ml-1">
          Enviar de novo em Meu cadastro
        </Link>
      </AlertBanner>
    );
  }

  return null;
}
