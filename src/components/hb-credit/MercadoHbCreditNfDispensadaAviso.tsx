"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA,
  HB_CREDIT_MERCADO_NF_AVISO_BOTAO,
  HB_CREDIT_MERCADO_NF_AVISO_CORPO,
  HB_CREDIT_MERCADO_NF_AVISO_TITULO,
  hbCreditMercadoNfAvisoAckKey,
  isHbCreditMercadoNfDispensada,
} from "@/lib/hb-credit/hbCreditMercadoNfPolicy";

/** Único aviso visível no painel do mercado — some só depois de confirmar. */
export function MercadoHbCreditNfDispensadaAviso(props: {
  partnerId: string;
  cooperativaCnpj?: string;
}) {
  const key = hbCreditMercadoNfAvisoAckKey(props.partnerId, props.cooperativaCnpj);
  const [pronto, setPronto] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    try {
      setConfirmado(window.localStorage.getItem(key) === "1");
    } catch {
      setConfirmado(false);
    }
    setPronto(true);
  }, [key]);

  if (!isHbCreditMercadoNfDispensada() || !pronto || confirmado || !props.partnerId) {
    return null;
  }

  const confirmar = () => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* private / quota — some na hora mesmo assim */
    }
    setConfirmado(true);
  };

  return (
    <aside
      className="rounded-2xl border-2 border-green-800 bg-green-50 p-5 shadow-md"
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-green-800">
        {HB_CREDIT_MERCADO_NF_AVISO_TITULO}
      </p>
      <h2 className="mt-1 text-lg font-bold leading-snug text-green-950">
        Compras com HB Créditos: notas fiscais de cooperado dispensadas
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-green-950">{HB_CREDIT_MERCADO_NF_AVISO_CORPO}</p>
      <p className="mt-3 text-sm font-semibold text-green-900">{HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA}</p>
      <Button type="button" className="mt-4 w-full" onClick={confirmar}>
        {HB_CREDIT_MERCADO_NF_AVISO_BOTAO}
      </Button>
    </aside>
  );
}
