"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import type { AppData, Cooperado, NotaPedido } from "@/types";
import { Select, FormField } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { NotaFotoImg } from "@/components/ui/NotaFotoImg";
import { listarEntregasCorrecaoCooperado } from "@/services/notaPedidoService";
import { getFotoExibicaoNota, contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { cn, formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";

export type AcaoCorrecaoEntrega = "apagar" | "relancar";

interface CorrecoesEntregasPanelProps {
  data: AppData;
  coopId: string;
  cooperados: Cooperado[];
  getEscolaLabel: (nota: NotaPedido) => string;
  onApagar: (nota: NotaPedido) => Promise<void>;
  onRelancar: (nota: NotaPedido) => Promise<void>;
  disabled?: boolean;
}

export function CorrecoesEntregasPanel({
  data,
  coopId,
  cooperados,
  getEscolaLabel,
  onApagar,
  onRelancar,
  disabled,
}: CorrecoesEntregasPanelProps) {
  const [cooperadoId, setCooperadoId] = useState("");
  const [acao, setAcao] = useState<AcaoCorrecaoEntrega>("relancar");
  const [notaSelecionadaId, setNotaSelecionadaId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processando, setProcessando] = useState(false);

  const entregas = useMemo(() => {
    if (!cooperadoId) return [];
    return listarEntregasCorrecaoCooperado(data, cooperadoId, coopId, acao);
  }, [data, cooperadoId, coopId, acao]);

  const notaSelecionada = entregas.find((n) => n.id === notaSelecionadaId) ?? null;

  const handleAcaoChange = (next: AcaoCorrecaoEntrega) => {
    setAcao(next);
    setNotaSelecionadaId("");
  };

  const handleCooperadoChange = (id: string) => {
    setCooperadoId(id);
    setNotaSelecionadaId("");
  };

  const executarAcao = async () => {
    if (!notaSelecionada) return;
    setProcessando(true);
    try {
      if (acao === "apagar") {
        await onApagar(notaSelecionada);
      } else {
        await onRelancar(notaSelecionada);
      }
      setConfirmOpen(false);
      setNotaSelecionadaId("");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-4">
      <AlertBanner variant="info" title="Correções de entregas">
        Use esta aba para <strong>apagar</strong> uma entrega por completo ou{" "}
        <strong>re-lançar</strong> uma entrega conferida ou devolvida para correção — ela volta
        para a fila de conferência com as mesmas fotos. Entregas <strong>pagas</strong> ou em
        pagamento não aparecem aqui.
      </AlertBanner>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Cooperado" required>
            <Select value={cooperadoId} onChange={(e) => handleCooperadoChange(e.target.value)}>
              <option value="">Selecione o cooperado…</option>
              {cooperados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="O que fazer?" required>
            <Select
              value={acao}
              onChange={(e) => handleAcaoChange(e.target.value as AcaoCorrecaoEntrega)}
            >
              <option value="relancar">Re-lançar (voltar para conferir entregas)</option>
              <option value="apagar">Apagar entrega</option>
            </Select>
          </FormField>
        </div>

        {cooperadoId && entregas.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
            {acao === "relancar"
              ? "Nenhuma entrega conferida ou devolvida para correção neste cooperado."
              : "Nenhuma entrega que possa ser apagada para este cooperado."}
          </div>
        )}

        {entregas.length > 0 && (
          <>
            <p className="text-sm font-medium text-gray-800">
              Escolha a entrega ({entregas.length}{" "}
              {entregas.length === 1 ? "disponível" : "disponíveis"})
            </p>
            <ul className="space-y-2 max-h-[min(50vh,420px)] overflow-y-auto">
              {entregas.map((n) => {
                const selected = n.id === notaSelecionadaId;
                const foto = getFotoExibicaoNota(n);
                const qtdFotos = contarFotosEnviadasNota(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setNotaSelecionadaId(n.id)}
                      className={cn(
                        "w-full text-left rounded-xl border p-3 flex gap-3 transition-colors",
                        selected
                          ? "border-green-600 bg-green-50 ring-2 ring-green-200"
                          : "border-gray-200 bg-white hover:border-green-300"
                      )}
                    >
                      {foto ? (
                        <div className="w-20 h-24 rounded-lg border border-gray-200 bg-gray-50 shrink-0 flex items-center justify-center overflow-hidden p-1">
                          <NotaFotoImg
                            src={foto}
                            alt=""
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-gray-900 truncate">
                            {getEscolaLabel(n)}
                          </span>
                          <NotaStatusBadge status={n.status} />
                        </span>
                        <span className="block text-xs text-gray-500 mt-1">
                          {formatDate(n.dataEntrega)} · {n.numeroNota} · {formatMesReferencia(n.mesReferencia)}
                          {qtdFotos > 1 ? ` · ${qtdFotos} fotos` : ""}
                        </span>
                        {n.valorLiquido > 0 && (
                          <span className="block text-sm font-semibold text-green-700 mt-1">
                            {formatCurrency(n.valorLiquido)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
              disabled={!notaSelecionada || disabled || processando}
              variant={acao === "apagar" ? "danger" : "primary"}
              onClick={() => setConfirmOpen(true)}
            >
              {acao === "apagar" ? (
                <>
                  <Trash2 size={18} /> Apagar entrega selecionada
                </>
              ) : (
                <>
                  <RefreshCw size={18} /> Re-lançar para conferência
                </>
              )}
            </Button>
          </>
        )}
      </Card>

      {acao === "apagar" && (
        <p className="text-xs text-gray-500 flex items-start gap-1.5">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
          Apagar remove a entrega do app do cooperado e do responsável. Não afeta entregas pagas.
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !processando && setConfirmOpen(false)}
        title={acao === "apagar" ? "Apagar entrega?" : "Re-lançar entrega?"}
        message={
          notaSelecionada
            ? acao === "apagar"
              ? `A entrega ${notaSelecionada.numeroNota} (${getEscolaLabel(notaSelecionada)}) será removida por completo — some para o cooperado e para você.`
              : `A entrega ${notaSelecionada.numeroNota} sai da ficha, volta para «Conferir entregas» com as mesmas fotos e quantidades zeradas para lançar de novo.`
            : ""
        }
        confirmLabel={acao === "apagar" ? "Sim, apagar" : "Sim, re-lançar"}
        variant={acao === "apagar" ? "danger" : "primary"}
        loading={processando}
        onConfirm={() => void executarAcao()}
      />
    </div>
  );
}
