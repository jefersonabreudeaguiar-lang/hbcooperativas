"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { HbCreditQrScanner } from "@/components/hb-credit/HbCreditQrScanner";
import { HbCreditScannerErrorBoundary } from "@/components/hb-credit/HbCreditScannerErrorBoundary";
import { Button } from "@/components/ui/Button";
import { storeHbCreditScanResult } from "@/lib/hb-credit/scanSession";

export default function EscanearQrContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate>
        <EscanearQrContent />
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function EscanearQrContent() {
  const router = useRouter();

  const handleScan = (payload: string) => {
    storeHbCreditScanResult(payload);
    router.replace("/minha-conta-coop");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} aria-label="Voltar">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Conta Coop</p>
          <h1 className="text-xl font-bold text-gray-900">Escanear pagamento</h1>
        </div>
      </div>

      <HbCreditScannerErrorBoundary onReset={() => router.refresh()}>
        <HbCreditQrScanner
          fullscreen
          autoStartLiveScan
          onScan={handleScan}
          onError={() => {
            /* erro exibido no componente */
          }}
        />
      </HbCreditScannerErrorBoundary>

      <p className="text-center text-xs text-gray-500">
        Aponte a câmera para o QR do mercado — a leitura é automática, como no app do banco.
      </p>
    </div>
  );
}
