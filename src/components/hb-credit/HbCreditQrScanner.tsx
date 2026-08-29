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

function humanizeCameraError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return "Permita o acesso à câmera nas configurações do navegador.";
  }
  if (lower.includes("notfound") || lower.includes("devices")) {
    return "Nenhuma câmera encontrada neste aparelho.";
  }
  if (lower.includes("secure") || lower.includes("https")) {
    return "A câmera só funciona com conexão segura (HTTPS).";
  }
  return "Não foi possível abrir a câmera. Use a opção de colar o código.";
}

async function waitForPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function HbCreditQrScanner({ onScan, onError, disabled, className }: HbCreditQrScannerProps) {
  const reactId = useId();
  const readerId = `hb-qr-${reactId.replace(/:/g, "")}`;
  const mountRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5ScannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const releaseStream = useCallback(() => {
    if (scanLoopRef.current != null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (mountRef.current) {
      mountRef.current.replaceChildren();
    }
  }, []);

  const stopHtml5Scanner = useCallback(async () => {
    const scanner = html5ScannerRef.current;
    html5ScannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      /* ignore */
    }
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const cleanupScanner = useCallback(async () => {
    cancelledRef.current = true;
    releaseStream();
    await stopHtml5Scanner();
    mountRef.current?.replaceChildren();
  }, [releaseStream, stopHtml5Scanner]);

  const stopScanner = useCallback(async () => {
    await cleanupScanner();
    setActive(false);
    setStarting(false);
  }, [cleanupScanner]);

  const startNativeScanner = useCallback(async (): Promise<boolean> => {
    const mount = mountRef.current;
    if (!mount || typeof window === "undefined") return false;

    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
    } }).BarcodeDetector;

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const video = document.createElement("video");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      video.setAttribute("playsinline", "true");
      video.className = "h-full w-full object-cover";
      mount.replaceChildren(video);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      cancelledRef.current = false;

      const tick = async () => {
        if (cancelledRef.current) return;
        try {
          const codes = await detector.detect(video);
          const payload = codes.find((code) => code.rawValue?.trim())?.rawValue?.trim();
          if (payload) {
            await stopScanner();
            onScanRef.current(payload);
            return;
          }
        } catch {
          /* ignore frame errors */
        }
        scanLoopRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };

      scanLoopRef.current = requestAnimationFrame(() => {
        void tick();
      });
      return true;
    } catch {
      releaseStream();
      return false;
    }
  }, [releaseStream, stopScanner]);

  const startHtml5Scanner = useCallback(async (): Promise<boolean> => {
    const mount = mountRef.current;
    if (!mount) return false;

    mount.replaceChildren();
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(readerId, { verbose: false });
    html5ScannerRef.current = scanner;
    cancelledRef.current = false;

    let cameraId: string | { facingMode: string } = { facingMode: "environment" };
    try {
      const cameras = await Html5Qrcode.getCameras();
      const backCamera = cameras.find((camera) => /back|rear|traseira|environment/i.test(camera.label));
      if (backCamera?.id) {
        cameraId = backCamera.id;
      } else if (cameras.length > 0) {
        cameraId = cameras[cameras.length - 1].id;
      }
    } catch {
      /* use facingMode fallback */
    }

    await scanner.start(
      cameraId,
      {
        fps: 8,
        qrbox: { width: 240, height: 240 },
        disableFlip: false,
      },
      (decodedText) => {
        if (cancelledRef.current) return;
        cancelledRef.current = true;
        void stopScanner().then(() => onScanRef.current(decodedText.trim()));
      },
      () => {
        /* ignore per-frame decode misses */
      }
    );

    return true;
  }, [readerId, stopScanner]);

  const startScanner = useCallback(async () => {
    if (disabled || starting || active) return;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      const message = humanizeCameraError(new Error("secure context required"));
      setCameraError(message);
      onError?.(message);
      return;
    }

    setStarting(true);
    setCameraError("");
    cancelledRef.current = false;

    try {
      await cleanupScanner();
      await waitForPaint();

      let started = false;
      try {
        started = await startNativeScanner();
      } catch {
        started = false;
      }

      if (!started) {
        await waitForPaint();
        started = await startHtml5Scanner();
      }

      if (!started) {
        throw new Error("Scanner unavailable");
      }

      setActive(true);
    } catch (e) {
      await stopScanner();
      const message = humanizeCameraError(e);
      setCameraError(message);
      onError?.(message);
    } finally {
      setStarting(false);
    }
  }, [active, cleanupScanner, disabled, onError, startHtml5Scanner, startNativeScanner, starting, stopScanner]);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed bg-gray-950 min-h-[280px]">
        <div
          id={readerId}
          ref={mountRef}
          className={cn("absolute inset-0", active || starting ? "opacity-100" : "opacity-0")}
          aria-hidden={!active && !starting}
        />

        {!active && !starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-2xl">📷</div>
            <p className="text-sm text-gray-300">Aponte a câmera para o QR Code do mercado</p>
          </div>
        )}

        {starting && !active && (
          <div className="absolute inset-x-0 bottom-4 text-center text-xs font-medium text-green-200">
            Preparando câmera…
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
