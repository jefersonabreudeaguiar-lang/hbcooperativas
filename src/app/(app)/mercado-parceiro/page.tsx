"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { PageHeader } from "@/components/ui/Table";
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
  postRefundRequestAction,
  saveMercadoPix,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopCompraEstornavel, ContaCoopIntent, ContaCoopParceiro, ContaCoopSettlement, ContaCoopSolicitacaoEstorno } from "@/modules/hb-credit/types";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { formatMesReferencia } from "@/utils/format";

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
  const [qrUrl, setQrUrl] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchMercadoParceiroData();
      setParceiro(data.parceiro ?? null);
      setIntents(data.intents ?? []);
      setRecebiveis(data.recebiveis ?? []);
      setSettlements(data.settlements ?? []);
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

  const criarCobranca = async () => {
    setBusy(true);
    setError("");
    setQrUrl("");
    setQrPayload("");
    try {
      const amount = Number(valorReais.replace(",", "."));
      const res = await createCreditIntent(amount, descricao.trim() || undefined);
      if (res.qrPayload) {
        setQrPayload(res.qrPayload);
        const url = await QRCode.toDataURL(res.qrPayload, { width: 260, margin: 2 });
        setQrUrl(url);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar cobrança.");
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

  const solicitarEstorno = async (compra: ContaCoopCompraEstornavel) => {
    const motivo = window.prompt(
      `Informe o motivo do estorno de ${formatCentsBRL(compra.amountCents)}.\n\nA cooperativa precisa aprovar antes do crédito voltar ao cooperado.`
    );
    if (!motivo?.trim()) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await postRefundRequestAction({
        action: "create",
        transactionId: compra.id,
        motivo: motivo.trim(),
      });
      setSuccess("Solicitação enviada à cooperativa. Aguarde aprovação.");
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
  if (loading && !parceiro) return <PageSkeleton />;

  const ativo = parceiro?.status === "ativo";
  const pendente = parceiro?.status === "pendente";

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={parceiro?.nomeMercado ?? "Mercado parceiro"}
        subtitle="Cobrança Conta Coop — QR referencia intent + nonce (sem autoridade própria)"
      />

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="info" title="OK">{success}</AlertBanner>}

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
        <Button onClick={salvarPix} disabled={busy || !pixKey.trim() || !pixHolderName.trim()}>
          Salvar PIX
        </Button>
        {parceiro?.pixKey && (
          <p className="text-sm text-green-700">PIX cadastrado: <strong>{parceiro.pixKey}</strong></p>
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
          <Button size="lg" className="w-full" onClick={() => void confirmarLiquidacao(pendenteConfirmacao.id)} disabled={busy || !assinatura}>
            Confirmar recebimento e enviar à cooperativa
          </Button>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <p className="text-sm text-gray-600">Status: <strong className="capitalize">{parceiro?.status}</strong></p>
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
        <Button onClick={criarCobranca} disabled={busy || !ativo}>
          Nova cobrança
        </Button>
        {qrUrl && (
          <div className="flex flex-col items-center gap-2 pt-4 border-t">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR cobrança" className="rounded-lg border" />
            <p className="text-xs text-gray-500 break-all text-center max-w-sm">{qrPayload}</p>
          </div>
        )}
      </Card>

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
              <Button size="sm" variant="secondary" onClick={() => void solicitarEstorno(compra)} disabled={busy || !ativo}>
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

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Histórico de liquidações</h3>
        {settlements.map((s) => (
          <div key={s.id} className="flex justify-between border-b py-2 text-sm">
            <div>
              <p className="font-medium">{formatMesReferencia(s.mesReferencia)}</p>
              <p className="text-xs text-gray-500">{s.status === "confirmado" ? "Confirmado" : s.status === "aguardando_mercado" ? "Aguardando sua assinatura" : s.status}</p>
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
  );
}
