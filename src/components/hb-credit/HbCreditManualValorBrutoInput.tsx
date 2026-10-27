"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { parseManualValorBrutoReaisInput } from "@/lib/hb-credit/hbCreditManualValorBruto";
import { postManualValorBrutoCooperado } from "@/services/creditApiService";

type Props = {
  cnpj: string;
  cooperadoId: string;
  manualValorBrutoCents: number | null | undefined;
  disabled?: boolean;
  onSaved?: () => void;
};

export function HbCreditManualValorBrutoInput({
  cnpj,
  cooperadoId,
  manualValorBrutoCents,
  disabled,
  onSaved,
}: Props) {
  const initial =
    manualValorBrutoCents != null && manualValorBrutoCents > 0
      ? (manualValorBrutoCents / 100).toFixed(2).replace(".", ",")
      : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    try {
      const cents = parseManualValorBrutoReaisInput(value);
      await postManualValorBrutoCooperado(cnpj, cooperadoId, cents);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="w-28"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        disabled={disabled || saving}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="button" size="sm" variant="secondary" disabled={disabled || saving} onClick={() => void salvar()}>
        {saving ? "…" : "Salvar"}
      </Button>
      {manualValorBrutoCents != null && manualValorBrutoCents > 0 ? (
        <span className="text-xs text-gray-500">Nuvem: {formatCentsBRL(manualValorBrutoCents)}</span>
      ) : null}
    </div>
  );
}
