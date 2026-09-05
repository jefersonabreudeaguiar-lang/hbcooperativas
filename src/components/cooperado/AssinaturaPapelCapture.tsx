"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { processarFotoAssinaturaPapel } from "@/utils/assinaturaPapelProcess";

interface AssinaturaPapelCaptureProps {
  onConfirm: (payload: { dataUrl: string; hash: string }) => void | Promise<void>;
  disabled?: boolean;
}

export function AssinaturaPapelCapture({ onConfirm, disabled }: AssinaturaPapelCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processando, setProcessando] = useState(false);
  const [preview, setPreview] = useState<{ dataUrl: string; hash: string } | null>(null);
  const [erro, setErro] = useState("");

  const abrirCamera = () => {
    setErro("");
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    setProcessando(true);
    setErro("");
    try {
      const result = await processarFotoAssinaturaPapel(file);
      setPreview(result);
    } catch (e) {
      setPreview(null);
      setErro(e instanceof Error ? e.message : "Não foi possível processar a foto.");
    } finally {
      setProcessando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirmar = async () => {
    if (!preview) return;
    setProcessando(true);
    try {
      await onConfirm(preview);
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {!preview ? (
        <>
          <div className="relative rounded-2xl border-2 border-dashed border-green-400 bg-gray-900 overflow-hidden aspect-[4/3]">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 px-4 text-center pointer-events-none">
              <Camera size={40} className="mb-3 opacity-80" />
              <p className="text-sm font-medium">Assine em folha em branco com caneta escura</p>
              <p className="text-xs mt-1 text-white/60">Posicione a assinatura acima da linha</p>
            </div>
            <div
              className="absolute left-4 right-4 border-t-2 border-dashed border-amber-400"
              style={{ top: "68%" }}
            />
            <p
              className="absolute left-0 right-0 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-300 pointer-events-none"
              style={{ top: "calc(68% + 6px)" }}
            >
              Linha guia — assine acima
            </p>
          </div>

          <ol className="text-xs text-gray-600 list-decimal list-inside space-y-1">
            <li>Assine uma vez em papel branco (caneta azul ou preta)</li>
            <li>Alinhe a folha: sua assinatura fica acima da linha amarela</li>
            <li>Tire a foto — o app registra só a assinatura</li>
          </ol>

          <Button type="button" className="w-full" size="lg" onClick={abrirCamera} disabled={disabled || processando}>
            {processando ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Processando…
              </>
            ) : (
              <>
                <Camera size={18} /> Abrir câmera e fotografar
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-800">Confira sua assinatura cadastrada:</p>
          <div className="rounded-xl border border-green-200 bg-white p-4 flex items-center justify-center min-h-[100px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.dataUrl}
              alt="Prévia da assinatura"
              className="max-h-24 max-w-full object-contain"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setPreview(null)} disabled={processando}>
              <RotateCcw size={16} /> Tirar outra foto
            </Button>
            <Button type="button" className="flex-1" onClick={() => void confirmar()} disabled={processando}>
              {processando ? "Salvando…" : "Confirmar assinatura"}
            </Button>
          </div>
        </>
      )}

      {erro && (
        <AlertBanner variant="error" title="Foto não aceita">
          <p>{erro}</p>
        </AlertBanner>
      )}
    </div>
  );
}
