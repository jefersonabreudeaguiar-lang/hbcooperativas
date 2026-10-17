"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { tryRestoreAbaLastGoodInStore } from "@/lib/responsavel/abaLastGoodStore";

export default function ContratosSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[contratos-error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-gray-900">Não foi possível abrir Contratos</h1>
      <p className="text-sm text-gray-600 max-w-sm">
        Recarregue só esta aba. Se houver uma versão estável salva neste aparelho, ela volta automaticamente.
      </p>
      <Button
        type="button"
        onClick={() => {
          tryRestoreAbaLastGoodInStore("contratos");
          reset();
        }}
      >
        Recarregar aba
      </Button>
    </div>
  );
}
