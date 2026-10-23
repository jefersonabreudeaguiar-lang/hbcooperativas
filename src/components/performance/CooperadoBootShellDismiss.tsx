"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

function painelJaTemConteudo(): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector("[data-cooperado-tab-panel-active='1']")) return true;
  if (document.querySelector("header") && document.querySelector("main")) return true;
  const shellMode = document.documentElement.getAttribute("data-hb-shell-mode");
  return Boolean(shellMode && shellMode !== "loading");
}

function rotaPublica(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p === "/login" ||
    p === "/cadastro" ||
    p === "/esqueci-senha" ||
    p.startsWith("/register") ||
    p === "/forgot-password"
  );
}

/** Some o splash só quando o painel já pintou — nunca deixa tela branca na entrada. */
export function CooperadoBootShellDismiss() {
  const pathname = usePathname() ?? "";

  useLayoutEffect(() => {
    if (rotaPublica(pathname)) {
      dismissCooperadoBootShell();
      return;
    }
    if (painelJaTemConteudo()) {
      dismissCooperadoBootShell();
      return;
    }
    const t1 = window.setTimeout(() => {
      if (painelJaTemConteudo()) dismissCooperadoBootShell();
    }, 800);
    const t2 = window.setTimeout(() => {
      if (painelJaTemConteudo()) dismissCooperadoBootShell();
    }, 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  return null;
}
