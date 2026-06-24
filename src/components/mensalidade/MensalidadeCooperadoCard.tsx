"use client";

import { QrCode, Paperclip, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  mensalidadeAguardandoConfirmacao,
  mensalidadePodePagarComPix,
  statusEfetivoMensalidade,
} from "@/services/mensalidadeService";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import type { Mensalidade } from "@/types";

interface MensalidadeCooperadoCardProps {
  mensalidade: Mensalidade;
  onPix: () => void;
  onComprovante: () => void;
}

export function MensalidadeCooperadoCard({ mensalidade, onPix, onComprovante }: MensalidadeCooperadoCardProps) {
  const m = mensalidade;

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-gray-600">{formatMesReferencia(m.mesReferencia)}</p>
        <StatusBadge status={statusEfetivoMensalidade(m)} />
      </div>
      <p className="text-lg font-bold text-gray-900 mt-2">{formatCurrency(m.valor)}</p>
      <p className="text-xs text-gray-500">Vence {formatDate(m.vencimento)}</p>
      {m.status === "paga" && m.dataPagamento && (
        <p className="text-xs text-green-700 mt-1">Paga em {formatDate(m.dataPagamento)}</p>
      )}
      {mensalidadePodePagarComPix(m) && (
        <div className="flex flex-col gap-2 mt-3">
          <Button size="sm" className="w-full" onClick={onPix}>
            <QrCode size={14} /> Pagar PIX
          </Button>
          <Button size="sm" variant="secondary" className="w-full" onClick={onComprovante}>
            <Paperclip size={14} /> Enviar comprovante
          </Button>
        </div>
      )}
      {mensalidadeAguardandoConfirmacao(m) && (
        <p className="text-xs text-blue-700 mt-3 flex items-center gap-1">
          <AlertCircle size={14} /> Pendente — aguardando confirmação da diretoria
        </p>
      )}
    </div>
  );
}
