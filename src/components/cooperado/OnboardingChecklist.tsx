"use client";

import Link from "next/link";
import { CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface OnboardingChecklistProps {
  pixOk: boolean;
}

export function OnboardingChecklist({ pixOk }: OnboardingChecklistProps) {
  if (pixOk) return null;

  return (
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
  );
}
