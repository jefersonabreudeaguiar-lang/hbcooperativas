"use client";

import type { NotaPedidoStatus } from "@/types";
import { formatCurrency, cn } from "@/utils/format";

type StepState = "done" | "current" | "todo" | "error";

function stepVisual(state: StepState) {
  switch (state) {
    case "done":
      return "bg-green-600 border-green-600 text-white";
    case "current":
      return "bg-amber-500 border-amber-500 text-white";
    case "error":
      return "bg-red-600 border-red-600 text-white";
    default:
      return "bg-white border-gray-300 text-gray-400";
  }
}

function lineVisual(done: boolean) {
  return done ? "bg-green-500" : "bg-gray-200";
}

/**
 * Timeline Enviada → Em análise → Valor — padrão de rastreio para o cooperado.
 */
export function NotaStatusTimeline({
  status,
  valorLiquido = 0,
  className,
}: {
  status: NotaPedidoStatus;
  valorLiquido?: number;
  className?: string;
}) {
  const rejeitada = status === "rejeitada";
  const emAnalise = status === "aguardando_conferencia" || status === "entregue" || status === "rascunho";
  const comValor = status === "conferida" || status === "pago";
  const pago = status === "pago";

  const steps: { label: string; sub?: string; state: StepState }[] = [
    {
      label: "Enviada",
      state: "done",
    },
    {
      label: rejeitada ? "Corrigir" : "Em análise",
      sub: rejeitada ? "Pediu correção" : emAnalise ? "Aguardando cooperativa" : undefined,
      state: rejeitada ? "error" : comValor || pago ? "done" : emAnalise ? "current" : "todo",
    },
    {
      label: comValor && valorLiquido > 0 ? formatCurrency(valorLiquido) : "Valor",
      sub: pago ? "Pago" : comValor ? "Aprovado" : undefined,
      state: pago || comValor ? "done" : "todo",
    },
  ];

  return (
    <div className={cn("w-full", className)} role="list" aria-label="Status da entrega">
      <div className="flex items-start">
        {steps.map((step, i) => (
          <div key={step.label + i} className="flex items-start flex-1 min-w-0" role="listitem">
            <div className="flex flex-col items-center w-full min-w-0">
              <div className="flex items-center w-full">
                {i > 0 && <div className={cn("h-0.5 flex-1", lineVisual(steps[i - 1].state === "done"))} />}
                <span
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0",
                    stepVisual(step.state)
                  )}
                >
                  {step.state === "done" ? "✓" : step.state === "error" ? "!" : i + 1}
                </span>
                {i < steps.length - 1 && (
                  <div className={cn("h-0.5 flex-1", lineVisual(step.state === "done"))} />
                )}
              </div>
              <p
                className={cn(
                  "text-[10px] sm:text-xs font-medium mt-1.5 text-center leading-tight px-0.5",
                  step.state === "error"
                    ? "text-red-700"
                    : step.state === "current"
                      ? "text-amber-800"
                      : step.state === "done"
                        ? "text-green-800"
                        : "text-gray-400"
                )}
              >
                {step.label}
              </p>
              {step.sub && (
                <p className="text-[9px] text-gray-500 text-center leading-tight mt-0.5 line-clamp-2 px-0.5">
                  {step.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
