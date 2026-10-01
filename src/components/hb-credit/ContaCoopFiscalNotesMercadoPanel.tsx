"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Modal } from "@/components/ui/Table";
import type { ContaCoopFiscalNote } from "@/modules/hb-credit/types";
import {
  fetchMercadoCooperadoDocFiscal,
  fetchMercadoFiscalVendas,
  uploadMercadoFiscalNotePhoto,
  type MercadoCooperadoDocFiscal,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatCPFCNPJ, formatMesReferencia, formatPhone, getCurrentMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";

function statusLabel(status: ContaCoopFiscalNote["status"]): string {
  switch (status) {
    case "pendente_anexo":
      return "Anexe a NF";
    case "aguardando_conferencia":
      return "Aguardando conferência";
    case "conferida":
      return "Conferida";
    case "correcao_pedida":
      return "Correção pedida";
    default:
      return status;
  }
}

function statusClass(status: ContaCoopFiscalNote["status"]): string {
  switch (status) {
    case "pendente_anexo":
      return "bg-amber-100 text-amber-900";
    case "aguardando_conferencia":
      return "bg-blue-100 text-blue-900";
    case "conferida":
      return "bg-green-100 text-green-900";
    case "correcao_pedida":
      return "bg-red-100 text-red-900";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function docLinha(label: string, valor: string) {
  const v = valor.trim();
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={cn("mt-0.5 text-sm", v ? "text-gray-900" : "text-amber-700 font-medium")}>
        {v || "Não informado no cadastro"}
      </p>
    </div>
  );
}

export function ContaCoopFiscalNotesMercadoPanel() {
  const [mesReferencia, setMesReferencia] = useState(getCurrentMesReferencia());
  const [vendas, setVendas] = useState<ContaCoopFiscalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const [docOpen, setDocOpen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState("");
  const [docAviso, setDocAviso] = useState("");
  const [docCooperadoNome, setDocCooperadoNome] = useState("");
  const [doc, setDoc] = useState<MercadoCooperadoDocFiscal | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchMercadoFiscalVendas(mesReferencia);
      setVendas(list);
    } catch (e) {
      setVendas([]);
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas.");
    } finally {
      setLoading(false);
    }
  }, [mesReferencia]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendentes = vendas.filter(
    (v) => v.status === "pendente_anexo" || v.status === "correcao_pedida"
  ).length;

  const abrirAnexoPdf = (transactionId: string) => {
    uploadTargetRef.current = transactionId;
    fileRef.current?.click();
  };

  const onFileSelected = async (file: File | undefined) => {
    const transactionId = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !transactionId) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("A nota fiscal deve ser um arquivo PDF.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setBusyId(transactionId);
    setError("");
    setSuccess("");
    try {
      await uploadMercadoFiscalNotePhoto(transactionId, file);
      setSuccess("Nota fiscal (PDF) enviada. A cooperativa vai conferir antes do pagamento.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar NF.");
    } finally {
      setBusyId(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const abrirDocCooperado = async (v: ContaCoopFiscalNote) => {
    setDocOpen(true);
    setDocLoading(true);
    setDocError("");
    setDocAviso("");
    setDoc(null);
    setDocCooperadoNome(v.cooperadoNome ?? "Cooperado");
    try {
      const { doc: d, aviso } = await fetchMercadoCooperadoDocFiscal(v.transactionId);
      setDoc(d);
      if (d.nomeCompleto) setDocCooperadoNome(d.nomeCompleto);
      if (aviso) setDocAviso(aviso);
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "Erro ao carregar cadastro.");
    } finally {
      setDocLoading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void onFileSelected(e.target.files?.[0])}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText size={18} className="text-green-700" />
            Vendas — notas fiscais
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Anexe a NF em PDF de cada cooperado até o fechamento do mês. Valor da NF = valor da venda.
          </p>
        </div>
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-500 mb-1">Mês</span>
          <input
            type="month"
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando vendas…</p>
      ) : vendas.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma venda confirmada em {formatMesReferencia(mesReferencia)}.</p>
      ) : (
        <ul className="space-y-3">
          {vendas.map((v) => {
            const podeAnexar = v.status === "pendente_anexo" || v.status === "correcao_pedida";
            return (
              <li
                key={v.id}
                className="rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">
                    {v.cooperadoNome ?? "Cooperado"} · {formatCentsBRL(v.saleAmountCents)}
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {new Date(v.createdAt).toLocaleString("pt-BR")}
                    {v.receiptCode ? ` · Recibo ${v.receiptCode}` : ""}
                  </p>
                  {v.rejectReason && (
                    <p className="text-xs text-red-700 mt-1">Correção: {v.rejectReason}</p>
                  )}
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full w-fit", statusClass(v.status))}>
                    {statusLabel(v.status)}
                  </span>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void abrirDocCooperado(v)}
                      disabled={busyId === v.transactionId}
                    >
                      <UserRound size={16} className="mr-1.5" />
                      Doc.
                    </Button>
                    {podeAnexar && (
                      <Button
                        size="sm"
                        onClick={() => abrirAnexoPdf(v.transactionId)}
                        disabled={busyId === v.transactionId}
                      >
                        <Upload size={16} className="mr-1.5" />
                        {v.status === "correcao_pedida" ? "Reenviar PDF" : "Anexar PDF"}
                      </Button>
                    )}
                  </div>
                  {v.status === "aguardando_conferencia" && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Upload size={12} /> PDF enviado — aguardando cooperativa
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3">
        {pendentes > 0 && (
          <AlertBanner variant="warning" title="Notas pendentes">
            {pendentes} venda(s) sem NF em PDF ou com correção pedida. Lance para a cooperativa liberar pagamento.
          </AlertBanner>
        )}
        {error && <AlertBanner variant="error">{error}</AlertBanner>}
        {success && <AlertBanner variant="info" title="Enviado">{success}</AlertBanner>}
      </div>

      <Modal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title={`Documentos — ${docCooperadoNome}`}
      >
        <p className="text-sm text-gray-600 mb-4">
          Dados do cadastro do cooperado na cooperativa (para emitir a nota fiscal).
        </p>
        {docLoading ? (
          <p className="text-sm text-gray-500 py-6 text-center">Carregando cadastro…</p>
        ) : docError ? (
          <AlertBanner variant="error">{docError}</AlertBanner>
        ) : doc ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
            {docAviso && (
              <AlertBanner variant="warning" className="mb-3">
                {docAviso}
              </AlertBanner>
            )}
            {docLinha("Nome", doc.nomeCompleto)}
            {docLinha("CPF", doc.cpf ? formatCPFCNPJ(doc.cpf) : "")}
            {docLinha("Celular", doc.celular ? formatPhone(doc.celular) : doc.celular)}
            {docLinha("Endereço", doc.endereco)}
            {docLinha("RG", doc.rg)}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setDocOpen(false)}>
            Fechar
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
