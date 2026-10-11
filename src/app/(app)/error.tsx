"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { buildPwaRescueAutoLoginHref } from "@/lib/pwa/cooperadoPwaRescueUrl";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-gray-900">Não foi possível abrir esta tela</h1>
      <p className="text-sm text-gray-600 max-w-sm">
        Pode ser cache misturado após atualização. Use reparar atalho ou o relatório forensics e envie ao suporte.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Button type="button" onClick={() => reset()}>
          Tentar novamente
        </Button>
        <Link href={buildPwaRescueAutoLoginHref()} className="w-full">
          <Button type="button" variant="secondary" className="w-full">
            Reparar atalho do app
          </Button>
        </Link>
        <Link href="/pwa-crash-forensics.html" className="text-sm text-green-800 font-medium underline">
          Abrir forensics (copiar relatório)
        </Link>
      </div>
    </div>
  );
}
