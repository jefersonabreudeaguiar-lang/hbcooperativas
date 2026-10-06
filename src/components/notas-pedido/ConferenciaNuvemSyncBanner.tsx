"use client";

import { RefreshCw } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { useConferenciaNuvemSync } from "@/hooks/useConferenciaNuvemSync";

/** Aviso quando conferência ficou salva localmente mas a nuvem ainda não confirmou. */
export function ConferenciaNuvemSyncBanner() {
  const { failed, retryAll } = useConferenciaNuvemSync();
  if (failed.length === 0) return null;

  const label =
    failed.length === 1
      ? "1 conferência aguardando confirmação na nuvem."
      : `${failed.length} conferências aguardando confirmação na nuvem.`;

  return (
    <AlertBanner
      variant="warning"
      className="mt-4"
      title="Sincronização pendente"
      action={
        <Button type="button" size="sm" variant="secondary" onClick={() => retryAll()}>
          <RefreshCw className="h-4 w-4 mr-1" aria-hidden />
          Tentar de novo
        </Button>
      }
    >
      {label} O lançamento já está na ficha deste aparelho; toque em «Tentar de novo» ou aguarde reconexão
      automática.
    </AlertBanner>
  );
}
