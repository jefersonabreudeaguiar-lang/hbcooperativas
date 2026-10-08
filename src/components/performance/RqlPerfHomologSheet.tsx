"use client";

import { useCallback, useState } from "react";
import { X, Copy, Gauge, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  buildRqlWhatsappCompareClipboardText,
  isRqlPerfDebugEnabled,
  printRqlWhatsappCompareToConsole,
  RQL_PERF_DEBUG_STORAGE_KEY,
} from "@/lib/performance/rqlPerfReport";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function RqlPerfHomologSheet({ open, onClose }: Props) {
  const [reportText, setReportText] = useState("");
  const [status, setStatus] = useState<string>("");
  const debugOn = isRqlPerfDebugEnabled();

  const ativarMedicao = useCallback(() => {
    try {
      localStorage.setItem(RQL_PERF_DEBUG_STORAGE_KEY, "1");
      sessionStorage.setItem(RQL_PERF_DEBUG_STORAGE_KEY, "1");
    } catch {
      setStatus("Não foi possível gravar no aparelho (modo privado?).");
      return;
    }
    window.location.reload();
  }, []);

  const gerarRelatorio = useCallback(() => {
    setStatus("");
    try {
      const text = buildRqlWhatsappCompareClipboardText();
      setReportText(text);
      printRqlWhatsappCompareToConsole();
      setStatus("Relatório gerado. Toque em Copiar para enviar.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao gerar relatório.");
    }
  }, []);

  const copiar = useCallback(async () => {
    const text = reportText || buildRqlWhatsappCompareClipboardText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus("Copiado! Cole no WhatsApp ou e-mail.");
        return;
      }
    } catch {
      /* fallback */
    }
    setReportText(text);
    setStatus("Selecione o texto abaixo e copie manualmente.");
  }, [reportText]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md max-h-[min(90dvh,640px)] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-gray-200 safe-area-pb"
        role="dialog"
        aria-labelledby="rql-homolog-title"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <Gauge size={20} className="text-green-700 shrink-0" />
            <h2 id="rql-homolog-title" className="font-semibold text-gray-900 text-sm truncate">
              Medição UX (homolog) · v{APP_BUILD_VERSION}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Fechar painel"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 overflow-y-auto text-sm text-gray-700">
          <p className="text-xs text-gray-500 leading-relaxed">
            1) Ative a medição (recarrega uma vez). 2) Use o app: troque abas ou feche e reabra. 3) Gere o
            relatório e copie — sem console do navegador.
          </p>

          <p className="text-xs font-medium">
            Medição:{" "}
            <span className={debugOn ? "text-green-700" : "text-amber-700"}>
              {debugOn ? "ligada" : "desligada"}
            </span>
          </p>

          {!debugOn && (
            <Button type="button" className="w-full" onClick={ativarMedicao}>
              <RefreshCw size={16} /> Ativar medição e recarregar
            </Button>
          )}

          <Button type="button" variant="secondary" className="w-full" onClick={gerarRelatorio}>
            Gerar comparativo WhatsApp
          </Button>

          <Button type="button" variant="secondary" className="w-full" onClick={() => void copiar()}>
            <Copy size={16} /> Copiar relatório
          </Button>

          {status && <p className="text-xs text-green-800 bg-green-50 rounded-lg px-3 py-2">{status}</p>}

          {reportText && (
            <textarea
              readOnly
              value={reportText}
              className="w-full h-40 text-[11px] font-mono border border-gray-200 rounded-lg p-2 resize-none"
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
