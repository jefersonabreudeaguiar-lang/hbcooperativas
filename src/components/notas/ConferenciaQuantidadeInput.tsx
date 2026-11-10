"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Form";

function parseQtyInput(raw: string): number {
  if (raw === "" || raw === ".") return 0;
  const qty = parseFloat(raw);
  return Number.isNaN(qty) ? 0 : qty;
}

function formatQtyForInput(qty: number): string {
  return qty === 0 ? "" : String(qty);
}

export type ConferenciaQuantidadeInputProps = {
  value: number;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  onLiveQty: (qty: number) => void;
  onCommitQty: (qty: number) => void;
};

/** Input de quantidade com estado local — evita re-render do modal a cada tecla. */
export const ConferenciaQuantidadeInput = memo(function ConferenciaQuantidadeInput({
  value,
  disabled,
  ariaLabel,
  className,
  onLiveQty,
  onCommitQty,
}: ConferenciaQuantidadeInputProps) {
  const [text, setText] = useState(() => formatQtyForInput(value));
  const textRef = useRef(formatQtyForInput(value));
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    textRef.current = formatQtyForInput(value);
    setText(textRef.current);
  }, [value]);

  const emitLive = useCallback(
    (raw: string) => {
      onLiveQty(parseQtyInput(raw));
    },
    [onLiveQty]
  );

  return (
    <Input
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder="0"
      className={className}
      value={text}
      onFocus={() => {
        editingRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        textRef.current = raw;
        setText(raw);
        emitLive(raw);
      }}
      onBlur={() => {
        editingRef.current = false;
        const qty = parseQtyInput(textRef.current);
        textRef.current = formatQtyForInput(qty);
        setText(textRef.current);
        onCommitQty(qty);
      }}
    />
  );
});
