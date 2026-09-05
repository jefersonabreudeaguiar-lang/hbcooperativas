"use client";

import Link from "next/link";
import { CheckCircle2, PenLine, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface OnboardingChecklistProps {
  pixOk: boolean;
  assinaturaOk?: boolean;
  mostrarAssinatura?: boolean;
}

export function OnboardingChecklist({ pixOk, assinaturaOk = true, mostrarAssinatura = false }: OnboardingChecklistProps) {
  if (pixOk && (!mostrarAssinatura || assinaturaOk)) return null;

  return (
    <div className="space-y-3">
      {!pixOk && (
        <div className="bg-white border border-green-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Wallet size={20} className="text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900">Cadastre sua chave PIX</h2>
              <p className="text-sm text-gray-500 mt-1">
                Informe onde quer receber para a cooperativa poder pagar você.
              </p>
              <Link href="/meu-cadastro">
                <Button size="sm" className="mt-3">Cadastrar PIX</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {mostrarAssinatura && !assinaturaOk && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <PenLine size={20} className="text-indigo-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900">Cadastre sua assinatura</h2>
              <p className="text-sm text-gray-500 mt-1">
                Assine no papel e fotografe uma vez. Use em votações, atas e recibos.
              </p>
              <Link href="/meu-cadastro">
                <Button size="sm" className="mt-3">Adicionar assinatura</Button>
              </Link>
            </div>
          </div>
          {pixOk && (
            <p className="text-xs text-green-700 mt-3 flex items-center gap-1">
              <CheckCircle2 size={14} /> PIX já cadastrado
            </p>
          )}
        </div>
      )}
    </div>
  );
}
