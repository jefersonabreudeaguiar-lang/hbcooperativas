"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  QrCode,
} from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { getData, updateData } from "@/services/dataStore";
import {
  ensureCobrancaPeriodoAtualSaas,
  getPainelCobrancaSaasResponsavel,
  precisaAssinarContratoServico,
  responsavelInformouPagamentoSaas,
  sincronizarCicloCobrancaSaas,
} from "@/services/cobrancaSaasService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isDiretoriaRole } from "@/permissions";
import { PROPRIETARIO_APP } from "@/config/contratoServicoApp";

/**
 * Painel superior de mensalidade do aplicativo — PIX, boleto e confirmação de pagamento.
 */
export function CobrancaSaasPainel() {
  const { user } = useAuth();
  const data = useAppData();
  const [pixOpen, setPixOpen] = useState(false);
  const [copiedBoleto, setCopiedBoleto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  useEffect(() => {
    if (!user || !coopId || user.role === "cooperado") return;
    const d = getData();
    const coop = d.cooperativas.find((c) => c.id === coopId);
    if (!coop || precisaAssinarContratoServico(coop)) return;
    updateData((current) => {
      const before = JSON.stringify(current.cooperativas.find((c) => c.id === coopId)?.cobrancaSaas ?? {});
      let next = sincronizarCicloCobrancaSaas(current, coopId);
      next = ensureCobrancaPeriodoAtualSaas(next, coopId).data;
      const after = JSON.stringify(next.cooperativas.find((c) => c.id === coopId)?.cobrancaSaas ?? {});
      return before === after ? current : next;
    });
  }, [user?.id, user?.role, coopId]);

  const painel = useMemo(() => {
    if (!data || !coopId) return null;
    return getPainelCobrancaSaasResponsavel(data, coopId);
  }, [data, coopId]);

  if (!user || !data || !isDiretoriaRole(user.role) || !painel || painel.precisaContrato) {
    return null;
  }

  if (painel.statusMes === "aguardando_primeiro_cooperado" || painel.valorTotal <= 0) return null;
  if (painel.statusMes === "em_dia") return null;

  const copyBoleto = async () => {
    if (!painel.boletoReferencia) return;
    await navigator.clipboard.writeText(painel.boletoReferencia);
    setCopiedBoleto(true);
    setTimeout(() => setCopiedBoleto(false), 2000);
  };

  const informarPagamento = () => {
    if (!coopId) return;
    setBusy(true);
    setFeedback(null);
    try {
      updateData((d) => {
        const r = responsavelInformouPagamentoSaas(d, coopId, user.name);
        if (!r.ok) throw new Error(r.error ?? "Não foi possível informar pagamento.");
        return r.data;
      });
      setFeedback("Pagamento informado. Aguarde a confirmação do proprietário do aplicativo.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro ao informar pagamento.");
    } finally {
      setBusy(false);
    }
  };

  const variant =
    painel.statusMes === "bloqueado"
      ? "error"
      : painel.statusMes === "aviso_bloqueio"
        ? "warning"
        : painel.aguardandoConfirmacao
          ? "info"
          : "warning";

  return (
    <>
      <Card className="mb-4 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
              <Banknote size={14} /> Mensalidade do aplicativo
            </p>
            <h2 className="text-lg font-bold text-gray-900 mt-1">{painel.valorFormatado}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {painel.qtdCooperados} cooperado{painel.qtdCooperados === 1 ? "" : "s"} · ciclo {painel.periodoLabel}
            </p>
            <p className="text-sm text-gray-600">Vencimento: {painel.vencimentoLabel}</p>
          </div>
          <div className="text-right text-sm">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${
                painel.statusMes === "bloqueado"
                  ? "bg-red-100 text-red-800"
                  : painel.aguardandoConfirmacao
                    ? "bg-blue-100 text-blue-800"
                    : painel.emAtraso
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {painel.aguardandoConfirmacao ? <Clock size={14} /> : painel.emAtraso ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {painel.statusLabel}
            </span>
          </div>
        </div>

        {painel.avisoMensagem && (
          <AlertBanner variant={variant} className="mb-3">
            {painel.avisoMensagem}
          </AlertBanner>
        )}

        {feedback && (
          <AlertBanner variant="success" className="mb-3" onDismiss={() => setFeedback(null)}>
            {feedback}
          </AlertBanner>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="font-semibold text-gray-900 mb-1">PIX — proprietário do app</p>
            <p className="text-gray-600">Favorecido: {PROPRIETARIO_APP.nome}</p>
            <p className="text-gray-600">CPF: {painel.cpfProprietario}</p>
            <p className="text-gray-800 font-mono text-xs mt-1 break-all">Chave: {painel.pixChave}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="font-semibold text-gray-900 mb-1 flex items-center gap-1">
              <FileText size={14} /> Boleto
            </p>
            <p className="text-gray-600 text-xs mb-2">
              Solicite o boleto ao proprietário informando a referência abaixo (contrato pessoa física CPF{" "}
              {painel.cpfProprietario}).
            </p>
            {painel.boletoReferencia ? (
              <>
                <p className="font-mono text-xs break-all bg-gray-50 p-2 rounded">{painel.boletoReferencia}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={copyBoleto}>
                  <Copy size={14} /> {copiedBoleto ? "Copiado!" : "Copiar referência"}
                </Button>
              </>
            ) : (
              <p className="text-gray-500">Disponível após início do ciclo.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={painel.valorTotal <= 0}
            onClick={() => setPixOpen(true)}
          >
            <QrCode size={16} /> Pagar com PIX
          </Button>
          {painel.podeInformarPagamento && (
            <Button disabled={busy} onClick={informarPagamento}>
              <CheckCircle2 size={16} /> Pagamento informado
            </Button>
          )}
          {painel.aguardandoConfirmacao && (
            <p className="text-sm text-blue-800 self-center">
              Aguardando confirmação do proprietário — app sujeito a aviso de suspensão.
            </p>
          )}
        </div>
      </Card>

      <PixQrModal
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        chavePix={painel.pixChave}
        nome={painel.pixNome}
        valor={painel.valorTotal}
        hintAposPagamento="Depois de pagar, clique em “Pagamento informado” neste painel."
      />
    </>
  );
}
