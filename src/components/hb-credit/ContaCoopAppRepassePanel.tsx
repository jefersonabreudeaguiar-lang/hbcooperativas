"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCode, CheckCircle2, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatMesReferencia } from "@/utils/format";
import type { ContaCoopAppRepassePreview, ContaCoopDiscountPoolResumo } from "@/modules/hb-credit/types";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { fetchAppRepassePreview } from "@/services/creditApiService";
import { HbUnifiedPaymentPanel } from "@/components/payments/HbUnifiedPaymentPanel";

type Props = {
  cnpj: string;
  mesReferencia: string;
  resumo: ContaCoopDiscountPoolResumo | null;
  onConfirmed: () => void;
};

export function ContaCoopAppRepassePanel({ cnpj, mesReferencia, resumo, onConfirmed }: Props) {
  const [preview, setPreview] = useState<ContaCoopAppRepassePreview | null>(null);
  const [error, setError] = useState("");

  const reloadPreview = useCallback(async () => {
    if (!cnpj) return;
    try {
      const next = await fetchAppRepassePreview(cnpj, mesReferencia);
      setPreview(next);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar repasse HB.");
    }
  }, [cnpj, mesReferencia]);

  useEffect(() => {
    setError("");
    reloadPreview();
  }, [reloadPreview]);

  const jaPago = preview?.alreadyPaid ?? false;
  const valorPendente = preview?.amountCents ?? resumo?.appRepassePendenteCents ?? 0;

  if (!resumo || resumo.totalAppCents <= 0) return null;

  if (jaPago && preview?.repasse) {
    return (
      <AlertBanner variant="info" title="Repasse Conta Coop confirmado">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 size={16} />
          {formatCentsBRL(preview.repasse.amountCents)} em{" "}
          {new Date(preview.repasse.paidAt).toLocaleString("pt-BR")} · livro caixa{" "}
          <code className="text-xs">{preview.repasse.livroCaixaOrigemId}</code>
        </span>
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 !p-5 border-blue-200 bg-blue-50/30">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <QrCode size={18} className="text-blue-700" />
            Repasse HB ({CONTA_COOP_DESCONTO_SPLIT.appPercent}%) · {formatMesReferencia(mesReferencia)}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            O repasse faz parte do <strong>pagamento unificado HB via Asaas</strong>, calculado somente sobre compras
            Conta Coop já liquidadas com os mercados — nunca sobre estimativa.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-blue-200 bg-white p-3">
            <p className="text-xs text-blue-800">Elegível para repasse (PIX)</p>
            <p className="mt-1 text-lg font-bold text-blue-900">{formatCentsBRL(valorPendente)}</p>
            <p className="text-xs text-gray-500 mt-1">{preview?.allocCount ?? 0} compra(s)</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Aguardando liquidação mercado</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCentsBRL(resumo.appPendenteCents)}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-white p-3">
            <p className="text-xs text-green-800">Já repassado</p>
            <p className="mt-1 text-lg font-semibold text-green-900">{formatCentsBRL(resumo.appRepassePagoCents)}</p>
          </div>
        </div>

        {valorPendente <= 0 && resumo.appPendenteCents > 0 && (
          <p className="text-sm text-amber-800 flex items-start gap-2">
            <Info size={16} className="shrink-0 mt-0.5" />
            Liquide os mercados na aba <strong>Liquidar</strong> para liberar o repasse de{" "}
            {CONTA_COOP_DESCONTO_SPLIT.appPercent}%.
          </p>
        )}
      </Card>

      {valorPendente > 0 && (
        <HbUnifiedPaymentPanel
          cnpj={cnpj}
          mesReferenciaContaCoop={mesReferencia}
          compact
          onPaid={() => {
            void reloadPreview();
            onConfirmed();
          }}
        />
      )}

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
    </div>
  );
}
