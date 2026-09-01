"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { ContaCoopSegmentTabs } from "@/components/hb-credit/ContaCoopSegmentTabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  cancelCreditIntent,
  confirmarLiquidacaoMercado,
  createCreditIntent,
  fetchMercadoParceiroData,
  fetchPartnerRefundData,
  pollCreditIntentPayment,
  postRefundRequestAction,
  saveMercadoPix,
  setMercadoFinancialPin,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import type { ContaCoopCompraEstornavel, ContaCoopIntent, ContaCoopParceiro, ContaCoopSettlement, ContaCoopSolicitacaoEstorno } from "@/modules/hb-credit/types";
import { ContaCoopFiscalNotesMercadoPanel } from "@/components/hb-credit/ContaCoopFiscalNotesMercadoPanel";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { formatCpfCnpj, formatDateTime, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

type MercadoTab = "inicio" | "cobrar" | "vendas" | "mais";

type CobrancaQrAtiva = {
  qrUrl: string;
  qrPayload: string;
  amountCents: number;
  descricao?: string;
  intentId: string;
  expiresAt: string;
};

type ComprovantePagamentoMercado = {
  amountCents: number;
  descricao?: string;
  cooperadoNome: string;
  cooperadoCpf: string;
  receiptCode: string | null;
  paidAt: string;
  transacaoId: string;
};

async function gerarQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 480,
    margin: 4,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export default function MercadoParceiroPage() {
  return (
    <CreditFeatureGate>
      <MercadoParceiroContent />
    </CreditFeatureGate>
  );
}

function MercadoParceiroContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parceiro, setParceiro] = useState<ContaCoopParceiro | null>(null);
  const [intents, setIntents] = useState<ContaCoopIntent[]>([]);
  const [recebiveis, setRecebiveis] = useState<{ id: string; amountCents: number; status: string; createdAt: string }[]>([]);
  const [settlements, setSettlements] = useState<ContaCoopSettlement[]>([]);
  const [comprasEstornaveis, setComprasEstornaveis] = useState<ContaCoopCompraEstornavel[]>([]);
  const [solicitacoesEstorno, setSolicitacoesEstorno] = useState<ContaCoopSolicitacaoEstorno[]>([]);
  const [pixKey, setPixKey] = useState("");
  const [pixHolderName, setPixHolderName] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [valorReais, setValorReais] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cobrancaQr, setCobrancaQr] = useState<CobrancaQrAtiva | null>(null);
  const [comprovante, setComprovante] = useState<ComprovantePagamentoMercado | null>(null);
  const [aguardandoPagamento, setAguardandoPagamento] = useState(false);
  const [busy, setBusy] = useState(false);
  const qrDestaqueRef = useRef<HTMLDivElement>(null);
  const comprovanteRef = useRef<HTMLDivElement>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pinSetup, setPinSetup] = useState("");
  const [estornoAlvo, setEstornoAlvo] = useState<ContaCoopCompraEstornavel | null>(null);
  const [estornoMotivo, setEstornoMotivo] = useState("");
  const [estornoPin, setEstornoPin] = useState("");
  const [fiscalPendentes, setFiscalPendentes] = useState(0);
  const [tab, setTab] = useState<MercadoTab>("inicio");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchMercadoParceiroData();
      setParceiro(data.parceiro ?? null);
      setIntents(data.intents ?? []);
      setRecebiveis(data.recebiveis ?? []);
      setSettlements(data.settlements ?? []);
      setHasPin(Boolean(data.hasPin));
      setFiscalPendentes(Number(data.fiscalPendentes ?? 0));
      if (data.parceiro?.status === "ativo") {
        try {
          const refundData = await fetchPartnerRefundData();
          setComprasEstornaveis(refundData.compras);
          setSolicitacoesEstorno(refundData.solicitacoes);
        } catch {
          setComprasEstornaveis([]);
          setSolicitacoesEstorno([]);
        }
      } else {
        setComprasEstornaveis([]);
        setSolicitacoesEstorno([]);
      }
      if (data.parceiro?.pixKey) setPixKey(data.parceiro.pixKey);
      if (data.parceiro?.pixHolderName) setPixHolderName(data.parceiro.pixHolderName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!cobrancaQr) {
      setAguardandoPagamento(false);
      return;
    }

    let cancelled = false;
    setAguardandoPagamento(true);

    const verificar = async () => {
      try {
        const status = await pollCreditIntentPayment(cobrancaQr.intentId);
        if (cancelled) return;

        if (status.payment) {
          setComprovante({
            amountCents: status.amountCents,
            descricao: status.descricao,
            cooperadoNome: status.payment.cooperadoNome,
            cooperadoCpf: status.payment.cooperadoCpf,
            receiptCode: status.payment.receiptCode,
            paidAt: status.payment.paidAt,
            transacaoId: status.payment.transacaoId,
          });
          setCobrancaQr(null);
          setAguardandoPagamento(false);
          setSuccess("Pagamento confirmado!");
          setTab("cobrar");
          requestAnimationFrame(() => {
            comprovanteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          void reload();
          return;
        }

        if (status.status === "expirada" || status.status === "cancelada") {
          setCobrancaQr(null);
          setAguardandoPagamento(false);
          setError(status.status === "expirada" ? "Cobrança expirada." : "Cobrança cancelada.");
        }
      } catch {
        /* rede momentânea — continua polling */
      }
    };

    void verificar();
    const timer = window.setInterval(() => void verificar(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cobrancaQr, reload]);

  const criarCobranca = async () => {
    setBusy(true);
    setError("");
    setCobrancaQr(null);
    setComprovante(null);
    try {
      const amount = Number(valorReais.replace(",", "."));
      const res = await createCreditIntent(amount, descricao.trim() || undefined);
      if (res.qrPayload && res.intent) {
        const url = await gerarQrDataUrl(res.qrPayload);
        setCobrancaQr({
          qrUrl: url,
          qrPayload: res.qrPayload,
          amountCents: res.intent.amountCents,
          descricao: res.intent.descricao,
          intentId: res.intent.id,
          expiresAt: res.intent.expiresAt,
        });
        setTab("cobrar");
        requestAnimationFrame(() => {
          qrDestaqueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar cobrança.");
    } finally {
      setBusy(false);
    }
  };

  const fecharComprovante = () => {
    setComprovante(null);
    setValorReais("");
    setDescricao("");
  };

  const cancelarCobrancaAtiva = async () => {
    if (!cobrancaQr) return;
    setBusy(true);
    try {
      await cancelCreditIntent(cobrancaQr.intentId);
      setCobrancaQr(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar.");
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async (intentId: string) => {
    setBusy(true);
    try {
      await cancelCreditIntent(intentId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar.");
    } finally {
      setBusy(false);
    }
  };

  const salvarPin = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await setMercadoFinancialPin(pinSetup);
      setHasPin(true);
      setPinSetup("");
      setSuccess("PIN financeiro cadastrado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar PIN.");
    } finally {
      setBusy(false);
    }
  };

  const abrirEstorno = (compra: ContaCoopCompraEstornavel) => {
    if (!hasPin) {
      setError("Cadastre seu PIN financeiro antes de solicitar estorno.");
      return;
    }
    setEstornoAlvo(compra);
    setEstornoMotivo("");
    setEstornoPin("");
    setError("");
  };

  const enviarEstorno = async () => {
    if (!estornoAlvo) return;
    if (estornoMotivo.trim().length < 5) {
      setError("Descreva o motivo do estorno (mínimo 5 caracteres).");
      return;
    }
    if (estornoPin.length < FINANCIAL_PIN_MIN_LENGTH) {
      setError(`Informe seu PIN financeiro (${FINANCIAL_PIN_MIN_LENGTH}+ dígitos).`);
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await postRefundRequestAction({
        action: "create",
        transactionId: estornoAlvo.id,
        motivo: estornoMotivo.trim(),
        pin: estornoPin,
      });
      setSuccess("Solicitação enviada à cooperativa. Aguarde aprovação.");
      setEstornoAlvo(null);
      setEstornoMotivo("");
      setEstornoPin("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar estorno.");
    } finally {
      setBusy(false);
    }
  };


  const cancelarSolicitacao = async (requestId: string) => {
    if (!window.confirm("Cancelar esta solicitação de estorno?")) return;
    setBusy(true);
    setError("");
    try {
      await postRefundRequestAction({ action: "cancel", requestId });
      setSuccess("Solicitação cancelada.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar solicitação.");
    } finally {
      setBusy(false);
    }
  };

  const statusSolicitacao = (status: ContaCoopSolicitacaoEstorno["status"]) => {
    if (status === "pendente") return "Aguardando cooperativa";
    if (status === "aprovado") return "Aprovado";
    if (status === "negado") return "Negado";
    return "Cancelado";
  };

  const salvarPix = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await saveMercadoPix(pixKey, pixHolderName);
      setSuccess("PIX cadastrado com sucesso.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar PIX.");
    } finally {
      setBusy(false);
    }
  };

  const confirmarLiquidacao = async (settlementId: string) => {
    if (!assinatura) {
      setError("Assine o relatório antes de confirmar.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await confirmarLiquidacaoMercado(settlementId, assinatura);
      setSuccess("Pagamento confirmado e relatório assinado enviado à cooperativa.");
      setAssinatura(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar.");
    } finally {
      setBusy(false);
    }
  };

  const pendenteConfirmacao = settlements.find((s) => s.status === "aguardando_mercado");
  const mesReferencia = getCurrentMesReferencia();

  const resumoMercado = useMemo(() => {
    const abertoCents = recebiveis
      .filter((r) => r.status === "aberto")
      .reduce((sum, r) => sum + r.amountCents, 0);
    const elegivelCents = recebiveis
      .filter((r) => r.status === "elegivel")
      .reduce((sum, r) => sum + r.amountCents, 0);
    const emLiquidacaoCents = recebiveis
      .filter((r) => r.status === "em_processamento")
      .reduce((sum, r) => sum + r.amountCents, 0);
    const aguardandoAssinaturaCents = settlements
      .filter((s) => s.status === "aguardando_mercado")
      .reduce((sum, s) => sum + s.totalCents, 0);
    const aReceberCents = abertoCents + elegivelCents;
    const totalPendenteCents = aReceberCents + emLiquidacaoCents + aguardandoAssinaturaCents;
    const nfPercent =
      aReceberCents > 0 ? Math.min(100, Math.round((elegivelCents / aReceberCents) * 100)) : 0;

    return {
      abertoCents,
      elegivelCents,
      emLiquidacaoCents,
      aguardandoAssinaturaCents,
      aReceberCents,
      totalPendenteCents,
      nfPercent,
    };
  }, [recebiveis, settlements]);

  if (loading && !parceiro) return <PageSkeleton />;

  const ativo = parceiro?.status === "ativo";
  const pendente = parceiro?.status === "pendente";

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Conta Coop · Mercado</p>
        <h1 className="text-2xl font-bold text-gray-900">{parceiro?.nomeMercado ?? "Mercado parceiro"}</h1>
        <p className="text-sm text-gray-500">Vendas com crédito interno da cooperativa</p>
      </header>

      <ContaCoopSegmentTabs
        tabs={[
          { id: "inicio", label: "Início" },
          { id: "cobrar", label: "Cobrar" },
          { id: "vendas", label: "Vendas" },
          { id: "mais", label: "Mais" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "inicio" && (
        <>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-green-800 via-green-700 to-emerald-600 p-6 text-white shadow-lg">
            <p className="text-sm font-medium text-green-100">A receber da cooperativa</p>
            <p className="mt-1 text-4xl font-bold tracking-tight">{formatCentsBRL(resumoMercado.aReceberCents)}</p>
            <p className="mt-1 text-xs text-green-200">{formatMesReferencia(mesReferencia)} · vendas aguardando repasse</p>
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-xs text-green-100">
                <span>Com NF conferida {formatCentsBRL(resumoMercado.elegivelCents)}</span>
                <span>Aguardando NF {formatCentsBRL(resumoMercado.abertoCents)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-green-900/40">
                <div
                  className="h-full rounded-full bg-white/90 transition-all"
                  style={{ width: `${resumoMercado.nfPercent}%` }}
                />
              </div>
            </div>
            {(resumoMercado.emLiquidacaoCents > 0 || resumoMercado.aguardandoAssinaturaCents > 0) && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-green-100">
                {resumoMercado.emLiquidacaoCents > 0 && (
                  <span>Em liquidação {formatCentsBRL(resumoMercado.emLiquidacaoCents)}</span>
                )}
                {resumoMercado.aguardandoAssinaturaCents > 0 && (
                  <span>Aguardando sua assinatura {formatCentsBRL(resumoMercado.aguardandoAssinaturaCents)}</span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="!p-4 text-center">
              <p className="text-xs text-gray-500">Pronto p/ pagamento</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCentsBRL(resumoMercado.elegivelCents)}</p>
            </Card>
            <Card className="!p-4 text-center">
              <p className="text-xs text-gray-500">Aguardando NF</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCentsBRL(resumoMercado.abertoCents)}</p>
            </Card>
            <Card className="!p-4 text-center">
              <p className="text-xs text-gray-500">Em liquidação</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCentsBRL(resumoMercado.emLiquidacaoCents)}</p>
            </Card>
            <Card className="!p-4 text-center">
              <p className="text-xs text-gray-500">Total pendente</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCentsBRL(resumoMercado.totalPendenteCents)}</p>
            </Card>
          </div>
          <Button size="lg" className="w-full" onClick={() => setTab("cobrar")} disabled={!ativo}>
            Cobrar com QR Code
          </Button>
          {pendenteConfirmacao && (
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setTab("mais")}>
              Confirmar pagamento da cooperativa
            </Button>
          )}
        </>
      )}

      {tab === "cobrar" && (
        <div className="space-y-4">
          {comprovante && (
            <div ref={comprovanteRef} className="scroll-mt-4">
              <Card className="overflow-hidden border-2 border-emerald-600 bg-white p-0 shadow-lg ring-4 ring-emerald-500/20">
                <div className="bg-emerald-600 px-5 py-5 text-center text-white">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Pagamento confirmado</p>
                  <p className="mt-2 text-4xl font-bold tabular-nums">{formatCentsBRL(comprovante.amountCents)}</p>
                  {comprovante.descricao && <p className="mt-1 text-sm text-emerald-100">{comprovante.descricao}</p>}
                </div>
                <div className="space-y-4 px-5 py-6">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Cooperado</p>
                      <p className="text-lg font-semibold text-gray-900">{comprovante.cooperadoNome}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">CPF</p>
                      <p className="text-base font-medium text-gray-900 tabular-nums">
                        {formatCpfCnpj(comprovante.cooperadoCpf)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Comprovante</p>
                        <p className="font-semibold text-gray-900">{comprovante.receiptCode ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Horário</p>
                        <p className="font-semibold text-gray-900">{formatDateTime(comprovante.paidAt)}</p>
                      </div>
                    </div>
                  </div>
                  <Button size="lg" className="w-full" onClick={fecharComprovante}>
                    Nova cobrança
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {cobrancaQr && !comprovante && (
            <div ref={qrDestaqueRef} className="scroll-mt-4">
              <Card className="overflow-hidden border-2 border-green-600 bg-gradient-to-b from-green-50 to-white p-0 shadow-lg ring-4 ring-green-600/15">
                <div className="bg-green-700 px-5 py-4 text-center text-white">
                  <p className="text-xs font-semibold uppercase tracking-widest text-green-100">Cobrança aberta</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">
                    {formatCentsBRL(cobrancaQr.amountCents)}
                  </p>
                  {cobrancaQr.descricao && (
                    <p className="mt-1 text-sm text-green-100">{cobrancaQr.descricao}</p>
                  )}
                  <p className="mt-2 text-xs text-green-200">
                    Peça ao cooperado escanear este QR · expira{" "}
                    {new Date(cobrancaQr.expiresAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {aguardandoPagamento && (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-800/80 px-3 py-1 text-xs font-medium text-green-50">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-lime-300" />
                      Aguardando pagamento do cooperado…
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-4 px-5 py-6">
                  <div className="rounded-2xl border-4 border-gray-900 bg-white p-4 shadow-inner">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cobrancaQr.qrUrl}
                      alt="QR Code da cobrança Conta Coop"
                      className="h-auto w-[min(100vw-4rem,22rem)] max-w-full aspect-square"
                    />
                  </div>
                  <p className="text-center text-sm font-medium text-gray-800">
                    Aponte a câmera do cooperado para o quadrado preto
                  </p>
                  <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => void cancelarCobrancaAtiva()}
                      disabled={busy}
                    >
                      Cancelar cobrança
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {!comprovante && !cobrancaQr && (
            <Card className="space-y-4 !p-5">
              <div>
                <h3 className="font-semibold text-gray-900">Nova cobrança</h3>
                <p className="text-sm text-gray-600">Informe o valor e gere o QR para o cooperado pagar.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input value={valorReais} onChange={(e) => setValorReais(e.target.value)} disabled={!ativo} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!ativo} />
                </div>
              </div>
              <Button onClick={() => void criarCobranca()} disabled={busy || !ativo} size="lg" className="w-full">
                {busy ? "Gerando QR..." : "Gerar QR Code"}
              </Button>
            </Card>
          )}
        </div>
      )}

      {tab === "vendas" && (
        <div className="space-y-4">
          {estornoAlvo && (
            <Card className="space-y-4 border-amber-300 bg-amber-50/40 p-5">
              <div>
                <h3 className="font-semibold text-gray-900">Solicitar estorno</h3>
                <p className="text-sm text-gray-600">
                  {formatCentsBRL(estornoAlvo.amountCents)} · a cooperativa precisa aprovar
                </p>
              </div>
              <div>
                <Label>Motivo</Label>
                <Input
                  className="mt-1"
                  value={estornoMotivo}
                  onChange={(e) => setEstornoMotivo(e.target.value)}
                  placeholder="Ex.: compra de teste, produto devolvido..."
                />
              </div>
              <div>
                <Label>PIN financeiro</Label>
                <Input
                  className="mt-1"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={estornoPin}
                  onChange={(e) => setEstornoPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirme com seu PIN"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void enviarEstorno()} disabled={busy}>
                  {busy ? "Enviando..." : "Enviar solicitação"}
                </Button>
                <Button variant="secondary" onClick={() => setEstornoAlvo(null)} disabled={busy}>
                  Cancelar
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-5 space-y-2">
            <h3 className="font-semibold">Compras confirmadas</h3>
            <p className="text-sm text-gray-600">
              Para devolver crédito ao cooperado, solicite estorno — a cooperativa precisa aprovar.
            </p>
            {comprasEstornaveis.map((compra) => (
              <div key={compra.id} className="flex items-center justify-between border-b py-2 text-sm gap-3">
                <div>
                  <p className="font-medium">{formatCentsBRL(compra.amountCents)}</p>
                  <p className="text-xs text-gray-500">{new Date(compra.createdAt).toLocaleString("pt-BR")}</p>
                  {compra.receiptCode && <p className="text-xs text-gray-500">Recibo {compra.receiptCode}</p>}
                  {compra.solicitacaoPendenteId && (
                    <p className="text-xs font-medium text-amber-700">Solicitação pendente na cooperativa</p>
                  )}
                </div>
                {!compra.solicitacaoPendenteId ? (
                  <Button size="sm" variant="secondary" onClick={() => abrirEstorno(compra)} disabled={busy || !ativo || !hasPin}>
                    Solicitar estorno
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void cancelarSolicitacao(compra.solicitacaoPendenteId!)}
                    disabled={busy}
                  >
                    Cancelar solicitação
                  </Button>
                )}
              </div>
            ))}
            {!comprasEstornaveis.length && (
              <p className="text-sm text-gray-500">Nenhuma compra confirmada elegível para estorno.</p>
            )}
          </Card>

          <Card className="p-5 space-y-2">
            <h3 className="font-semibold">Solicitações de estorno</h3>
            {solicitacoesEstorno.slice(0, 15).map((s) => (
              <div key={s.id} className="flex justify-between border-b py-2 text-sm gap-3">
                <div>
                  <p className="font-medium">{formatCentsBRL(s.amountCents)} · {statusSolicitacao(s.status)}</p>
                  <p className="text-xs text-gray-500">{s.motivo}</p>
                  <p className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleString("pt-BR")}</p>
                  {s.reviewNote && s.status === "negado" && (
                    <p className="text-xs text-red-600">Resposta: {s.reviewNote}</p>
                  )}
                </div>
                {s.status === "pendente" && (
                  <Button size="sm" variant="secondary" onClick={() => void cancelarSolicitacao(s.id)} disabled={busy}>
                    Cancelar
                  </Button>
                )}
              </div>
            ))}
            {!solicitacoesEstorno.length && <p className="text-sm text-gray-500">Nenhuma solicitação ainda.</p>}
          </Card>

          <Card className="p-5 space-y-2">
            <h3 className="font-semibold">Cobranças recentes</h3>
            {intents.map((intent) => (
              <div key={intent.id} className="flex items-center justify-between border-b py-2 text-sm">
                <div>
                  <p className="font-medium">{formatCentsBRL(intent.amountCents)} · {intent.status}</p>
                  <p className="text-xs text-gray-500">{new Date(intent.createdAt).toLocaleString("pt-BR")}</p>
                </div>
                {["pendente", "criada"].includes(intent.status) && (
                  <Button size="sm" variant="secondary" onClick={() => cancelar(intent.id)} disabled={busy}>
                    Cancelar
                  </Button>
                )}
              </div>
            ))}
            {!intents.length && <p className="text-sm text-gray-500">Nenhuma cobrança.</p>}
          </Card>
        </div>
      )}

      {tab === "mais" && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">Seu PIX para receber da cooperativa</h3>
              <p className="text-sm text-gray-600">Cadastre antes do dia de pagamento — igual o cooperado cadastra o PIX na ficha.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Chave PIX</Label>
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone" />
              </div>
              <div>
                <Label>Titular da chave</Label>
                <Input value={pixHolderName} onChange={(e) => setPixHolderName(e.target.value)} placeholder="Nome do titular" />
              </div>
            </div>
            <Button onClick={() => void salvarPix()} disabled={busy || !pixKey.trim() || !pixHolderName.trim()}>
              Salvar PIX
            </Button>
            {parceiro?.pixKey && (
              <p className="text-sm text-green-700">
                PIX cadastrado: <strong>{parceiro.pixKey}</strong>
              </p>
            )}
          </Card>

          {pendenteConfirmacao && (
            <Card className="space-y-4 border-green-300 bg-green-50/50 p-5">
              <div>
                <h3 className="font-semibold text-gray-900">Confirmar pagamento da cooperativa</h3>
                <p className="text-sm text-gray-600">
                  {formatMesReferencia(pendenteConfirmacao.mesReferencia)} · Total {formatCentsBRL(pendenteConfirmacao.totalCents)} ·{" "}
                  {pendenteConfirmacao.transacoesCount} transação(ões)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Registrado por {pendenteConfirmacao.responsavelNome ?? "cooperativa"}
                  {pendenteConfirmacao.pagoEm ? ` em ${new Date(pendenteConfirmacao.pagoEm).toLocaleString("pt-BR")}` : ""}
                </p>
              </div>
              {pendenteConfirmacao.relatorioHtml && (
                <iframe
                  title="Relatório de liquidação"
                  srcDoc={pendenteConfirmacao.relatorioHtml}
                  className="h-72 w-full rounded-xl border bg-white"
                />
              )}
              <div>
                <Label>Assine como responsável do mercado</Label>
                <SignaturePad onChange={setAssinatura} className="mt-2 h-36 w-full rounded-xl border bg-white" />
              </div>
              <Button
                size="lg"
                className="w-full"
                onClick={() => void confirmarLiquidacao(pendenteConfirmacao.id)}
                disabled={busy || !assinatura}
              >
                Confirmar recebimento e enviar à cooperativa
              </Button>
            </Card>
          )}

          {ativo && <ContaCoopFiscalNotesMercadoPanel />}

          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">PIN financeiro do mercado</h3>
              <p className="text-sm text-gray-600">
                Obrigatório para solicitar estorno. Use um PIN numérico de {FINANCIAL_PIN_MIN_LENGTH} ou mais dígitos.
              </p>
            </div>
            {hasPin ? (
              <p className="text-sm text-green-700">PIN cadastrado. Você precisará dele ao solicitar estorno.</p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label>Criar PIN</Label>
                  <Input
                    className="mt-1"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pinSetup}
                    onChange={(e) => setPinSetup(e.target.value.replace(/\D/g, ""))}
                    placeholder="Somente números"
                  />
                </div>
                <Button onClick={() => void salvarPin()} disabled={busy || pinSetup.length < FINANCIAL_PIN_MIN_LENGTH}>
                  Salvar PIN
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-2">
            <h3 className="font-semibold">Histórico de liquidações</h3>
            {settlements.map((s) => (
              <div key={s.id} className="flex justify-between border-b py-2 text-sm">
                <div>
                  <p className="font-medium">{formatMesReferencia(s.mesReferencia)}</p>
                  <p className="text-xs text-gray-500">
                    {s.status === "confirmado"
                      ? "Confirmado"
                      : s.status === "aguardando_mercado"
                        ? "Aguardando sua assinatura"
                        : s.status}
                  </p>
                </div>
                <span className="font-semibold">{formatCentsBRL(s.totalCents)}</span>
              </div>
            ))}
            {!settlements.length && <p className="text-sm text-gray-500">Nenhuma liquidação ainda.</p>}
          </Card>

          <Card className="p-5 space-y-2">
            <h3 className="font-semibold">Recebíveis</h3>
            {recebiveis.map((r) => (
              <div key={r.id} className="flex justify-between text-sm border-b py-2">
                <span>{formatCentsBRL(r.amountCents)}</span>
                <span className="capitalize text-gray-600">{r.status}</span>
              </div>
            ))}
            {!recebiveis.length && <p className="text-sm text-gray-500">Nenhum recebível ainda.</p>}
          </Card>
        </div>
      )}

      <div className="space-y-3 pt-1">
        {error && <AlertBanner variant="error">{error}</AlertBanner>}
        {success && (
          <AlertBanner variant="info" title="Tudo certo">
            {success}
          </AlertBanner>
        )}
        {ativo && fiscalPendentes > 0 && (
          <AlertBanner variant="warning" title="Notas fiscais pendentes">
            Você tem {fiscalPendentes} venda(s) sem NF conferida em {formatMesReferencia(mesReferencia)}. Anexe as notas
            na aba Mais para liberar o pagamento.
          </AlertBanner>
        )}
        {pendente && (
          <AlertBanner variant="warning" title="Aguardando aprovação">
            O responsável da cooperativa precisa aprovar este mercado antes de criar cobranças.
          </AlertBanner>
        )}
        {parceiro?.status === "bloqueado" && (
          <AlertBanner variant="error" title="Mercado bloqueado">
            Novas cobranças estão suspensas. Histórico anterior permanece intacto.
          </AlertBanner>
        )}
      </div>
    </div>
  );
}
