"use client";

import { Smartphone } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  shouldShowVoltarParaAppNormal,
  voltarCooperadoParaAppNormal,
} from "@/lib/pwa/cooperadoPwaBrowserWorkaround";
import { cn } from "@/utils/format";

/** Ponto de retorno: cooperado volta ao fluxo normal (ícone PWA + baixar app). */
export function CooperadoPwaVoltarAppNormalBar({ className }: { className?: string }) {
  const { user } = useAuth();
  if (!user || user.role !== "cooperado") return null;
  if (!shouldShowVoltarParaAppNormal("cooperado")) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-t border-green-800/40 bg-green-950/90 px-3 py-2 text-[10px] text-green-50 backdrop-blur-sm",
        className
      )}
      role="region"
      aria-label="Voltar para app normal"
    >
      <span className="min-w-0 flex-1 leading-snug">
        Modo temporário no navegador. Para usar o ícone do app de novo:
      </span>
      <button
        type="button"
        onClick={() => voltarCooperadoParaAppNormal()}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-green-600"
      >
        <Smartphone size={12} aria-hidden />
        Voltar para app normal
      </button>
    </div>
  );
}
