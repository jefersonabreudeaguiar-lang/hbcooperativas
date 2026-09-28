"use client";

import { useCallback, useEffect, useState } from "react";
import {
  captureBicD1Diagnostic,
  isBicD1EligibilityAllowsCapture,
  summarizeBicD1CaptureCounts,
  type BicD1CaptureResult,
} from "@/lib/diagnostic/bicD1Capture";
import {
  captureBicD13RuntimeFinanceiro,
  type BicD13RuntimeCaptureResult,
} from "@/lib/diagnostic/bicD13RuntimeCapture";

type AuthStatus = "loading" | "authorized" | "unauthenticated" | "unauthorized" | "error";

const ELIGIBILITY_URL = "/api/diagnostic/bic-d1/eligibility";

async function fetchEligibilityStatus(): Promise<number> {
  const res = await fetch(ELIGIBILITY_URL, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  return res.status;
}

function statusFromHttp(httpStatus: number): AuthStatus {
  if (httpStatus === 200) return "authorized";
  if (httpStatus === 401) return "unauthenticated";
  if (httpStatus === 403) return "unauthorized";
  return "error";
}

export default function BicD1DiagnosticoPage() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [capture, setCapture] = useState<BicD1CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [runtimeCapture, setRuntimeCapture] = useState<BicD13RuntimeCaptureResult | null>(null);
  const [runtimeCapturing, setRuntimeCapturing] = useState(false);
  const [runtimeCaptureError, setRuntimeCaptureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const httpStatus = await fetchEligibilityStatus();
        if (!cancelled) setStatus(statusFromHttp(httpStatus));
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCapture = useCallback(async () => {
    setCaptureError(null);
    setCopyOk(false);
    setCapturing(true);
    try {
      const httpStatus = await fetchEligibilityStatus();
      const auth = statusFromHttp(httpStatus);
      setStatus(auth);
      if (!isBicD1EligibilityAllowsCapture(httpStatus)) {
        setCapture(null);
        return;
      }
      const result = await captureBicD1Diagnostic();
      setCapture(result);
    } catch (e) {
      setCaptureError(e instanceof Error ? e.message : String(e));
      setCapture(null);
    } finally {
      setCapturing(false);
    }
  }, []);

  const handleRuntimeCapture = useCallback(() => {
    setRuntimeCaptureError(null);
    setRuntimeCapturing(true);
    try {
      if (status !== "authorized") {
        setRuntimeCapture(null);
        return;
      }
      const result = captureBicD13RuntimeFinanceiro();
      setRuntimeCapture(result);
    } catch (e) {
      setRuntimeCaptureError(e instanceof Error ? e.message : String(e));
      setRuntimeCapture(null);
    } finally {
      setRuntimeCapturing(false);
    }
  }, [status]);

  const handleCopy = useCallback(async () => {
    if (!capture) return;
    setCopyOk(false);
    try {
      await navigator.clipboard.writeText(JSON.stringify(capture, null, 2));
      setCopyOk(true);
    } catch {
      setCopyOk(false);
    }
  }, [capture]);

  const summary = capture ? summarizeBicD1CaptureCounts(capture) : null;
  const canCapture = status === "authorized" && !capturing;

  const captureJson = capture ? JSON.stringify(capture, null, 2) : "";
  const runtimeCaptureJson = runtimeCapture ? JSON.stringify(runtimeCapture, null, 2) : "";
  const canRuntimeCapture = status === "authorized" && !runtimeCapturing;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-green-800">BIC-D1</p>
      <h1 className="mt-2 text-2xl font-bold">Diagnóstico temporário</h1>
      <p className="mt-1 text-sm text-gray-600">Status de autorização</p>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {status === "loading" && <p className="text-gray-600">Verificando elegibilidade…</p>}

        {status === "authorized" && (
          <>
            <p className="text-lg font-medium">BIC-D1 — Diagnóstico temporário</p>
            <p className="mt-2 text-gray-700">Acesso autorizado.</p>
            <p className="mt-4 text-sm font-semibold text-green-700">ACESSO AUTORIZADO</p>
          </>
        )}

        {status === "unauthenticated" && (
          <>
            <p className="text-gray-800">Acesso não autenticado.</p>
            <p className="mt-4 text-sm font-semibold text-amber-800">ACESSO NEGADO</p>
          </>
        )}

        {status === "unauthorized" && (
          <>
            <p className="text-gray-800">Acesso não autorizado.</p>
            <p className="mt-4 text-sm font-semibold text-amber-800">ACESSO NEGADO</p>
          </>
        )}

        {status === "error" && (
          <>
            <p className="text-gray-800">Não foi possível verificar a elegibilidade.</p>
            <p className="mt-4 text-sm font-semibold text-amber-800">ACESSO NEGADO</p>
          </>
        )}

        {status === "authorized" && (
          <div className="mt-6 border-t border-gray-100 pt-6">
            <button
              type="button"
              disabled={!canCapture}
              onClick={() => void handleCapture()}
              className="w-full rounded-lg bg-green-800 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {capturing ? "Capturando…" : "Capturar diagnóstico"}
            </button>
          </div>
        )}

        {captureError && <p className="mt-4 text-sm text-red-700">{captureError}</p>}

        {summary && (
          <div className="mt-6 border-t border-gray-100 pt-6 space-y-2">
            <p className="font-medium text-green-800">Diagnóstico capturado</p>
            <p className="text-sm text-gray-600">Timestamp: {summary.capturedAt}</p>
            <ul className="text-sm text-gray-800 list-disc pl-5">
              <li>Notas: {summary.notas}</li>
              <li>Fichas: {summary.fichas}</li>
              <li>Pagamentos: {summary.pagamentos}</li>
              <li>Arquivos mensais: {summary.arquivosMensais}</li>
            </ul>
            <p className="mt-4 text-sm text-gray-600">
              O diagnóstico é somente leitura. Nenhum dado foi alterado.
            </p>
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-800">JSON do diagnóstico</p>
              <pre className="mt-2 max-h-[min(60vh,32rem)] overflow-x-auto overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-900">
                {captureJson}
              </pre>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
            >
              Copiar JSON
            </button>
            {copyOk && <p className="text-xs text-green-700">JSON copiado para a área de transferência.</p>}
          </div>
        )}

        {status === "authorized" && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <p className="text-sm font-semibold text-green-900">BIC-D1.3 — Estado financeiro (getData)</p>
            <p className="mt-1 text-xs text-gray-600">
              Orlando · somente leitura · não persiste · não sincroniza
            </p>
            <button
              type="button"
              disabled={!canRuntimeCapture}
              onClick={handleRuntimeCapture}
              className="mt-4 w-full rounded-lg border border-green-800 bg-white px-4 py-2.5 text-sm font-medium text-green-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runtimeCapturing ? "Capturando…" : "Capturar estado financeiro atual"}
            </button>
            {runtimeCaptureError && (
              <p className="mt-3 text-sm text-red-700">{runtimeCaptureError}</p>
            )}
            {runtimeCapture && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-800">
                  Potencial recibo:{" "}
                  {runtimeCapture.registroPotencialmenteResponsavelPeloRecibo.pagamentoId ?? "nenhum"}
                </p>
                <pre className="max-h-[min(60vh,32rem)] overflow-x-auto overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-900">
                  {runtimeCaptureJson}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
