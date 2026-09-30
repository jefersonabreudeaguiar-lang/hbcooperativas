"use client";

import { useId, useRef } from "react";
import { Lock } from "lucide-react";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { cn } from "@/utils/format";

type Props = {
  value: string;
  onChange: (digits: string) => void;
  maxLength?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
  /** Tela clara (pagamento cooperado) ou escura legado */
  variant?: "light" | "dark";
};

/** Campo de senha numérica estilo app bancário (bolinhas + teclado do sistema). */
export function HbCreditPinDotsInput({
  value,
  onChange,
  maxLength = 8,
  disabled,
  label = "Senha de pagamento",
  hint = "Toque aqui e digite no teclado numérico",
  autoFocus,
  variant = "dark",
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const slots = Math.max(FINANCIAL_PIN_MIN_LENGTH, 4);
  const light = variant === "light";

  return (
    <div
      className={cn(
        "w-full rounded-3xl border-2 p-5 shadow-md",
        light
          ? "border-emerald-600/40 bg-white"
          : "border-white/20 bg-white/[0.06] p-4 shadow-none"
      )}
    >
      <div className="mb-4 flex items-center justify-center gap-2">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            light ? "bg-emerald-600 text-white" : "bg-white/15 text-white"
          )}
        >
          <Lock size={20} strokeWidth={2.25} />
        </span>
        <div className="text-left">
          {label ? (
            <label
              htmlFor={id}
              className={cn(
                "block font-bold leading-tight",
                light ? "text-lg text-emerald-950" : "text-sm font-medium text-white/80"
              )}
            >
              {label}
            </label>
          ) : null}
          {hint ? (
            <p className={cn("text-xs mt-0.5", light ? "text-emerald-800/80" : "text-white/50")}>{hint}</p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        className="relative mx-auto flex w-full max-w-sm flex-col items-center gap-5 py-2"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex justify-center gap-3.5" aria-hidden>
          {Array.from({ length: slots }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "rounded-full border-[3px] transition-all",
                light ? "h-4 w-4" : "h-3.5 w-3.5 border-2",
                i < value.length
                  ? light
                    ? "border-emerald-600 bg-emerald-600 scale-110"
                    : "border-white bg-white"
                  : light
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-white/35 bg-transparent"
              )}
            />
          ))}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, maxLength))}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          aria-label={label}
        />
      </button>
    </div>
  );
}
