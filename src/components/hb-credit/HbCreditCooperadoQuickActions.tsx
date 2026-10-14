"use client";

import { QrCode, ArrowDownLeft, CreditCard, List } from "lucide-react";
import { cn } from "@/utils/format";
import {
  hbCooperadoQuickActionBtn,
  hbCooperadoQuickActionIcon,
  hbCooperadoQuickActionsGrid,
} from "@/lib/hb-credit/hbCreditCooperadoUi";

type ActionId = "qr" | "receber" | "pagar" | "extrato";

type Props = {
  showReceber: boolean;
  disabledQr?: boolean;
  disabledReceber?: boolean;
  onQr: () => void;
  onReceber: () => void;
  onPagar: () => void;
  onExtrato: () => void;
};

const actions: {
  id: ActionId;
  label: string;
  short: string;
  icon: typeof QrCode;
}[] = [
  { id: "qr", label: "Pagar com QR Code", short: "QR Code", icon: QrCode },
  { id: "receber", label: "Receber", short: "Receber", icon: ArrowDownLeft },
  { id: "pagar", label: "Pagar", short: "Pagar", icon: CreditCard },
  { id: "extrato", label: "Extrato", short: "Extrato", icon: List },
];

export function HbCreditCooperadoQuickActions({
  showReceber,
  disabledQr,
  disabledReceber,
  onQr,
  onReceber,
  onPagar,
  onExtrato,
}: Props) {
  const handlers: Record<ActionId, () => void> = {
    qr: onQr,
    receber: onReceber,
    pagar: onPagar,
    extrato: onExtrato,
  };

  const disabled: Record<ActionId, boolean | undefined> = {
    qr: disabledQr,
    receber: disabledReceber,
    pagar: false,
    extrato: false,
  };

  return (
    <nav aria-label="Ações rápidas HB Créditos" className={hbCooperadoQuickActionsGrid}>
      {actions.map((action) => {
        if (action.id === "receber" && !showReceber) return null;
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className={cn(hbCooperadoQuickActionBtn, "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600")}
            disabled={disabled[action.id]}
            aria-label={action.label}
            onClick={handlers[action.id]}
          >
            <span className={hbCooperadoQuickActionIcon} aria-hidden>
              <Icon size={22} strokeWidth={2.25} />
            </span>
            <span className="text-xs font-semibold leading-tight text-gray-900 sm:text-[13px]">
              <span className="hidden sm:inline">{action.label}</span>
              <span className="sm:hidden">{action.short}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
