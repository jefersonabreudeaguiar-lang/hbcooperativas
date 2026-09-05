"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import {
  cooperadoPrecisaCadastrarAssinatura,
  cooperadoTemAssinaturaCadastrada,
  getAssinaturaCadastroDataUrl,
} from "@/services/cooperadoAssinaturaService";
import type { Cooperado } from "@/types";

interface AssinarComCadastroBlockProps {
  cooperadoId: string;
  cooperado: Cooperado | null | undefined;
  assinatura: string | null;
  onAssinaturaChange: (dataUrl: string | null) => void;
  /** Texto curto do contexto (voto, recibo…). */
  contexto?: string;
}

export function AssinarComCadastroBlock({
  cooperadoId,
  cooperado,
  assinatura,
  onAssinaturaChange,
  contexto = "este documento",
}: AssinarComCadastroBlockProps) {
  const usaCadastro = cooperadoUsaAssinaturaCadastroPilot(cooperadoId);
  const cadastroUrl = getAssinaturaCadastroDataUrl(cooperado);
  const precisaCadastro = cooperadoPrecisaCadastrarAssinatura(cooperadoId, cooperado);
  const temCadastro = cooperadoTemAssinaturaCadastrada(cooperado);

  if (!usaCadastro) {
    return (
      <>
        <p className="text-xs text-gray-500 mb-3">Assine abaixo para confirmar.</p>
        <SignaturePad onChange={onAssinaturaChange} />
      </>
    );
  }

  if (precisaCadastro) {
    return (
      <AlertBanner variant="warning" title="Cadastre sua assinatura primeiro">
        <p className="text-sm mb-3">
          Para assinar {contexto}, fotografe sua assinatura no papel em{" "}
          <Link href="/meu-cadastro" className="font-semibold underline">
            Meu cadastro
          </Link>
          .
        </p>
        <Link href="/meu-cadastro">
          <Button size="sm">Adicionar assinatura</Button>
        </Link>
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Sua assinatura cadastrada será aplicada em {contexto}.
      </p>
      {cadastroUrl && (
        <div className="rounded-xl border border-green-200 bg-white p-3 flex items-center justify-center min-h-[72px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cadastroUrl} alt="Assinatura cadastrada" className="max-h-16 max-w-full object-contain" />
        </div>
      )}
      <Button
        type="button"
        size="lg"
        className="w-full"
        variant={assinatura ? "secondary" : "primary"}
        onClick={() => onAssinaturaChange(cadastroUrl)}
        disabled={!temCadastro || !cadastroUrl}
      >
        <PenLine size={18} />
        {assinatura ? "Assinatura aplicada — toque para refazer" : "Assinar com minha assinatura"}
      </Button>
      {!assinatura && (
        <p className="text-[11px] text-center text-gray-400">
          Toque no botão acima antes de confirmar.
        </p>
      )}
    </div>
  );
}
