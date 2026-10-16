"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { HbCreditQrScanner } from "@/components/hb-credit/HbCreditQrScanner";
import { HbCreditScannerErrorBoundary } from "@/components/hb-credit/HbCreditScannerErrorBoundary";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { preloadAppData } from "@/services/dataStore";
import { prepareAndOpenHbCreditPaymentFromQrScan } from "@/lib/hb-credit/openHbCreditPaymentFromQr";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { resolveCooperadoHbCreditCnpjDigits } from "@/lib/hb-credit/resolveCooperadoHbCreditCnpj";
import { hbCooperadoFlowPage } from "@/lib/hb-credit/hbCreditCooperadoUi";
import { cn } from "@/utils/format";
import { AlertBanner } from "@/components/ui/AlertBanner";

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

  useEffect(() => {
    preloadAppData();
  }, []);

  const hbApiCooperadoId = useMemo(
    () => resolveHbCreditApiCooperadoId(user, cooperadoId),
    [user, cooperadoId]
  );

  const cnpj = useMemo(() => resolveCooperadoHbCreditCnpjDigits(user, data), [user, data]);

  const handleScan = useCallback(
    (payload: string) => {
      if (validating || !hbApiCooperadoId || !cnpj || cnpj.length !== 14) return;
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

  if (!hbApiCooperadoId || cnpj.length !== 14) {
    return (
      <div className={cn(hbCooperadoFlowPage, "mx-auto max-w-lg gap-4 px-4 pb-8")}>
        <AlertBanner variant="error" title="Não foi possível abrir o pagamento">
          Seu login precisa estar ligado ao cooperado na nuvem. Saia, entre de novo e abra HB Créditos pela tela
          inicial antes de usar o atalho Pagar.
        </AlertBanner>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(hbCooperadoFlowPage, "mx-auto max-w-lg gap-4 px-4 pb-8")}>
      <div className="flex items-center gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} aria-label="Voltar">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">HB Créditos</p>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Escanear QR</h1>
        </div>
      </div>

      <div className="relative">
        {validating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[28px] bg-white/92 text-gray-900 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-100 border-t-emerald-600" />
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
