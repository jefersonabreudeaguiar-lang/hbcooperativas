"use client";

import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";

/** Botão nativo “Instalar app” (Chrome Android) na página Baixar aplicativo. */
export function BaixarAppInstallPanel() {
  const { state, installing, install, canInstall } = usePwaInstallPrompt(true);

  if (state === "standalone") {
    return (
      <div className="rounded-2xl border-2 border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
        Você já está usando o <strong>atalho instalado</strong>. Abra pelo ícone na tela inicial.
      </div>
    );
  }

  if (state === "ios") {
    return null;
  }

  return (
    <div className="rounded-2xl border-2 border-green-600 bg-white p-4 sm:p-5 shadow-sm space-y-3">
      <p className="font-semibold text-gray-900">Instalar no Android (Chrome)</p>
      {state === "waiting" && (
        <p className="text-sm text-gray-600 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
          Preparando instalação…
        </p>
      )}
      {canInstall && (
        <Button
          type="button"
          size="lg"
          className="w-full font-semibold gap-2"
          disabled={installing}
          onClick={() => void install()}
        >
          {installing ? (
            <Loader2 size={20} className="animate-spin" aria-hidden />
          ) : (
            <Download size={20} aria-hidden />
          )}
          {installing ? "Instalando…" : "Instalar app agora"}
        </Button>
      )}
      {(state === "manual" || (!canInstall && state !== "waiting")) && (
        <p className="text-sm text-gray-600 leading-relaxed">
          Se o botão não aparecer: no Chrome, toque em <strong>⋮</strong> (menu) →{" "}
          <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
        </p>
      )}
    </div>
  );
}
