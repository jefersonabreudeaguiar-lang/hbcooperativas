"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Crop,
  Loader2,
  RotateCcw,
  RotateCw,
  Scissors,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  cropAssinaturaDataUrl,
  finalizeAssinaturaEdit,
  rotateAssinaturaDataUrl,
  trimAssinaturaInk,
  type AssinaturaCropRect,
} from "@/utils/assinaturaImageEdit";

interface AssinaturaImageEditorProps {
  sourceDataUrl: string;
  onApply: (payload: { dataUrl: string; hash: string }) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const DEFAULT_CROP: AssinaturaCropRect = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };

export function AssinaturaImageEditor({
  sourceDataUrl,
  onApply,
  onCancel,
  disabled,
}: AssinaturaImageEditorProps) {
  const [workingDataUrl, setWorkingDataUrl] = useState(sourceDataUrl);
  const [previewDataUrl, setPreviewDataUrl] = useState(sourceDataUrl);
  const [cropRect, setCropRect] = useState<AssinaturaCropRect>(DEFAULT_CROP);
  const [cropMode, setCropMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setWorkingDataUrl(sourceDataUrl);
    setPreviewDataUrl(sourceDataUrl);
    setCropRect(DEFAULT_CROP);
    setCropMode(false);
    setErro("");
  }, [sourceDataUrl]);

  const runEdit = useCallback(async (fn: (url: string) => Promise<string>) => {
    setBusy(true);
    setErro("");
    try {
      const next = await fn(workingDataUrl);
      setWorkingDataUrl(next);
      setPreviewDataUrl(next);
      setCropRect(DEFAULT_CROP);
      setCropMode(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível editar a imagem.");
    } finally {
      setBusy(false);
    }
  }, [workingDataUrl]);

  const aplicarRecorteManual = async () => {
    setBusy(true);
    setErro("");
    try {
      const next = await cropAssinaturaDataUrl(workingDataUrl, cropRect);
      setWorkingDataUrl(next);
      setPreviewDataUrl(next);
      setCropRect(DEFAULT_CROP);
      setCropMode(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível recortar a imagem.");
    } finally {
      setBusy(false);
    }
  };

  const atualizarMargem = (side: keyof AssinaturaCropRect, value: number) => {
    setCropRect((prev) => {
      const next = { ...prev };
      if (side === "x") {
        next.x = value;
        next.width = Math.max(0.05, Math.min(1 - value, prev.x + prev.width - value));
      } else if (side === "y") {
        next.y = value;
        next.height = Math.max(0.05, Math.min(1 - value, prev.y + prev.height - value));
      } else if (side === "width") {
        next.width = Math.max(0.05, Math.min(1 - prev.x, value));
      } else {
        next.height = Math.max(0.05, Math.min(1 - prev.y, value));
      }
      return next;
    });
  };

  const resetar = () => {
    setWorkingDataUrl(sourceDataUrl);
    setPreviewDataUrl(sourceDataUrl);
    setCropRect(DEFAULT_CROP);
    setCropMode(false);
    setErro("");
  };

  const aplicar = async () => {
    setBusy(true);
    setErro("");
    try {
      const payload = await finalizeAssinaturaEdit(workingDataUrl);
      onApply(payload);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a edição.");
    } finally {
      setBusy(false);
    }
  };

  const margemEsquerda = Math.round(cropRect.x * 100);
  const margemTopo = Math.round(cropRect.y * 100);
  const margemDireita = Math.round((1 - cropRect.x - cropRect.width) * 100);
  const margemBaixo = Math.round((1 - cropRect.y - cropRect.height) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex justify-center min-h-[140px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewDataUrl}
          alt="Prévia da assinatura em edição"
          className="max-h-52 max-w-full object-contain"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => void runEdit((url) => rotateAssinaturaDataUrl(url, -90))}
        >
          <RotateCcw size={14} />
          Girar esquerda
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => void runEdit((url) => rotateAssinaturaDataUrl(url, 90))}
        >
          <RotateCw size={14} />
          Girar direita
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => void runEdit(trimAssinaturaInk)}
        >
          <Scissors size={14} />
          Recortar automático
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cropMode ? "primary" : "secondary"}
          disabled={disabled || busy}
          onClick={() => setCropMode((v) => !v)}
        >
          <Crop size={14} />
          {cropMode ? "Ajustando recorte" : "Recortar manual"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={resetar}>
          <Undo2 size={14} />
          Redefinir
        </Button>
      </div>

      {cropMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800">Ajuste as margens do recorte (%)</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Esquerda</span>
              <input
                type="range"
                min={0}
                max={45}
                value={margemEsquerda}
                disabled={disabled || busy}
                onChange={(e) => atualizarMargem("x", Number(e.target.value) / 100)}
                className="w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Direita</span>
              <input
                type="range"
                min={0}
                max={45}
                value={margemDireita}
                disabled={disabled || busy}
                onChange={(e) => {
                  const right = Number(e.target.value) / 100;
                  setCropRect((prev) => ({
                    ...prev,
                    width: Math.max(0.05, 1 - prev.x - right),
                  }));
                }}
                className="w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Topo</span>
              <input
                type="range"
                min={0}
                max={45}
                value={margemTopo}
                disabled={disabled || busy}
                onChange={(e) => atualizarMargem("y", Number(e.target.value) / 100)}
                className="w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Base</span>
              <input
                type="range"
                min={0}
                max={45}
                value={margemBaixo}
                disabled={disabled || busy}
                onChange={(e) => {
                  const bottom = Number(e.target.value) / 100;
                  setCropRect((prev) => ({
                    ...prev,
                    height: Math.max(0.05, 1 - prev.y - bottom),
                  }));
                }}
                className="w-full"
              />
            </label>
          </div>
          <Button type="button" size="sm" disabled={disabled || busy} onClick={() => void aplicarRecorteManual()}>
            <Check size={14} />
            Aplicar recorte
          </Button>
        </div>
      )}

      {erro && (
        <AlertBanner variant="error" title="Edição não concluída">
          {erro}
        </AlertBanner>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={disabled || busy}>
          Cancelar edição
        </Button>
        <Button type="button" className="flex-1" onClick={() => void aplicar()} disabled={disabled || busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Check size={16} />
              Aplicar alterações
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
