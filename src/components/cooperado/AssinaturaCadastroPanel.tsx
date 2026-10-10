"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, PenLine } from "lucide-react";
import type { Cooperado, User } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { AssinaturaPapelCapture } from "@/components/cooperado/AssinaturaPapelCapture";
import { AssinaturaStatusAviso } from "@/components/cooperado/AssinaturaStatusAviso";
import { updateData } from "@/services/dataStore";
import { pushCooperadoToCloud, queueCooperadoPush } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  cooperadoAssinaturaDevolvida,
  cooperadoAssinaturaEmAnalise,
  cooperadoPodeReenviarAssinaturaCadastro,
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
  const [modoAtualizar, setModoAtualizar] = useState(false);

  if (!cooperadoUsaAssinaturaCadastroPilot(cooperado.id)) return null;

  const temAssinaturaConfirmada = cooperadoTemAssinaturaCadastrada(cooperado);
  const emAnalise = cooperadoAssinaturaEmAnalise(cooperado);
  const devolvida = cooperadoAssinaturaDevolvida(cooperado);
  const precisa = cooperadoPrecisaCadastrarAssinatura(cooperado.id, cooperado);
  const podeReenviar = cooperadoPodeReenviarAssinaturaCadastro(cooperado.id, cooperado);
  const previewUrl = getAssinaturaCadastroDataUrl(cooperado);
  const podeEnviar = precisa && !emAnalise;
  const mostrarCaptura = podeEnviar || (modoAtualizar && podeReenviar);

  useEffect(() => {
    if (!cooperadoAssinaturaEmAnalise(cooperado) || !getAssinaturaCadastroDataUrl(cooperado)) return;
    void (async () => {
      const cnpj = await resolveCooperativaCnpj(data, cooperado.cooperativaId, user);
      if (!cnpj) return;
      const push = await pushCooperadoToCloud(cnpj, cooperado, user.email);
      if (!push.ok) queueCooperadoPush(cnpj, cooperado, user.email);
    })();
  }, [
    cooperado.id,
    cooperado.assinaturaCadastradaEm,
    cooperado.assinaturaCadastroVersao,
    cooperado.assinaturaCadastroStatus,
    data,
    user,
  ]);

  const salvar = async (payload: { dataUrl: string; hash: string }) => {
    const reenvioAtualizacao =
      modoAtualizar || cooperadoTemAssinaturaCadastrada(cooperado) || cooperadoAssinaturaDevolvida(cooperado);
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
          queueCooperadoPush(cnpj, cooperadoAtualizado, user.email);
          setErro(
            push.error ??
              "Assinatura salva no aparelho. A sincronização com a nuvem falhou — tentaremos de novo automaticamente."
          );
          return;
        }
      }

      setOkMsg(
        reenvioAtualizacao
          ? "Nova foto enviada! A diretoria vai conferir antes de substituir a assinatura anterior nos documentos."
          : "Assinatura enviada! Já pode usar em recibos e votações. A diretoria também vai conferir e confirmar."
      );
      setModoAtualizar(false);
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
          {podeReenviar && !modoAtualizar && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                setOkMsg("");
                setErro("");
                setModoAtualizar(true);
              }}
            >
              Atualizar assinatura
            </Button>
          )}
          {podeReenviar && (
            <p className="text-xs text-gray-600 mt-2">
              Envie uma nova foto no papel quando quiser; a diretoria confere antes de trocar a assinatura nos
              documentos.
            </p>
          )}
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

      {modoAtualizar && podeReenviar && !podeEnviar && (
        <AlertBanner variant="info" title="Nova foto da assinatura" className="mb-4">
          A assinatura atual continua valendo até a diretoria confirmar a nova imagem.
        </AlertBanner>
      )}

      {mostrarCaptura && (
        <>
          {modoAtualizar && podeReenviar && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-2"
              disabled={salvando}
              onClick={() => setModoAtualizar(false)}
            >
              Cancelar atualização
            </Button>
          )}
          <AssinaturaPapelCapture onConfirm={salvar} disabled={salvando} />
        </>
      )}

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
