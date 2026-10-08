"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

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
        Feche o app e abra de novo. Se continuar, use Atualizar no menu ou reinstale o atalho.
      </p>
      <Button type="button" onClick={() => reset()}>
        Tentar novamente
      </Button>
    </div>
  );
}
