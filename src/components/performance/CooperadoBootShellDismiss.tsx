"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

function painelJaTemConteudo(): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector("[data-cooperado-tab-panel-active='1']")) return true;
  const header = document.querySelector("header");
  const main = document.querySelector("main");
  if (header && main) return true;
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

/** Some o splash só com painel montado — evita tela branca entre splash e Início. */
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
    let ticks = 0;
    const iv = window.setInterval(() => {
      ticks += 1;
      if (painelJaTemConteudo()) {
        window.clearInterval(iv);
        dismissCooperadoBootShell();
        return;
      }
      if (ticks >= 24) {
        window.clearInterval(iv);
        dismissCooperadoBootShell();
      }
    }, 200);
    return () => window.clearInterval(iv);
  }, [pathname]);

  return null;
}
