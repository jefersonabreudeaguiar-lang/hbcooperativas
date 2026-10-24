"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA,
  HB_CREDIT_MERCADO_NF_AVISO_BOTAO,
  HB_CREDIT_MERCADO_NF_AVISO_CORPO,
  HB_CREDIT_MERCADO_NF_AVISO_TITULO,
  hbCreditMercadoNfAvisoAckKey,
  isHbCreditMercadoNfDispensada,
} from "@/lib/hb-credit/hbCreditMercadoNfPolicy";
import { acceptMercadoNfAvisoComunicado } from "@/services/creditApiService";

/** Comunicado NF dispensada — some após confirmação registrada na nuvem (não só localStorage). */
export function MercadoHbCreditNfDispensadaAviso(props: {
  partnerId: string;
  cooperativaCnpj?: string;
  needsAck: boolean;
  onAcknowledged?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  if (!isHbCreditMercadoNfDispensada() || !props.needsAck || !props.partnerId) {
    return null;
  }

  const confirmar = async () => {
    setBusy(true);
    setErro("");
    try {
      await acceptMercadoNfAvisoComunicado();
      try {
        const key = hbCreditMercadoNfAvisoAckKey(props.partnerId, props.cooperativaCnpj);
        window.localStorage.setItem(key, "1");
      } catch {
        /* cache local opcional */
      }
      await props.onAcknowledged?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a confirmação.");
    } finally {
      setBusy(false);
    }
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
      {erro ? <p className="mt-3 text-sm text-red-800">{erro}</p> : null}
      <Button type="button" className="mt-4 w-full" disabled={busy} onClick={() => void confirmar()}>
        {busy ? "Registrando…" : HB_CREDIT_MERCADO_NF_AVISO_BOTAO}
      </Button>
    </aside>
  );
}
