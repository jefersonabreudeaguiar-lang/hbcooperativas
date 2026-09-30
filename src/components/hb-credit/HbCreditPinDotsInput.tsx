"use client";

import { useId, useRef } from "react";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { cn } from "@/utils/format";

type Props = {
  value: string;
  onChange: (digits: string) => void;
  maxLength?: number;
  disabled?: boolean;
  label?: string;
  autoFocus?: boolean;
};

/** Campo de senha numérica estilo app bancário (bolinhas + teclado do sistema). */
export function HbCreditPinDotsInput({
  value,
  onChange,
  maxLength = 8,
  disabled,
  label = "Senha de pagamento",
  autoFocus,
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const slots = Math.max(FINANCIAL_PIN_MIN_LENGTH, 4);

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={id} className="mb-3 block text-center text-sm font-medium text-white/80">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        className="relative mx-auto flex w-full max-w-xs flex-col items-center gap-4"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex justify-center gap-3" aria-hidden>
          {Array.from({ length: slots }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 w-3.5 rounded-full border-2 transition-colors",
                i < value.length ? "border-white bg-white" : "border-white/35 bg-transparent"
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
