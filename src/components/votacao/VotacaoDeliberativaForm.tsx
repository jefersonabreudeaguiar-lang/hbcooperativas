"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MessageCircle, MinusCircle, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import type { VotacaoOpcao, VotacaoPauta } from "@/types";
import { formatHorarioReuniao, formatReuniaoWhatsapp, labelVoto } from "@/services/votacaoService";
import { formatDate } from "@/utils/format";
import { cn } from "@/utils/format";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";

interface VotacaoDeliberativaFormProps {
  pauta: VotacaoPauta;
  onRegistrar: (voto: VotacaoOpcao, assinaturaDataUrl: string) => Promise<{ ok: boolean; error?: string }>;
  processando?: boolean;
}

export function VotacaoDeliberativaForm({ pauta, onRegistrar, processando }: VotacaoDeliberativaFormProps) {
  const [opcao, setOpcao] = useState<VotacaoOpcao | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<VotacaoOpcao | null>(null);
  const [erro, setErro] = useState("");

  const reuniao = formatReuniaoWhatsapp(pauta);
  const horario = formatHorarioReuniao(pauta);

  const enviar = async () => {
    setErro("");
    if (!opcao) {
      setErro("Escolha SIM, NÃO ou ABSTENÇÃO.");
      return;
    }
    if (!assinatura) {
      setErro("Assine no campo abaixo antes de enviar.");
      return;
    }
    const result = await onRegistrar(opcao, assinatura);
    if (result.ok) setConfirmado(opcao);
    else setErro(result.error ?? "Não foi possível registrar o voto. Tente novamente.");
  };

  if (confirmado) {
    return (
      <section className="rounded-2xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/80 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={28} />
          <div>
            <p className="font-semibold text-green-900 text-lg">Voto e assinatura registrados</p>
            <p className="text-sm text-green-800 mt-2">
              Sua resposta <strong>{labelVoto(confirmado)}</strong> foi computada na pauta da cooperativa,
              com assinatura digital manuscrita arquivada.
            </p>
            <Link href="/dashboard" className="inline-block mt-4 text-sm font-semibold text-green-800 underline">
              Voltar ao Início
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-900"
      >
        <ArrowLeft size={16} />
        Voltar ao Início
      </Link>

      <section className="rounded-2xl border-2 border-indigo-200 bg-white shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2 text-indigo-100 text-xs font-semibold uppercase tracking-wide">
            <Vote size={16} />
            Votação deliberativa
          </div>
          <p className="text-lg font-bold mt-2 leading-snug">{pauta.texto}</p>
          <p className="text-indigo-100 text-xs mt-2">
            Período: {formatDate(pauta.inicioEm)} até {formatDate(pauta.fimEm)}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {pauta.observacao?.trim() && (
            <AlertBanner variant="info" title="Observações da diretoria">
              <p className="whitespace-pre-wrap text-sm">{pauta.observacao.trim()}</p>
            </AlertBanner>
          )}

          {(reuniao || horario) && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 space-y-1">
              {reuniao && (
                <p className="flex items-start gap-2">
                  <MessageCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Reunião online via WhatsApp: <strong>{reuniao}</strong>
                  </span>
                </p>
              )}
              {horario && <p className="pl-6">Horário: {horario}</p>}
              <p className="pl-6 text-xs text-indigo-700">
                A deliberação formal é registrada neste aplicativo HB Cooperativas.
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-800 mb-3 text-center">Selecione seu voto</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { v: "sim" as const, label: "SIM", Icon: ThumbsUp, active: "border-green-500 bg-green-50 text-green-900" },
                  { v: "nao" as const, label: "NÃO", Icon: ThumbsDown, active: "border-red-500 bg-red-50 text-red-900" },
                  {
                    v: "abstencao" as const,
                    label: "ABSTENÇÃO",
                    Icon: MinusCircle,
                    active: "border-gray-500 bg-gray-50 text-gray-900",
                  },
                ] as const
              ).map(({ v, label, Icon, active }) => (
                <button
                  key={v}
                  type="button"
                  disabled={processando}
                  onClick={() => setOpcao(v)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-5 font-bold transition-all",
                    opcao === v ? active : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                    processando && "opacity-60 pointer-events-none"
                  )}
                >
                  <Icon size={28} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-800 mb-2">Assinatura do cooperado</p>
            <p className="text-xs text-gray-500 mb-3">
              Assine abaixo para confirmar seu voto. A assinatura compõe o documento de deliberação da cooperativa.
            </p>
            <SignaturePad onChange={setAssinatura} />
          </div>

          {erro && (
            <AlertBanner variant="error" title="Não foi possível enviar">
              <p>{erro}</p>
            </AlertBanner>
          )}

          <Button type="button" size="lg" className="w-full" disabled={processando} onClick={() => void enviar()}>
            Registrar voto e assinatura
          </Button>
        </div>
      </section>
    </div>
  );
}
