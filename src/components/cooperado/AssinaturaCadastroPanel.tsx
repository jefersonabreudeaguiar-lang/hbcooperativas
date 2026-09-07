"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, PenLine } from "lucide-react";
import type { Cooperado, User } from "@/types";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { AssinaturaPapelCapture } from "@/components/cooperado/AssinaturaPapelCapture";
import { AssinaturaStatusAviso } from "@/components/cooperado/AssinaturaStatusAviso";
import { updateData } from "@/services/dataStore";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  cooperadoAssinaturaDevolvida,
  cooperadoAssinaturaEmAnalise,
  cooperadoPrecisaCadastrarAssinatura,
  cooperadoTemAssinaturaCadastrada,
  getAssinaturaCadastroDataUrl,
  salvarAssinaturaCadastroCooperado,
} from "@/services/cooperadoAssinaturaService";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import { formatDateTime } from "@/utils/format";
import type { AppData } from "@/types";

interface AssinaturaCadastroPanelProps {
  data: AppData;
  user: Pick<User, "id" | "name" | "email" | "cooperativaId" | "cooperativaCnpj">;
  cooperado: Cooperado;
}

export function AssinaturaCadastroPanel({ data, user, cooperado }: AssinaturaCadastroPanelProps) {
  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [erro, setErro] = useState("");

  if (!cooperadoUsaAssinaturaCadastroPilot(cooperado.id)) return null;

  const temAssinaturaConfirmada = cooperadoTemAssinaturaCadastrada(cooperado);
  const emAnalise = cooperadoAssinaturaEmAnalise(cooperado);
  const devolvida = cooperadoAssinaturaDevolvida(cooperado);
  const precisa = cooperadoPrecisaCadastrarAssinatura(cooperado.id, cooperado);
  const previewUrl = getAssinaturaCadastroDataUrl(cooperado);
  const podeEnviar = precisa && !emAnalise;

  const salvar = async (payload: { dataUrl: string; hash: string }) => {
    setErro("");
    setOkMsg("");
    setSalvando(true);
    try {
      let cooperadoAtualizado: Cooperado | null = null;
      updateData((d) => {
        const result = salvarAssinaturaCadastroCooperado(d, cooperado.id, payload, user);
        if (!result.ok) {
          setErro(result.error);
          return d;
        }
        cooperadoAtualizado = result.cooperado;
        return result.data;
      });

      if (!cooperadoAtualizado) return;

      const cnpj = await resolveCooperativaCnpj(data, cooperado.cooperativaId, user);
      if (cnpj) {
        const push = await pushCooperadoToCloud(cnpj, cooperadoAtualizado, user.email);
        if (!push.ok) {
          setErro(push.error ?? "Assinatura salva no aparelho, mas não sincronizou na nuvem.");
          return;
        }
      }

      setOkMsg("Assinatura enviada! Já pode usar em recibos e votações. A diretoria também vai conferir e confirmar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card title="Minha assinatura" className="mb-6">
      <AssinaturaStatusAviso cooperado={cooperado} className="mb-4" />

      {precisa && !devolvida && (
        <AlertBanner variant="warning" title="Cadastre sua assinatura" className="mb-4">
          Assine uma vez no papel e fotografe. A diretoria confere antes de liberar para votações e recibos.
        </AlertBanner>
      )}

      {okMsg && (
        <AlertBanner variant="success" title="Enviado" className="mb-4">
          <CheckCircle2 size={16} className="inline mr-1" />
          {okMsg}
        </AlertBanner>
      )}

      {erro && (
        <AlertBanner variant="error" title="Não foi possível salvar" className="mb-4">
          {erro}
        </AlertBanner>
      )}

      {temAssinaturaConfirmada && previewUrl && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800 mb-2 flex items-center gap-1">
            <PenLine size={14} /> Assinatura confirmada pela diretoria
          </p>
          <div className="bg-white rounded-lg border border-green-100 p-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Sua assinatura cadastrada" className="max-h-20 max-w-full object-contain" />
          </div>
          {cooperado.assinaturaConfirmadaEm && (
            <p className="text-xs text-gray-500 mt-2">
              Confirmada em {formatDateTime(cooperado.assinaturaConfirmadaEm)}
              {cooperado.assinaturaConfirmadaPorNome ? ` · ${cooperado.assinaturaConfirmadaPorNome}` : ""}
            </p>
          )}
          <p className="text-xs text-gray-600 mt-2">
            Para trocar, peça à diretoria devolver a assinatura ou envie nova foto após devolução.
          </p>
        </div>
      )}

      {emAnalise && previewUrl && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-2 flex items-center gap-1">
            <Clock size={14} /> Aguardando análise
          </p>
          <div className="bg-white rounded-lg border border-amber-100 p-3 flex justify-center opacity-90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Assinatura enviada" className="max-h-20 max-w-full object-contain" />
          </div>
          {cooperado.assinaturaCadastradaEm && (
            <p className="text-xs text-gray-500 mt-2">
              Enviada em {formatDateTime(cooperado.assinaturaCadastradaEm)}
            </p>
          )}
        </div>
      )}

      {podeEnviar && <AssinaturaPapelCapture onConfirm={salvar} disabled={salvando} />}

      {emAnalise && (
        <p className="text-xs text-gray-500 mt-3">
          Enquanto a diretoria analisa, você não pode enviar outra foto. Assim que confirmarem, o aviso aparecerá
          no início do app.
        </p>
      )}

      {!temAssinaturaConfirmada && !emAnalise && (
        <p className="text-xs text-gray-500 mt-3">
          Depois da confirmação, use{" "}
          <Link href="/votacoes" className="font-semibold text-green-700 underline">
            Votações
          </Link>{" "}
          e o botão <strong>Assinar com minha assinatura</strong> em recibos e atas.
        </p>
      )}
    </Card>
  );
}
