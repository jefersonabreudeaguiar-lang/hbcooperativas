"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCode, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatMesReferencia } from "@/utils/format";
import type { ContaCoopAppRepassePreview, ContaCoopDiscountPoolResumo } from "@/modules/hb-credit/types";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { PROPRIETARIO_APP } from "@/config/contratoServicoApp";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { updateData } from "@/services/dataStore";
import { fetchAppRepassePreview, postConfirmAppRepasse } from "@/services/creditApiService";
import { lancarRepasseHbContaCoopNoCaixa } from "@/services/livroCaixaService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";

type Props = {
  cnpj: string;
  mesReferencia: string;
  resumo: ContaCoopDiscountPoolResumo | null;
  onConfirmed: () => void;
};

export function ContaCoopAppRepassePanel({ cnpj, mesReferencia, resumo, onConfirmed }: Props) {
  const { user } = useAuth();
  const data = useAppData();
  const [preview, setPreview] = useState<ContaCoopAppRepassePreview | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [comprovanteMemo, setComprovanteMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const coopId = useMemo(() => (user && data ? getUserCooperativaId(user, data) : undefined), [user, data]);
  const coop = useMemo(
    () => (coopId && data ? data.cooperativas.find((c) => c.id === coopId) : undefined),
    [coopId, data]
  );

  const reloadPreview = useCallback(async () => {
    if (!cnpj) return;
    try {
      const next = await fetchAppRepassePreview(cnpj, mesReferencia);
      setPreview(next);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar repasse HB.");
    }
  }, [cnpj, mesReferencia]);

  useEffect(() => {
    setError("");
    setSuccess("");
    reloadPreview();
  }, [reloadPreview]);

  const valorReais = (preview?.amountCents ?? resumo?.appRepassePendenteCents ?? 0) / 100;
  const jaPago = preview?.alreadyPaid ?? false;
  const podeGerarQr = !jaPago && valorReais > 0;

  const confirmarPagamento = async () => {
    if (!cnpj || !coopId || !coop?.cnpj) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await postConfirmAppRepasse(cnpj, mesReferencia, {
        comprovanteMemo: comprovanteMemo.trim() || undefined,
        responsavelNome: user?.name,
      });
      const repasse = result.repasse;
      const origemId = result.livroCaixaOrigemId ?? repasse?.livroCaixaOrigemId;
      if (!repasse || !origemId) throw new Error("Resposta incompleta do servidor.");

      updateData((d) =>
        lancarRepasseHbContaCoopNoCaixa(d, {
          cooperativaId: coopId,
          mesReferencia,
          valorReais: repasse.amountCents / 100,
          origemId,
          responsavel: user?.name,
          paidAt: repasse.paidAt,
        })
      );

      const synced = updateData((d) => d);
      await pushOperacionalToCloud(coop.cnpj, synced, coopId, { authoritative: true });

      setPixOpen(false);
      setComprovanteMemo("");
      setSuccess(
        `Repasse confirmado: ${formatCentsBRL(repasse.amountCents)} lançado no livro caixa com histórico automático.`
      );
      await reloadPreview();
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao confirmar repasse.");
    } finally {
      setBusy(false);
    }
  };

  if (!resumo || resumo.totalAppCents <= 0) return null;

  return (
    <>
      <Card className="space-y-4 !p-5 border-blue-200 bg-blue-50/30">
        <div>
          <h3 className="font-semibold text-gray-900">Repasse ao aplicativo ({CONTA_COOP_DESCONTO_SPLIT.appPercent}%)</h3>
          <p className="mt-1 text-sm text-gray-600">
            Valor apurado das compras com desconto em {formatMesReferencia(mesReferencia)}, após liquidação dos
            mercados. Gere o QR PIX, pague à HB Cooperativas e confirme — o débito entra automaticamente no livro
            caixa (sem duplicar lançamento manual).
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-blue-200 bg-white p-3">
            <p className="text-xs text-blue-800">A pagar (QR PIX)</p>
            <p className="mt-1 text-lg font-bold text-blue-900">
              {jaPago ? formatCentsBRL(0) : formatCentsBRL(preview?.amountCents ?? resumo.appRepassePendenteCents)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Aguardando liquidação mercado</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCentsBRL(resumo.appPendenteCents)}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-white p-3">
            <p className="text-xs text-green-800">Já repassado ao app</p>
            <p className="mt-1 text-lg font-semibold text-green-900">{formatCentsBRL(resumo.appRepassePagoCents)}</p>
          </div>
        </div>

        {jaPago && preview?.repasse && (
          <AlertBanner variant="info" title="Repasse confirmado neste mês">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={16} />
              {formatCentsBRL(preview.repasse.amountCents)} em{" "}
              {new Date(preview.repasse.paidAt).toLocaleString("pt-BR")} · livro caixa{" "}
              <code className="text-xs">{preview.repasse.livroCaixaOrigemId}</code>
            </span>
          </AlertBanner>
        )}

        {podeGerarQr && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="memo-repasse">Observação do comprovante (opcional)</Label>
              <Input
                id="memo-repasse"
                value={comprovanteMemo}
                onChange={(e) => setComprovanteMemo(e.target.value)}
                placeholder="Ex.: PIX HB Conta Coop set/2026"
                className="mt-1"
              />
            </div>
            <Button onClick={() => setPixOpen(true)} disabled={busy}>
              <QrCode size={16} /> Gerar QR Code PIX ({formatCentsBRL(preview?.amountCents ?? 0)})
            </Button>
          </div>
        )}

        {!jaPago && valorReais <= 0 && resumo.appPendenteCents > 0 && (
          <p className="text-sm text-amber-800">
            Ainda não há valor elegível para repasse. Liquide os mercados na aba <strong>Liquidar</strong> para liberar
            o pagamento dos {CONTA_COOP_DESCONTO_SPLIT.appPercent}%.
          </p>
        )}
      </Card>

      <PixQrModal
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        chavePix={PROPRIETARIO_APP.pixChave}
        nome={PROPRIETARIO_APP.pixNome}
        valor={valorReais}
        hintAposPagamento="Após pagar no banco, clique em Confirmar pagamento abaixo para registrar no livro caixa."
        onEnviarComprovante={confirmarPagamento}
        confirmLabel={busy ? "Confirmando…" : "Confirmar pagamento"}
      />

      {success && (
        <AlertBanner variant="info" title="Repasse registrado">
          {success}
        </AlertBanner>
      )}
      {error && <AlertBanner variant="error">{error}</AlertBanner>}
    </>
  );
}
