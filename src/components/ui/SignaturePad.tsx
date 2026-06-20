"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  className?: string;
}

export function SignaturePad({ onChange, className = "" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [vazio, setVazio] = useState(true);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
    }
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setVazio(false);
    onChange(canvas.toDataURL("image/png"));
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emit();
  };

  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVazio(true);
    onChange(null);
  };

  return (
    <div className={className}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-44 bg-white border-2 border-dashed border-green-400 rounded-xl touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {vazio && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-green-600/70 text-lg font-semibold tracking-wide">Assine aqui</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2 text-center">Use o dedo ou caneta para assinar na área acima</p>
      <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" onClick={limpar}>
        Limpar assinatura
      </Button>
    </div>
  );
}
