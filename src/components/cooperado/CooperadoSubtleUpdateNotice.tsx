"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { COOPERADO_SUBTLE_UPDATE_EVENT } from "@/lib/cooperadoSubtleUpdate";
import { cn } from "@/utils/format";

const VISIBLE_MS = 3_800;

/**
 * Toast fixo e leve — não desmonta layout nem bloqueia interação.
 */
export function CooperadoSubtleUpdateNotice() {
  const [open, setOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onUpdate = () => {
      setOpen(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setOpen(false), VISIBLE_MS);
    };
    window.addEventListener(COOPERADO_SUBTLE_UPDATE_EVENT, onUpdate);
    return () => {
      window.removeEventListener(COOPERADO_SUBTLE_UPDATE_EVENT, onUpdate);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-4 transition-opacity duration-300",
        "top-[max(3.25rem,env(safe-area-inset-top,0px)+2.75rem)] lg:top-4",
        open ? "opacity-100" : "opacity-0"
      )}
      aria-hidden={!open}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex max-w-sm items-center gap-2.5 rounded-2xl border border-green-200/90 bg-white/95 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md",
          "transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "-translate-y-1"
        )}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700"
          aria-hidden
        >
          <Check size={17} strokeWidth={2.5} />
        </span>
        <p className="text-sm leading-snug">
          <span className="font-semibold text-green-900">Nova atualização</span>
          <span className="text-gray-600"> — seus valores foram atualizados.</span>
        </p>
      </div>
    </div>
  );
}
