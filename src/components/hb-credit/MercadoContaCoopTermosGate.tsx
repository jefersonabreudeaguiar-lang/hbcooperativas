"use client";

import { useState } from "react";
import { FileSignature, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  TERMO_MERCADO_CONTA_COOP_VERSAO,
  getClausulasTermoMercadoContaCoop,
  textoResumoAcordoDescontoMercado,
} from "@/config/termoUsoMercadoContaCoop";
import { acceptMercadoContaCoopTermos } from "@/services/creditApiService";
import { formatCpfCnpj } from "@/utils/format";
import type { ContaCoopParceiro } from "@/modules/hb-credit/types";

type Props = {
  parceiro: ContaCoopParceiro;
  cooperativaNome: string;
  onAccepted: () => void | Promise<void>;
};

export function MercadoContaCoopTermosGate({ parceiro, cooperativaNome, onAccepted }: Props) {
  const [aceite, setAceite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const desconto = parceiro.partnerDiscountPercent ?? 0;
  const clausulas = getClausulasTermoMercadoContaCoop({
    nomeMercado: parceiro.nomeMercado,
    cnpjMercado: formatCpfCnpj(parceiro.cnpjMercado),
    nomeCooperativa: cooperativaNome,
    cnpjCooperativa: formatCpfCnpj(parceiro.cooperativaCnpj),
    descontoPercent: desconto,
  });

  const confirmar = async () => {
    if (!aceite) return;
    setBusy(true);
    setErro("");
    try {
      await acceptMercadoContaCoopTermos();
      await onAccepted();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar o aceite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/60">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl">
        <div className="shrink-0 border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Termo de Uso — Conta Coop Mercado Parceiro</h2>
          <p className="mt-1 text-sm text-gray-600">
            Leia e aceite para usar o painel. Este aceite é registrado uma vez para {parceiro.nomeMercado}.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <AlertBanner variant="info" title="Seu acordo de desconto">
            {textoResumoAcordoDescontoMercado(desconto)}
          </AlertBanner>

          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="space-y-1 text-gray-800">
              <p>
                <strong>Mercado:</strong> {parceiro.nomeMercado}
              </p>
              <p>
                <strong>Cooperativa:</strong> {cooperativaNome}
              </p>
              <p>
                <strong>Desconto contratual:</strong>{" "}
                {desconto.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%
              </p>
              <p>
                <strong>Versão do termo:</strong> {TERMO_MERCADO_CONTA_COOP_VERSAO}
              </p>
            </div>

            {clausulas.map((c) => (
              <div key={c.titulo}>
                <h3 className="mb-1 font-semibold text-gray-900">{c.titulo}</h3>
                <ul className="list-disc space-y-1 pl-5 text-gray-700">
                  {c.itens.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {erro && <AlertBanner variant="error">{erro}</AlertBanner>}

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1" />
            <span>
              Li e concordo com o Termo de Uso Conta Coop, incluindo o desconto de{" "}
              {desconto.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}% acordado
              com a cooperativa, o recebimento do valor líquido na liquidação e o repasse do desconto à cooperativa
              conforme descrito acima.
            </span>
          </label>

          <Button className="w-full" disabled={!aceite || busy} onClick={() => void confirmar()}>
            <FileSignature size={18} />
            {busy ? "Registrando aceite…" : "Aceitar termo e continuar"}
          </Button>

          <p className="flex items-center gap-1 text-xs text-gray-500">
            <ShieldCheck size={14} /> O aceite fica registrado com data, hora e identificação do usuário do mercado.
          </p>
        </div>
      </div>
    </div>
  );
}
