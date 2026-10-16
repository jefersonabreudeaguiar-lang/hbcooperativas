"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  canUseCooperadoValorBrowserMobileDiag,
  installCooperadoValorBrowserMobileDiag,
  type CooperadoValorBrowserMobileDiag,
} from "@/lib/cooperado/cooperadoValorBrowserMobileDiag";
import { cn } from "@/utils/format";

/**
 * Painel flutuante só cooperado Jeferson — ver resultado do teste browser vs mobile.
 */
export function CooperadoJefersonValorDiagPanel() {
  const { user } = useAuth();
  const enabled = canUseCooperadoValorBrowserMobileDiag(user);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CooperadoValorBrowserMobileDiag | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!enabled || !clientReady) return;
    return installCooperadoValorBrowserMobileDiag(user);
  }, [enabled, clientReady, user?.id, user?.cooperadoId, user]);

  const rodar = useCallback(async () => {
    if (!enabled || typeof window === "undefined") return;
    const handle = window.__hbCoopValorDiag;
    if (!handle) return;
    setBusy(true);
    setCopied(false);
    try {
      const r = await handle.run();
      setReport(r);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  const copiar = useCallback(async () => {
    const handle = window.__hbCoopValorDiag;
    if (!handle) return;
    await handle.copyJson();
    setCopied(true);
  }, []);

  if (!clientReady || !enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void rodar()}
        disabled={busy}
        className={cn(
          "fixed z-[90] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3",
          "rounded-full bg-amber-500 px-3 py-2 text-xs font-bold text-amber-950 shadow-lg ring-2 ring-amber-200",
          "opacity-90 hover:opacity-100 active:scale-95 disabled:opacity-50"
        )}
        aria-label="Diagnóstico valores browser vs mobile"
      >
        {busy ? "…" : "Diag"}
      </button>

      {open && report && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-labelledby="jeferson-valor-diag-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="jeferson-valor-diag-title" className="text-sm font-bold text-gray-900">
                Diagnóstico valores (piloto)
              </h2>
              <p className="mt-1 text-xs text-gray-600">{report.causasProvaveis[0]}</p>
            </div>
            <div className="overflow-auto px-4 py-2 text-xs text-gray-800">
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                <dt className="text-gray-500">Build página</dt>
                <dd className="font-mono">{report.release.paginaBuild}</dd>
                <dt className="text-gray-500">Build nuvem</dt>
                <dd className="font-mono">{String(report.release.nuvem?.build ?? "—")}</dd>
                <dt className="text-gray-500">PWA</dt>
                <dd>{report.dispositivo.standalone ? "sim" : "não"}</dd>
                <dt className="text-gray-500">Paridade</dt>
                <dd className="font-mono tabular-nums">
                  {report.motorApp?.paridade.valorLiquido ?? "—"}
                </dd>
                <dt className="text-gray-500">Cache card</dt>
                <dd className="font-mono tabular-nums">
                  {report.cachesValor.inicioCards[0]?.valorCard ?? "—"}
                </dd>
                <dt className="text-gray-500">AppData KB</dt>
                <dd className="font-mono">{report.appData.kb}</dd>
              </dl>
              <textarea
                readOnly
                className="mt-3 h-40 w-full rounded-lg border border-gray-200 bg-gray-50 p-2 font-mono text-[10px]"
                value={JSON.stringify(report, null, 2)}
              />
            </div>
            <div className="flex gap-2 border-t border-gray-100 p-3">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white"
                onClick={() => void copiar()}
              >
                {copied ? "Copiado" : "Copiar JSON"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

declare global {
  interface Window {
    __hbCoopValorDiag?: import("@/lib/cooperado/cooperadoValorBrowserMobileDiag").CooperadoValorDiagHandle;
  }
}
