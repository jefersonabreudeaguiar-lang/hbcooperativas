"use client";

import { cn } from "@/utils/format";

const STEPS = [
  { id: 1, label: "Revisar" },
  { id: 2, label: "PIX" },
  { id: 3, label: "Registrar" },
  { id: 4, label: "Assinatura" },
] as const;

/**
 * Stepper do fluxo Pagar: Revisar → PIX → Registrar → Assinatura.
 */
export function PagarStepper({
  currentStep,
  className,
}: {
  currentStep: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white px-3 py-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-3 px-1">
        Passo {currentStep} de 4
      </p>
      <ol className="flex items-start">
        {STEPS.map((step, i) => {
          const done = currentStep > step.id;
          const current = currentStep === step.id;
          return (
            <li key={step.id} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center w-full">
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div
                      className={cn("h-0.5 flex-1", done || current ? "bg-green-500" : "bg-gray-200")}
                    />
                  )}
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border-2 shrink-0",
                      done
                        ? "bg-green-600 border-green-600 text-white"
                        : current
                          ? "bg-green-50 border-green-600 text-green-800"
                          : "bg-gray-50 border-gray-200 text-gray-400"
                    )}
                  >
                    {done ? "✓" : step.id}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn("h-0.5 flex-1", done ? "bg-green-500" : "bg-gray-200")}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] mt-1.5 font-medium text-center truncate w-full px-0.5",
                    current ? "text-green-800" : done ? "text-green-700" : "text-gray-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
