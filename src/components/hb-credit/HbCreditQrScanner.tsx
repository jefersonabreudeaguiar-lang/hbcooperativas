"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/format";

interface HbCreditQrScannerProps {
  onScan: (payload: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

export function HbCreditQrScanner({ onScan, onError, disabled, className }: HbCreditQrScannerProps) {
  const reactId = useId();
  const readerId = `hb-qr-${reactId.replace(/:/g, "")}`;
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const [active, setActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        /* ignore stop errors */
      }
    }
    setActive(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (disabled || starting) return;
    setStarting(true);
    setCameraError("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(readerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.72;
            return { width: edge, height: edge };
          },
          aspectRatio: 1,
        },
        (decodedText) => {
          void stopScanner();
          onScan(decodedText.trim());
        },
        () => {
          /* ignore per-frame decode misses */
        }
      );
      setActive(true);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.includes("NotAllowed")
            ? "Permita o acesso à câmera nas configurações do navegador."
            : e.message.includes("NotFound")
              ? "Nenhuma câmera encontrada neste aparelho."
              : "Não foi possível abrir a câmera. Use a opção de colar o código."
          : "Não foi possível abrir a câmera.";
      setCameraError(message);
      onError?.(message);
      await stopScanner();
    } finally {
      setStarting(false);
    }
  }, [disabled, onError, onScan, readerId, starting, stopScanner]);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className={cn("space-y-3", className)}>
      <div
        id={readerId}
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-dashed bg-gray-950",
          active ? "border-green-500 min-h-[280px]" : "border-gray-300 min-h-[200px]"
        )}
      >
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-2xl">📷</div>
            <p className="text-sm text-gray-600">Aponte a câmera para o QR Code do mercado</p>
          </div>
        )}
      </div>

      {cameraError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{cameraError}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            size="lg"
            className="flex-1 min-w-[140px]"
            onClick={() => void startScanner()}
            disabled={disabled || starting}
          >
            {starting ? "Abrindo câmera…" : "Escanear QR Code"}
          </Button>
        ) : (
          <Button type="button" variant="secondary" className="flex-1" onClick={() => void stopScanner()}>
            Parar câmera
          </Button>
        )}
      </div>
    </div>
  );
}
