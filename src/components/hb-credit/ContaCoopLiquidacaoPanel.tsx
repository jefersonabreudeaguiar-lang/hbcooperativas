"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopLiquidacaoPreview, ContaCoopParceiro } from "@/modules/hb-credit/types";
import { fetchLiquidacaoPreview, registrarPagamentoMercado } from "@/services/creditApiService";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

interface ContaCoopLiquidacaoPanelProps {
  cnpj: string;
  cooperativaNome: string;
  parceiros: ContaCoopParceiro[];
  cooperadoNome: (id: string) => string;
}

export function ContaCoopLiquidacaoPanel({
  cnpj,
  cooperativaNome,
  parceiros,
  cooperadoNome,
}: ContaCoopLiquidacaoPanelProps) {
  const [partnerId, setPartnerId] = useState("");
  const [mesReferencia, setMesReferencia] = useState(getCurrentMesReferencia());
  const [preview, setPreview] = useState<ContaCoopLiquidacaoPreview | null>(null);
  const [comprovanteMemo, setComprovanteMemo] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const parceirosAtivos = useMemo(
    () => parceiros.filter((p) => p.status === "ativo"),
    [parceiros]
  );

  const carregarPreview = useCallback(async () => {
    if (!cnpj || !partnerId || !mesReferencia) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchLiquidacaoPreview(cnpj, partnerId, mesReferencia);
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar resumo.");
    } finally {
      setBusy(false);
    }
  }, [cnpj, mesReferencia, partnerId]);

  useEffect(() => {
    if (partnerId) void carregarPreview();
  }, [carregarPreview, partnerId]);

  const registrarPagamento = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await registrarPagamentoMercado({
        cnpj,
        partnerId: preview.partnerId,
        mesReferencia: preview.mesReferencia,
        cooperativaNome,
        comprovanteMemo: comprovanteMemo.trim() || undefined,
      });
      setSuccess("Pagamento registrado. O mercado precisa assinar o relatório no app dele.");
      setComprovanteMemo("");
      await carregarPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 !p-5">
        <div>
          <h3 className="font-semibold text-gray-900">Liquidar mercado parceiro</h3>
          <p className="mt-1 text-sm text-gray-600">
            Confira a ficha corrida de compras Conta Coop por cooperado, pague via PIX e aguarde a assinatura do mercado.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Mercado</Label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">Selecione</option>
              {parceirosAtivos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeMercado}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Mês de referência</Label>
            <Input className="mt-1" value={mesReferencia} onChange={(e) => setMesReferencia(e.target.value)} placeholder="2026-08" />
          </div>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={() => void carregarPreview()} disabled={busy || !partnerId}>
              Atualizar resumo
            </Button>
          </div>
        </div>
      </Card>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="info" title="Registrado">{success}</AlertBanner>}

      {preview && (
        <>
          <Card className="space-y-3 !p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">{formatMesReferencia(preview.mesReferencia)}</p>
                <h4 className="text-xl font-bold text-gray-900">{preview.partnerNome}</h4>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Total a pagar</p>
                <p className="text-3xl font-bold text-green-800">{formatCentsBRL(preview.totalCents)}</p>
                <p className="text-xs text-gray-500">{preview.transacoesCount} recebível(is) em aberto</p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-sm">
              <p>
                <span className="text-gray-500">PIX:</span>{" "}
                <strong>{preview.pixKey ?? "Mercado ainda não cadastrou PIX"}</strong>
              </p>
              {preview.pixHolderName && <p className="text-gray-600">Titular: {preview.pixHolderName}</p>}
            </div>
            <div>
              <Label>Observação do comprovante PIX (opcional)</Label>
              <Input value={comprovanteMemo} onChange={(e) => setComprovanteMemo(e.target.value)} placeholder="Ex.: PIX enviado dia 28/08" />
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => void registrarPagamento()}
              disabled={busy || preview.totalCents <= 0 || !preview.pixKey}
            >
              Registrar pagamento e enviar relatório ao mercado
            </Button>
          </Card>

          {preview.cooperados.map((coop) => (
            <Card key={coop.cooperadoId} className="overflow-hidden !p-0">
              <div className="border-b border-gray-100 px-5 py-4">
                <h4 className="font-semibold text-gray-900">{cooperadoNome(coop.cooperadoId)}</h4>
                <p className="text-sm text-gray-500">
                  Compras {formatCentsBRL(coop.totalComprasCents)} · Estornos {formatCentsBRL(coop.totalEstornosCents)} · Saldo{" "}
                  <strong>{formatCentsBRL(coop.saldoCents)}</strong>
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {coop.transacoes.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium">{tx.tipo === "REFUND" ? "Estorno" : "Compra"}</p>
                      <p className="text-xs text-gray-500">{new Date(tx.createdAt).toLocaleString("pt-BR")}</p>
                      {tx.descricao && <p className="text-xs text-gray-400">{tx.descricao}</p>}
                      {tx.receiptCode && <p className="text-xs text-gray-400">Comprovante {tx.receiptCode}</p>}
                    </div>
                    <p className={`font-semibold ${tx.tipo === "REFUND" ? "text-green-700" : "text-red-600"}`}>
                      {tx.tipo === "REFUND" ? "+" : "-"}
                      {formatCentsBRL(tx.amountCents)}
                    </p>
                  </div>
                ))}
                {!coop.transacoes.length && (
                  <p className="px-5 py-6 text-center text-sm text-gray-500">Nenhuma transação neste mês.</p>
                )}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
