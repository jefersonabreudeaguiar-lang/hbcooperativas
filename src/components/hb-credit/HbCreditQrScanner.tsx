"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { decodeQrFromFile, decodeQrFromImageData } from "@/lib/hb-credit/decodeQrImage";
import { cn } from "@/utils/format";

interface HbCreditQrScannerProps {
  onScan: (payload: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
  /** Abre a câmera nativa do celular ao montar (mesmo fluxo das fotos de entrega). */
  autoOpenCamera?: boolean;
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
  return "Não foi possível abrir a câmera. Tente novamente ou cole o código manualmente.";
}

export function HbCreditQrScanner({
  onScan,
  onError,
  disabled,
  className,
  autoOpenCamera = false,
  fullscreen = false,
}: HbCreditQrScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const [liveActive, setLiveActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopLiveScan = useCallback(() => {
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

  useEffect(() => {
    if (!autoOpenCamera || disabled) return;
    const timer = window.setTimeout(() => openNativeCamera(), 400);
    return () => window.clearTimeout(timer);
  }, [autoOpenCamera, disabled, openNativeCamera]);

  const handlePhotoCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;

    setBusy(true);
    setError("");
    try {
      const payload = await decodeQrFromFile(file);
      if (!payload) {
        const message = "QR Code não encontrado na foto. Aproxime a câmera e tente de novo.";
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

  const startLiveScan = async () => {
    if (disabled || busy || liveActive) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const message = "A câmera ao vivo exige conexão segura (HTTPS). Use fotografar QR.";
      setError(message);
      onError?.(message);
      return;
    }

    setBusy(true);
    setError("");
    stopLiveScan();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
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
      await video.play();
      setLiveActive(true);

      const tick = () => {
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
          scanFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const payload = decodeQrFromImageData(ctx.getImageData(0, 0, width, height));
            if (payload) {
              emitScan(payload);
              return;
            }
          }
        }

        scanFrameRef.current = requestAnimationFrame(tick);
      };

      scanFrameRef.current = requestAnimationFrame(tick);
    } catch (e) {
      stopLiveScan();
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
          fullscreen ? "min-h-[55vh] border-green-700/40" : "min-h-[220px] border-gray-300"
        )}
      >
        <video
          ref={videoRef}
          className={cn("absolute inset-0 h-full w-full object-cover", liveActive ? "opacity-100" : "opacity-0")}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {!liveActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15 text-3xl ring-1 ring-green-400/30">
              📷
            </div>
            <div className="space-y-1">
              <p className={cn("font-semibold", fullscreen ? "text-white" : "text-gray-100")}>
                Fotografe o QR Code do mercado
              </p>
              <p className={cn("text-sm", fullscreen ? "text-green-100/80" : "text-gray-400")}>
                Usa a mesma câmera das fotos de entrega — estável no celular.
              </p>
            </div>
          </div>
        )}

        {liveActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-center text-sm text-white">
            Aponte para o QR Code — leitura automática
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      )}

      <div className="space-y-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={openNativeCamera}
          disabled={disabled || busy}
        >
          {busy && !liveActive ? "Lendo foto…" : "Abrir câmera e fotografar QR"}
        </Button>

        {!liveActive ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => void startLiveScan()}
            disabled={disabled || busy}
          >
            Leitura ao vivo (alternativa)
          </Button>
        ) : (
          <Button type="button" variant="secondary" className="w-full" onClick={stopLiveScan}>
            Parar leitura ao vivo
          </Button>
        )}
      </div>
    </div>
  );
}
