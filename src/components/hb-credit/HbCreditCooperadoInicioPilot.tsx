"use client";

import { useState } from "react";
import { Shield, QrCode, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { HbCreditCooperadoQuickActions } from "@/components/hb-credit/HbCreditCooperadoQuickActions";
import { HbCreditCooperadoLedgerList } from "@/components/hb-credit/HbCreditCooperadoLedgerList";
import type { ContaCoopLedgerEntry } from "@/modules/hb-credit/types";
import {
  markCooperadoPilotHbCreditHubIntroDone,
} from "@/lib/cooperado/cooperadoMobilePilotHbCredit";
import { cn } from "@/utils/format";
import {
  hbCooperadoPrimaryBtn,
  hbCooperadoSurfaceCard,
  hbCooperadoValueBox,
} from "@/lib/hb-credit/hbCreditCooperadoUi";

type Props = {
  userId: string;
  showIntro: boolean;
  hasPin: boolean;
  pinResetPending: boolean;
  pagamentoBloqueado: boolean;
  accountBlocked: boolean;
  busy: boolean;
  pinSetup: string;
  onPinSetupChange: (value: string) => void;
  onSalvarPin: () => void;
  onSolicitarResetPin: () => void;
  showReceber: boolean;
  ledgerPreview: ContaCoopLedgerEntry[];
  ledgerLoading: boolean;
  onTabPagar: () => void;
  onTabReceber: () => void;
  onTabExtrato: () => void;
  onEscanearQr: () => void;
};

export function HbCreditCooperadoInicioPilot({
  userId,
  showIntro,
  hasPin,
  pinResetPending,
  pagamentoBloqueado,
  accountBlocked,
  busy,
  pinSetup,
  onPinSetupChange,
  onSalvarPin,
  onSolicitarResetPin,
  showReceber,
  ledgerPreview,
  ledgerLoading,
  onTabPagar,
  onTabReceber,
  onTabExtrato,
  onEscanearQr,
}: Props) {
  const [introDismissed, setIntroDismissed] = useState(false);
  const showWelcome = showIntro && !introDismissed;

  const finishIntro = () => {
    markCooperadoPilotHbCreditHubIntroDone(userId);
    setIntroDismissed(true);
  };

  if (showWelcome) {
    return (
      <div className="space-y-4">
        <div className={cn(hbCooperadoSurfaceCard, "p-5 sm:p-6")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
            Bem-vindo
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-gray-900">
            Sua conta HB Créditos
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Pague nos mercados parceiros com saldo da cooperativa — simples como um banco no celular.
          </p>
          <ul className="mt-5 space-y-3">
            {[
              {
                icon: Shield,
                title: "PIN de pagamento",
                text: "Você confirma cada compra com um código só seu.",
              },
              {
                icon: QrCode,
                title: "QR no mercado",
                text: "Escaneie o código do caixa e pronto — sem fila de papel.",
              },
              {
                icon: Sparkles,
                title: "Cashback na ficha",
                text: "Quando acumular, pode liberar no valor a receber do mês.",
              },
            ].map((step) => (
              <li key={step.title} className="flex gap-3 rounded-2xl bg-emerald-50/80 px-3 py-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"
                  aria-hidden
                >
                  <step.icon size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                  <p className="text-xs leading-relaxed text-gray-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <Button className={cn("mt-6 w-full", hbCooperadoPrimaryBtn)} type="button" onClick={finishIntro}>
            Entendi — ir para o Início
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HbCreditCooperadoQuickActions
        showReceber={showReceber}
        disabledQr={pagamentoBloqueado || accountBlocked}
        disabledReceber={accountBlocked || busy}
        onQr={onEscanearQr}
        onReceber={onTabReceber}
        onPagar={onTabPagar}
        onExtrato={onTabExtrato}
      />

      {!hasPin ? (
        <Card className="space-y-3 border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white !p-5">
          <div>
            <h3 className="text-base font-bold text-gray-900">Ative seu PIN</h3>
            <p className="mt-1 text-sm text-gray-600">
              Último passo para pagar com segurança nos mercados parceiros.
            </p>
          </div>
          <div>
            <Label>PIN ({FINANCIAL_PIN_MIN_LENGTH} a 8 dígitos)</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinSetup}
              onChange={(e) => onPinSetupChange(e.target.value.replace(/\D/g, ""))}
              maxLength={8}
              className="mt-1 text-lg tracking-[0.35em] text-center"
              placeholder="••••"
            />
          </div>
          <Button
            className={cn("w-full", hbCooperadoPrimaryBtn)}
            onClick={onSalvarPin}
            disabled={busy || pinSetup.length < FINANCIAL_PIN_MIN_LENGTH}
          >
            Cadastrar PIN
          </Button>
          {pinResetPending && (
            <p className="text-sm text-cyan-900 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2">
              Reset solicitado — aguarde o responsável em Conta Coop → Limites.
            </p>
          )}
        </Card>
      ) : (
        <div className={hbCooperadoValueBox}>
          <p className="text-xs font-medium text-emerald-800">Pronto para pagar</p>
          <p className="mt-0.5 text-sm text-gray-700">
            Toque em <strong>QR Code</strong> ou escaneie no mercado. Seu PIN confirma a compra.
          </p>
          <Button
            size="lg"
            className={cn("mt-3 w-full", hbCooperadoPrimaryBtn)}
            onClick={onEscanearQr}
            disabled={accountBlocked}
          >
            Pagar com QR Code
          </Button>
          {pinResetPending ? (
            <p className="mt-3 text-sm text-cyan-900 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2">
              Reset de PIN pendente na cooperativa.
            </p>
          ) : (
            <button
              type="button"
              className="mt-3 w-full text-center text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
              onClick={() => void onSolicitarResetPin()}
              disabled={busy}
            >
              Esqueci meu PIN
            </button>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <h3 className="text-sm font-bold text-gray-900">Últimas movimentações</h3>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700"
            onClick={onTabExtrato}
          >
            Ver tudo
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
        <HbCreditCooperadoLedgerList entries={ledgerPreview} loading={ledgerLoading} />
      </div>
    </div>
  );
}
