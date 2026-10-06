"use client";

import { useEffect } from "react";
import { hbFichaBaseOperacionalActiveLabels } from "@/lib/hb-credit/hbFichaBaseOperacional";

/** Diagnóstico: `data-hb-ficha-base` no <html> (fichaBase | legacy | off). */
export function HbFichaBaseOperacionalMarker() {
  useEffect(() => {
    const labels = hbFichaBaseOperacionalActiveLabels();
    if (labels.length === 0 || labels.includes("off")) {
      document.documentElement.removeAttribute("data-hb-ficha-base");
      return;
    }
    document.documentElement.setAttribute("data-hb-ficha-base", labels.join(","));
  }, []);
  return null;
}
