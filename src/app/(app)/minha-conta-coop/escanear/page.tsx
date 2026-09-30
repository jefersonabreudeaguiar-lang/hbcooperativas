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

  const cnpj = useMemo(() => {
    if (!user || !data) return "";
    if (user.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    return coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";
  }, [user, data]);

  const handleScan = useCallback(
    async (payload: string) => {
      if (validating || !cooperadoId || cnpj.length !== 14) return;
      setValidating(true);
      setScanError("");
      try {
        await prepareAndOpenHbCreditPaymentFromQrScan(router, { cnpj, cooperadoId, qrPayload: payload });
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "Não foi possível usar este QR Code.");
        setValidating(false);
      }
    },
    [cnpj, cooperadoId, router, validating]
  );

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} aria-label="Voltar">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700">HB Créditos</p>
          <h1 className="text-xl font-bold text-gray-900">Escanear QR</h1>
        </div>
      </div>

      <div className="relative">
        {validating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-emerald-50/95 text-emerald-950">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" />
            <p className="mt-4 text-sm font-medium">Abrindo pagamento…</p>
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
        <p className="text-center text-xs text-gray-500">
          Aponte para o QR do mercado — ao ler, você confirma o valor na próxima tela.
        </p>
      )}
    </div>
  );
}
