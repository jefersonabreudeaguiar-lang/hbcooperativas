"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  buildPwaRescueAutoLoginAbsoluteUrl,
  buildPwaRescueAutoLoginHref,
} from "@/lib/pwa/cooperadoPwaRescueUrl";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

type PwaRepararAtalhoPanelProps = {
  /** login = destaque no formulário; baixar-app = bloco na página de instalação */
  variant?: "login" | "compact";
};

export function PwaRepararAtalhoPanel({ variant = "login" }: PwaRepararAtalhoPanelProps) {
  const rescueHref = buildPwaRescueAutoLoginHref();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${rescueHref}`
        : buildPwaRescueAutoLoginAbsoluteUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  if (variant === "compact") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
        <p className="text-sm font-semibold text-amber-950 flex items-center gap-2">
          <Wrench size={16} aria-hidden />
          Ícone com tela preta ou valor zerado?
        </p>
        <p className="text-xs text-amber-900/90 leading-relaxed">
          Toque em reparar, aguarde a tela verde e faça login de novo. Depois remova o ícone antigo e
          instale outra vez pelo login.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link href={rescueHref} className="flex-1">
            <Button type="button" className="w-full font-semibold" size="sm">
              Reparar atalho do app
            </Button>
          </Link>
          <Button type="button" variant="secondary" size="sm" className="font-semibold" onClick={copyLink}>
            {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
            {copied ? "Link copiado" : "Copiar link"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left space-y-3">
      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <Wrench size={16} className="text-green-800" aria-hidden />
        Atalho na tela inicial não abre?
      </p>
      <p className="text-xs text-gray-600 leading-relaxed">
        Se aparecer tela preta, erro do Chrome ou valor financeiro errado no ícone, use reparar (build{" "}
        {APP_BUILD_VERSION}). Em seguida remova o ícone antigo e instale de novo por{" "}
        <strong>Baixar aplicativo</strong>.
      </p>
      <Link href={rescueHref} className="block">
        <Button type="button" variant="secondary" className="w-full font-semibold border-green-700 text-green-800">
          Reparar atalho do app
        </Button>
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1 text-green-800 font-medium hover:text-green-950 underline"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Link copiado — envie no WhatsApp" : "Copiar link para cooperado"}
        </button>
        <Link href="/pwa-diag.html" className="text-gray-500 underline hover:text-gray-700">
          Diagnóstico do atalho
        </Link>
      </div>
    </div>
  );
}
