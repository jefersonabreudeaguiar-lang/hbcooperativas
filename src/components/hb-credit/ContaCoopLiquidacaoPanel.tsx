"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Modal } from "@/components/ui/Table";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopLiquidacaoPreview, ContaCoopParceiro } from "@/modules/hb-credit/types";
import { fetchLiquidacaoPreview, registrarPagamentoMercado } from "@/services/creditApiService";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import Link from "next/link";
import { Paperclip, QrCode } from "lucide-react";

interface ContaCoopLiquidacaoPanelProps {
  cnpj: string;
  cooperativaNome: string;
  parceiros: ContaCoopParceiro[];
  cooperadoNome: (id: string) => string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
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
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [comprovanteModalOpen, setComprovanteModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  const parceirosAtivos = useMemo(
    () => parceiros.filter((p) => p.status === "ativo"),
    [parceiros]
  );

  const valorReais = preview ? preview.totalCents / 100 : 0;

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

  const abrirComprovante = () => {
    setPixModalOpen(false);
    setComprovanteModalOpen(true);
  };

  const selecionarComprovante = async (file: File | null) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError("Arquivo muito grande (máx. 12 MB).");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setComprovantePreview(dataUrl);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler comprovante.");
    }
  };

  const registrarPagamento = async () => {
    if (!preview || !comprovantePreview) {
      setError("Anexe o comprovante PIX antes de registrar.");
      return;
    }
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
        comprovanteDataUrl: comprovantePreview,
      });
      setSuccess("Pagamento registrado com comprovante. O mercado receberá aviso para conferir e confirmar.");
      setComprovanteMemo("");
      setComprovantePreview(null);
      setComprovanteModalOpen(false);
      if (comprovanteInputRef.current) comprovanteInputRef.current.value = "";
      await carregarPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setBusy(false);
    }
  };

  const pagamentoPronto =
    Boolean(preview?.pagamentoAprovado) &&
    preview != null &&
    preview.totalCents > 0 &&
    Boolean(preview.pixKey);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 !p-5">
        <div>
          <h3 className="font-semibold text-gray-900">Liquidar mercado parceiro</h3>
          <p className="mt-1 text-sm text-gray-600">
            Confira as NFs, pague via PIX (QR Code), anexe o comprovante e envie ao mercado para confirmação.
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
          {preview.fiscalResumo && (
            <Card className="space-y-3 !p-5">
              <h4 className="font-semibold text-gray-900">Conferência fiscal × pagamento</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-gray-500 text-xs">Vendas no app</p>
                  <p className="font-bold">{formatCentsBRL(preview.fiscalResumo.totalVendasCents)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-gray-500 text-xs">NFs conferidas</p>
                  <p className="font-bold text-green-800">
                    {formatCentsBRL(preview.fiscalResumo.totalConferidasCents)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-gray-500 text-xs">A pagar (elegível)</p>
                  <p className="font-bold text-green-900">{formatCentsBRL(preview.totalCents)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-gray-500 text-xs">Pendências NF</p>
                  <p className="font-bold text-amber-800">
                    {preview.fiscalResumo.pendentesAnexo +
                      preview.fiscalResumo.aguardandoConferencia +
                      preview.fiscalResumo.correcaoPedida}
                  </p>
                </div>
              </div>

              {preview.pagamentoAprovado ? (
                <AlertBanner variant="info" title="Pagamento aprovado">
                  Todas as NFs conferidas. Use o QR Code PIX abaixo, anexe o comprovante e registre o pagamento.
                </AlertBanner>
              ) : (
                <AlertBanner variant="warning" title="Pagamento bloqueado">
                  {preview.bloqueioPagamento ?? "Finalize a conferência fiscal antes de pagar."}{" "}
                  <Link href="/conta-coop?tab=conferir_nf" className="font-semibold underline">
                    Ir para Conferir NFs
                  </Link>
                </AlertBanner>
              )}
            </Card>
          )}

          <Card className="space-y-3 !p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">{formatMesReferencia(preview.mesReferencia)}</p>
                <h4 className="text-xl font-bold text-gray-900">{preview.partnerNome}</h4>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Total a pagar</p>
                <p className="text-3xl font-bold text-green-800">{formatCentsBRL(preview.totalCents)}</p>
                <p className="text-xs text-gray-500">{preview.transacoesCount} recebível(is) elegível(is)</p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-sm">
              <p>
                <span className="text-gray-500">PIX:</span>{" "}
                <strong>{preview.pixKey ?? "Mercado ainda não cadastrou PIX"}</strong>
              </p>
              {preview.pixHolderName && <p className="text-gray-600">Titular: {preview.pixHolderName}</p>}
            </div>

            <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/50 p-4">
              <p className="text-sm font-medium text-green-900">Como pagar e confirmar</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-green-900">
                <li>Toque em <strong>Pagar com PIX (QR Code)</strong> e faça o pagamento no banco.</li>
                <li>Depois anexe o comprovante e registre — o mercado recebe aviso para conferir.</li>
              </ol>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => setPixModalOpen(true)}
              disabled={busy || !pagamentoPronto}
            >
              <QrCode size={18} className="mr-2 inline" />
              Pagar com PIX (QR Code)
            </Button>

            {comprovantePreview && (
              <AlertBanner variant="info" title="Comprovante pronto">
                Comprovante anexado. Toque em &quot;Registrar pagamento&quot; para enviar ao mercado.
              </AlertBanner>
            )}

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setComprovanteModalOpen(true)}
              disabled={busy || !pagamentoPronto}
            >
              <Paperclip size={16} className="mr-2 inline" />
              {comprovantePreview ? "Trocar comprovante PIX" : "Anexar comprovante PIX"}
            </Button>

            <Button
              className="w-full"
              size="lg"
              onClick={() => void registrarPagamento()}
              disabled={busy || !pagamentoPronto || !comprovantePreview}
            >
              Registrar pagamento e enviar ao mercado
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

      {preview?.pixKey && (
        <PixQrModal
          open={pixModalOpen}
          onClose={() => setPixModalOpen(false)}
          chavePix={preview.pixKey}
          nome={preview.pixHolderName ?? preview.partnerNome}
          valor={valorReais}
          hintAposPagamento="Depois de pagar, anexe o comprovante do banco para enviar ao mercado."
          confirmLabel="Já paguei — anexar comprovante"
          onEnviarComprovante={abrirComprovante}
        />
      )}

      <Modal
        open={comprovanteModalOpen}
        onClose={() => {
          if (!busy) setComprovanteModalOpen(false);
        }}
        title="Anexar comprovante PIX"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Anexe o print ou PDF do comprovante do PIX enviado ao mercado. O mercado poderá visualizar antes de confirmar.
          </p>
          <div>
            <Label>Observação (opcional)</Label>
            <Input
              className="mt-1"
              value={comprovanteMemo}
              onChange={(e) => setComprovanteMemo(e.target.value)}
              placeholder="Ex.: PIX enviado dia 28/08"
            />
          </div>
          <input
            ref={comprovanteInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => void selecionarComprovante(e.target.files?.[0] ?? null)}
          />
          {comprovantePreview ? (
            <div className="space-y-3">
              {comprovantePreview.startsWith("data:image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={comprovantePreview} alt="Comprovante" className="w-full max-h-64 object-contain rounded-xl border" />
              ) : (
                <p className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">PDF anexado — pronto para envio.</p>
              )}
              <Button variant="secondary" size="sm" onClick={() => comprovanteInputRef.current?.click()}>
                Trocar arquivo
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-green-300 bg-green-50/50 p-8"
              onClick={() => comprovanteInputRef.current?.click()}
            >
              <Paperclip size={28} className="text-green-700" />
              <span className="text-sm font-medium text-green-800">Toque para anexar comprovante</span>
            </button>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setComprovanteModalOpen(false)}>
              Fechar
            </Button>
            <Button
              className="flex-1"
              disabled={!comprovantePreview || busy}
              onClick={() => void registrarPagamento()}
            >
              {busy ? "Enviando..." : "Registrar pagamento"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
