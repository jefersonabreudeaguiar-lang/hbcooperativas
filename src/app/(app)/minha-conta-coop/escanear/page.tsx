"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { HbCreditQrScanner } from "@/components/hb-credit/HbCreditQrScanner";
import { HbCreditScannerErrorBoundary } from "@/components/hb-credit/HbCreditScannerErrorBoundary";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { prepareAndOpenHbCreditPaymentFromQrScan } from "@/lib/hb-credit/openHbCreditPaymentFromQr";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { hbCooperadoFlowPage } from "@/lib/hb-credit/hbCreditCooperadoUi";
import { cn } from "@/utils/format";

export default function EscanearQrContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate optimistic>
        <EscanearQrContent />
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function EscanearQrContent() {
  const router = useRouter();
  const { user, cooperadoId } = usePermissions();
  const data = useAppData();
  const [validating, setValidating] = useState(false);
  const [scanError, setScanError] = useState("");

  const hbApiCooperadoId = useMemo(
    () => resolveHbCreditApiCooperadoId(user, cooperadoId),
    [user, cooperadoId]
  );

  const cnpj = useMemo(() => {
    if (!user || !data) return "";
    if (user.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    return coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";
  }, [user, data]);

  const handleScan = useCallback(
    (payload: string) => {
      if (validating || !hbApiCooperadoId || cnpj.length !== 14) return;
      setScanError("");
      setValidating(true);
      try {
        prepareAndOpenHbCreditPaymentFromQrScan(router, {
          cnpj,
          cooperadoId: hbApiCooperadoId,
          qrPayload: payload,
        });
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "Não foi possível usar este QR Code.");
        setValidating(false);
      }
    },
    [cnpj, hbApiCooperadoId, router, validating]
  );

  return (
    <div className={cn(hbCooperadoFlowPage, "mx-auto max-w-lg gap-4 px-4 pb-8")}>
      <div className="flex items-center gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} aria-label="Voltar">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#00a868]">HB Créditos</p>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Escanear QR</h1>
        </div>
      </div>

      <div className="relative">
        {validating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[28px] bg-white/92 text-gray-900 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-[#00a868]" />
            <p className="mt-4 text-sm font-medium">Lendo cobrança…</p>
          </div>
        )}
        <HbCreditScannerErrorBoundary onReset={() => router.refresh()}>
          <HbCreditQrScanner
            fullscreen
            autoStartLiveScan
            disabled={validating}
            onScan={(p) => void handleScan(p)}
            onError={() => {
              /* erro exibido no componente */
            }}
          />
        </HbCreditScannerErrorBoundary>
      </div>

      {scanError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-800" role="alert">
          {scanError}
        </p>
      ) : (
        <p className="text-center text-xs leading-relaxed text-gray-500">
          Aponte para o QR do mercado. Na próxima tela, digite o PIN — o pagamento confirma na hora.
        </p>
      )}
    </div>
  );
}
