"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { updateData, getData } from "@/services/dataStore";
import { pushCobrancaSaasToCloud } from "@/services/cooperativaCloudService";
import { patchCobrancaSaas, sincronizarCicloCobrancaSaas } from "@/services/cobrancaSaasService";
import { lancarRepasseHbContaCoopNoCaixa } from "@/services/livroCaixaService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatMesReferencia } from "@/utils/format";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  createHbAsaasCharge,
  fetchHbChargePreview,
} from "@/services/hbAsaasApiService";
import type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";
import { HbChargeBreakdownDetail } from "@/components/payments/HbChargeBreakdownDetail";
import type { CobrancaSaasCooperativa } from "@/types";

type Props = {
  cnpj: string;
  mesReferenciaContaCoop?: string;
  compact?: boolean;
  onPaid?: () => void;
};

function formatCents(cents: number): string {
  return formatCentsBRL(cents);
}

export function HbUnifiedPaymentPanel({ cnpj, mesReferenciaContaCoop, compact, onPaid }: Props) {
  const { user } = useAuth();
  const data = useAppData();
  const [breakdown, setBreakdown] = useState<HbUnifiedChargeBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixImage, setPixImage] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);

  const coopId = useMemo(
    () => (user && data ? getUserCooperativaId(user, data) : undefined),
    [user, data]
  );

  const mesRef = mesReferenciaContaCoop ?? breakdown?.mesReferenciaContaCoop;

  const reloadPreview = useCallback(async () => {
    if (!cnpj) return;
    setLoading(true);
    setError("");
    try {
      const next = await fetchHbChargePreview(cnpj, mesRef);
      setBreakdown(next);
      if (!next.saasDue && !next.repasseDue && !paid) {
        /* nothing due */
      }
    } catch (e) {
      setBreakdown(null);
      setError(e instanceof Error ? e.message : "Erro ao calcular cobrança.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, mesRef, paid]);

  useEffect(() => {
    void reloadPreview();
  }, [reloadPreview]);

  const syncLocalFromCloud = useCallback(async (activeChargeId?: string | null) => {
    if (!cnpj || !coopId) return;
    const qs = new URLSearchParams({ cnpj });
    if (activeChargeId) qs.set("chargeId", activeChargeId);
    const res = await secureApiFetch(`/api/payments/hb-charge/cloud-state?${qs.toString()}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      cobrancaSaas?: CobrancaSaasCooperativa;
      livroCaixaOrigemId?: string;
      charge?: {
        status?: string;
        repasse_confirmed_at?: string | null;
        repasse_subtotal_cents?: number;
        breakdown?: HbUnifiedChargeBreakdown;
      };
    };
    if (!json.ok) return;

    if (json.cobrancaSaas) {
      updateData((d) => {
        let next = patchCobrancaSaas(d, coopId, json.cobrancaSaas!);
        next = sincronizarCicloCobrancaSaas(next, coopId);
        return next;
      });
      const coop = getData().cooperativas.find((c) => c.id === coopId);
      if (coop?.cobrancaSaas) {
        void pushCobrancaSaasToCloud(coop.cnpj, coop.cobrancaSaas);
      }
    }

    const chargeBreakdown = json.charge?.breakdown as HbUnifiedChargeBreakdown | undefined;
    const repasseCents =
      json.charge?.repasse_subtotal_cents ?? chargeBreakdown?.repasseSubtotalCents ?? 0;
    if (json.charge?.repasse_confirmed_at && repasseCents > 0 && chargeBreakdown) {
      const origemId =
        json.livroCaixaOrigemId ?? `hb_app_asaas_${chargeBreakdown.mesReferenciaContaCoop}`;
      updateData((d) => {
        const coop = d.cooperativas.find((c) => c.id === coopId);
        if (!coop) return d;
        return lancarRepasseHbContaCoopNoCaixa(d, {
          cooperativaId: coopId,
          mesReferencia: chargeBreakdown.mesReferenciaContaCoop,
          valorReais: repasseCents / 100,
          origemId,
          responsavel: user?.name,
          paidAt: json.charge?.repasse_confirmed_at ?? new Date().toISOString(),
        });
      });
      const synced = getData();
      const coopAfter = synced.cooperativas.find((c) => c.id === coopId);
      if (coopAfter?.cnpj) {
        await pushOperacionalToCloud(coopAfter.cnpj, synced, coopId, { authoritative: true });
      }
    }
  }, [cnpj, coopId, user?.name]);

  useEffect(() => {
    if (!chargeId || paid) return;
    const timer = setInterval(() => {
      void reloadPreview().then(async () => {
        const qs = new URLSearchParams({ cnpj, chargeId });
        const res = await secureApiFetch(`/api/payments/hb-charge/cloud-state?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { charge?: { status?: string } };
        if (json.charge?.status === "confirmed") {
          setPaid(true);
          await syncLocalFromCloud(chargeId);
          onPaid?.();
        }
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [chargeId, paid, cnpj, reloadPreview, syncLocalFromCloud, onPaid]);

  const gerarPixAsaas = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createHbAsaasCharge(cnpj, mesRef);
      if (!result.ok || !result.pix?.payload) {
        throw new Error(result.error ?? "Não foi possível gerar cobrança Asaas.");
      }
      setBreakdown(result.breakdown ?? breakdown);
      setPixPayload(result.pix.payload);
      setPixImage(result.pix.encodedImage);
      setChargeId(result.chargeId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PIX.");
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async () => {
    if (!pixPayload) return;
    await navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !breakdown) {
    return (
      <Card className="mb-4">
        <p className="text-sm text-gray-500 flex items-center gap-2 py-4">
          <Loader2 size={16} className="animate-spin" /> Calculando cobrança com dados reais da nuvem…
        </p>
      </Card>
    );
  }

  if (!breakdown || (breakdown.totalCents <= 0 && !paid)) {
    if (compact) return null;
    return (
      <Card className="mb-4 border-green-200 bg-green-50/40">
        <p className="text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 size={18} /> Nenhuma cobrança HB pendente — mensalidade e repasse Conta Coop em dia.
        </p>
      </Card>
    );
  }

  if (paid) {
    return (
      <AlertBanner variant="success" title="Pagamento confirmado automaticamente">
        A mensalidade e/ou repasse Conta Coop foram creditados via Asaas. O app será liberado em instantes.
      </AlertBanner>
    );
  }

  return (
    <Card className={`mb-4 border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-white ${compact ? "!p-4" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-900 flex items-center gap-1">
            <ShieldCheck size={14} /> Pagamento HB · Asaas · CPF {breakdown.receiver.cpf}
          </p>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">{formatCents(breakdown.totalCents)}</h2>
          <p className="text-sm text-gray-600 mt-1">
            Valores apurados na nuvem em {new Date(breakdown.generatedAt).toLocaleString("pt-BR")}
          </p>
          {breakdown.periodoSaas && (
            <p className="text-sm text-gray-600">Ciclo adesão: {breakdown.periodoSaas.label}</p>
          )}
          {breakdown.repasseDue && (
            <p className="text-sm text-gray-600">
              Fechamento Conta Coop:{" "}
              {breakdown.repasseFechamentoLabel ?? formatMesReferencia(breakdown.mesReferenciaContaCoop)}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reloadPreview()} disabled={loading}>
          <RefreshCw size={14} /> Atualizar valores
        </Button>
      </div>

      {error && (
        <AlertBanner variant="error" className="mb-4">
          {error}
        </AlertBanner>
      )}

      <HbChargeBreakdownDetail breakdown={breakdown} showHeader={false} />

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-950 mb-4 mt-4">
        <Banknote size={14} className="inline mr-1" />
        Pagamento via <strong>Asaas</strong> para o CPF {breakdown.receiver.cpf} ({breakdown.receiver.nome}). Após o PIX,
        a confirmação é <strong>automática</strong> — mensalidade liberada e repasse Conta Coop registrado na nuvem.
      </div>

      {!pixPayload ? (
        <Button onClick={() => void gerarPixAsaas()} disabled={busy || breakdown.totalCents <= 0}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Gerando cobrança…
            </>
          ) : (
            <>
              <QrCode size={16} /> Gerar PIX Asaas · {formatCents(breakdown.totalCents)}
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-4">
          {pixImage && (
            <div className="flex justify-center">
              <img
                src={`data:image/png;base64,${pixImage}`}
                alt="QR Code PIX Asaas"
                className="w-48 h-48 rounded-xl border border-gray-200 bg-white p-2"
              />
            </div>
          )}
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500 mb-1">PIX copia e cola</p>
            <p className="text-xs font-mono break-all text-gray-800">{pixPayload}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copyPix()}>
              <Copy size={14} /> {copied ? "Copiado!" : "Copiar PIX"}
            </Button>
            <Button variant="secondary" onClick={() => void gerarPixAsaas()} disabled={busy}>
              <RefreshCw size={14} /> Recalcular e novo QR
            </Button>
          </div>
          <p className="text-sm text-blue-800 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Aguardando confirmação automática do Asaas…
          </p>
        </div>
      )}
    </Card>
  );
}
