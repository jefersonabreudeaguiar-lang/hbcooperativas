"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { decodeQrFromFile, decodeQrFromVideoFrame } from "@/lib/hb-credit/decodeQrImage";
import { cn } from "@/utils/format";

interface HbCreditQrScannerProps {
  onScan: (payload: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
  /** Inicia leitura contínua ao abrir (como app de banco). */
  autoStartLiveScan?: boolean;
  fullscreen?: boolean;
}

function humanizeCameraError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return "Permita o acesso à câmera nas configurações do navegador.";
  }
  if (lower.includes("notfound") || lower.includes("devices")) {
    return "Nenhuma câmera encontrada neste aparelho.";
  }
  return "Não foi possível abrir a câmera. Tente fotografar o QR ou cole o código.";
}

export function HbCreditQrScanner({
  onScan,
  onError,
  disabled,
  className,
  autoStartLiveScan = true,
  fullscreen = false,
}: HbCreditQrScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const lastScanAttemptRef = useRef(0);
  const onScanRef = useRef(onScan);
  const [liveActive, setLiveActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopLiveScan = useCallback(() => {
    scanningRef.current = false;
    if (scanFrameRef.current != null) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLiveActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveScan();
    };
  }, [stopLiveScan]);

  const emitScan = useCallback(
    (payload: string) => {
      stopLiveScan();
      onScanRef.current(payload);
    },
    [stopLiveScan]
  );

  const openNativeCamera = useCallback(() => {
    if (disabled || busy) return;
    setError("");
    fileInputRef.current?.click();
  }, [busy, disabled]);

  const startLiveScan = useCallback(async () => {
    if (disabled || busy || liveActive || scanningRef.current) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const message = "A câmera exige HTTPS. Use fotografar QR ou abra o app instalado.";
      setError(message);
      onError?.(message);
      return;
    }

    setBusy(true);
    setError("");
    stopLiveScan();
    scanningRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");

      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      await video.play();
      setLiveActive(true);

      const tick = async () => {
        if (!scanningRef.current) return;

        const now = performance.now();
        if (now - lastScanAttemptRef.current >= 120) {
          lastScanAttemptRef.current = now;
          try {
            const payload = await decodeQrFromVideoFrame(video);
            if (payload) {
              emitScan(payload);
              return;
            }
          } catch {
            /* próximo frame */
          }
        }

        scanFrameRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };

      scanFrameRef.current = requestAnimationFrame(() => {
        void tick();
      });
    } catch (e) {
      stopLiveScan();
      const message = humanizeCameraError(e);
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, emitScan, liveActive, onError, stopLiveScan]);

  useEffect(() => {
    if (!autoStartLiveScan || disabled) return;
    const timer = window.setTimeout(() => {
      void startLiveScan();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoStartLiveScan, disabled, startLiveScan]);

  const handlePhotoCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;

    setBusy(true);
    setError("");
    try {
      const payload = await decodeQrFromFile(file);
      if (!payload) {
        const message = "QR Code não encontrado. Centralize o código na foto e tente de novo.";
        setError(message);
        onError?.(message);
        return;
      }
      emitScan(payload);
    } catch (e) {
      const message = humanizeCameraError(e);
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handlePhotoCapture(event)}
        disabled={disabled || busy}
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border bg-gray-950",
          fullscreen ? "min-h-[58vh] border-green-700/40" : "min-h-[280px] border-gray-300"
        )}
      >
        <video
          ref={videoRef}
          className={cn("absolute inset-0 h-full w-full object-cover", liveActive ? "opacity-100" : "opacity-30")}
          playsInline
          muted
          autoPlay
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "relative h-56 w-56 rounded-2xl border-2 border-green-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]",
              liveActive && "animate-pulse"
            )}
          >
            <span className="absolute -top-1 -left-1 h-8 w-8 border-l-4 border-t-4 border-green-400 rounded-tl-lg" />
            <span className="absolute -top-1 -right-1 h-8 w-8 border-r-4 border-t-4 border-green-400 rounded-tr-lg" />
            <span className="absolute -bottom-1 -left-1 h-8 w-8 border-l-4 border-b-4 border-green-400 rounded-bl-lg" />
            <span className="absolute -bottom-1 -right-1 h-8 w-8 border-r-4 border-b-4 border-green-400 rounded-br-lg" />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 text-center">
          <p className="text-sm font-medium text-white">
            {liveActive ? "Aponte para o QR — leitura automática" : busy ? "Abrindo câmera…" : "Centralize o QR na moldura"}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      )}

      <div className="space-y-2">
        {!liveActive ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void startLiveScan()}
            disabled={disabled || busy}
          >
            {busy ? "Abrindo câmera…" : "Ler QR Code automaticamente"}
          </Button>
        ) : (
          <Button type="button" variant="secondary" className="w-full" onClick={stopLiveScan}>
            Parar leitura
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={openNativeCamera}
          disabled={disabled || busy}
        >
          {busy && !liveActive ? "Lendo foto…" : "Tirar foto do QR (alternativa)"}
        </Button>
      </div>
    </div>
  );
}
