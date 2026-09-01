"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileText, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { ContaCoopFiscalNote } from "@/modules/hb-credit/types";
import { fetchMercadoFiscalVendas, uploadMercadoFiscalNotePhoto } from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
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

export function ContaCoopFiscalNotesMercadoPanel() {
  const [mesReferencia, setMesReferencia] = useState(getCurrentMesReferencia());
  const [vendas, setVendas] = useState<ContaCoopFiscalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

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

  const abrirCamera = (transactionId: string) => {
    uploadTargetRef.current = transactionId;
    fileRef.current?.click();
  };

  const onFileSelected = async (file: File | undefined) => {
    const transactionId = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !transactionId) return;

    setBusyId(transactionId);
    setError("");
    setSuccess("");
    try {
      await uploadMercadoFiscalNotePhoto(transactionId, file);
      setSuccess("Nota fiscal enviada. A cooperativa vai conferir antes do pagamento.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar NF.");
    } finally {
      setBusyId(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
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
            Anexe a NF de cada cooperado até o fechamento do mês. Valor da NF = valor da venda.
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
            const podeAnexar =
              v.status === "pendente_anexo" || v.status === "correcao_pedida";
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
                  <p className="text-xs text-gray-500 mt-1 break-all">ID cooperado: {v.cooperadoId}</p>
                  {v.rejectReason && (
                    <p className="text-xs text-red-700 mt-1">Correção: {v.rejectReason}</p>
                  )}
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full w-fit", statusClass(v.status))}>
                    {statusLabel(v.status)}
                  </span>
                  {podeAnexar && (
                    <Button
                      size="sm"
                      onClick={() => abrirCamera(v.transactionId)}
                      disabled={busyId === v.transactionId}
                    >
                      <Camera size={16} className="mr-1.5" />
                      {v.status === "correcao_pedida" ? "Reenviar NF" : "Anexar NF"}
                    </Button>
                  )}
                  {v.status === "aguardando_conferencia" && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Upload size={12} /> Enviada — aguardando cooperativa
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
            {pendentes} venda(s) sem NF ou com correção pedida. Lance para a cooperativa liberar pagamento.
          </AlertBanner>
        )}
        {error && <AlertBanner variant="error">{error}</AlertBanner>}
        {success && <AlertBanner variant="info" title="Enviado">{success}</AlertBanner>}
      </div>
    </Card>
  );
}
