"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Form";
import {
  parseReaisToCentsInput,
  reaisDraftFromCents,
} from "@/lib/hb-credit/hbCreditFichaPlano";

type Props = {
  cents: number;
  disabled?: boolean;
  onCommit: (cents: number) => void;
  placeholder?: string;
};

/** R$ livre enquanto digita; formata ao sair do campo (evita travar em 1,00). */
export function HbCreditEntregaReaisInput({ cents, disabled, onCommit, placeholder = "0,00" }: Props) {
  const [draft, setDraft] = useState(() => reaisDraftFromCents(cents));
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!focus) setDraft(reaisDraftFromCents(cents));
  }, [cents, focus]);

  return (
    <Input
      className="mt-1"
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      value={draft}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        const parsed = parseReaisToCentsInput(draft);
        onCommit(parsed);
        setDraft(reaisDraftFromCents(parsed));
      }}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        onCommit(parseReaisToCentsInput(v));
      }}
    />
  );
}
