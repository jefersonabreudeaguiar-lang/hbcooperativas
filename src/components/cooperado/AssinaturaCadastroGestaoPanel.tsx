"use client";

import { useState } from "react";
import { CheckCircle2, PenLine, RotateCcw } from "lucide-react";
import type { AppData, Cooperado, User } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Textarea, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData } from "@/services/dataStore";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  confirmarAssinaturaCadastroCooperado,
  devolverAssinaturaCadastroCooperado,
  getAssinaturaCadastroDataUrl,
  getAssinaturaCadastroStatus,
  resumoAssinaturaCadastroApp,
} from "@/services/cooperadoAssinaturaService";
import { formatDateTime } from "@/utils/format";

interface AssinaturaCadastroGestaoPanelProps {
  data: AppData;
  user: Pick<User, "id" | "name" | "email" | "cooperativaId" | "cooperativaCnpj">;
  cooperativaId: string;
}

export function AssinaturaCadastroGestaoPanel({ data, user, cooperativaId }: AssinaturaCadastroGestaoPanelProps) {
  const resumo = resumoAssinaturaCadastroApp(data, cooperativaId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [motivoDevolucao, setMotivoDevolucao] = useState<Record<string, string>>({});

  const syncCooperado = async (cooperado: Cooperado) => {
    const cnpj = await resolveCooperativaCnpj(data, cooperado.cooperativaId, user);
    if (!cnpj) return { ok: false as const, error: "CNPJ da cooperativa não encontrado." };
    return pushCooperadoToCloud(cnpj, cooperado, user.email);
  };

  const confirmar = async (cooperadoId: string) => {
    setErro("");
    setBusyId(cooperadoId);
    try {
      let atualizado: Cooperado | null = null;
      updateData((d) => {
        const result = confirmarAssinaturaCadastroCooperado(d, cooperadoId, user);
        if (!result.ok) {
          setErro(result.error);
          return d;
        }
        atualizado = result.cooperado;
        return result.data;
      });
      if (!atualizado) return;
      const push = await syncCooperado(atualizado);
      if (!push.ok) setErro(push.error ?? "Confirmado localmente, mas falhou na nuvem.");
    } finally {
      setBusyId(null);
    }
  };

  const devolver = async (cooperadoId: string) => {
    setErro("");
    setBusyId(cooperadoId);
    try {
      let atualizado: Cooperado | null = null;
      const motivo = motivoDevolucao[cooperadoId];
      updateData((d) => {
        const result = devolverAssinaturaCadastroCooperado(d, cooperadoId, user, motivo);
        if (!result.ok) {
          setErro(result.error);
          return d;
        }
        atualizado = result.cooperado;
        return result.data;
      });
      if (!atualizado) return;
      const push = await syncCooperado(atualizado);
      if (!push.ok) setErro(push.error ?? "Devolvido localmente, mas falhou na nuvem.");
      else {
        setMotivoDevolucao((prev) => {
          const next = { ...prev };
          delete next[cooperadoId];
          return next;
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  if (resumo.comApp === 0) return null;

  return (
    <Card title="Conferir assinaturas dos cooperados" className="mb-6">
      <p className="text-sm text-gray-600 mb-4">
        Analise a foto da assinatura enviada pelo app. Confirme se está legível e conforme, ou devolva para o
        cooperado reenviar.
      </p>

      {erro && (
        <AlertBanner variant="error" title="Não foi possível concluir" className="mb-4">
          {erro}
        </AlertBanner>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-800">Em análise</p>
          <p className="text-xl font-bold text-amber-900">{resumo.emAnalise}</p>
        </div>
        <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2">
          <p className="text-xs text-green-800">Confirmadas</p>
          <p className="text-xl font-bold text-green-900">{resumo.comAssinatura}</p>
        </div>
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2">
          <p className="text-xs text-orange-800">Devolvidas</p>
          <p className="text-xl font-bold text-orange-900">{resumo.devolvida}</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
          <p className="text-xs text-gray-600">Falta enviar</p>
          <p className="text-xl font-bold text-gray-900">{resumo.semAssinatura}</p>
        </div>
      </div>

      {resumo.emAnalise === 0 ? (
        <AlertBanner variant="success" title="Nenhuma assinatura aguardando análise">
          Quando um cooperado enviar a foto em Meu cadastro, ela aparecerá aqui para conferência.
        </AlertBanner>
      ) : (
        <div className="space-y-4">
          {resumo.listaEmAnalise.map((c) => {
            const preview = getAssinaturaCadastroDataUrl(c);
            const busy = busyId === c.id;
            return (
              <div key={c.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{c.nomeCompleto}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Enviada em {c.assinaturaCadastradaEm ? formatDateTime(c.assinaturaCadastradaEm) : "—"}
                      {c.assinaturaCadastroVersao ? ` · v${c.assinaturaCadastroVersao}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={getAssinaturaCadastroStatus(c)} />
                </div>

                {preview && (
                  <div className="bg-white rounded-lg border border-amber-100 p-4 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt={`Assinatura de ${c.nomeCompleto}`}
                      className="max-h-28 max-w-full object-contain"
                    />
                  </div>
                )}

                <FormField label="Motivo da devolução (opcional)" hint="O cooperado verá esta mensagem no app">
                  <Textarea
                    rows={2}
                    value={motivoDevolucao[c.id] ?? ""}
                    onChange={(e) =>
                      setMotivoDevolucao((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    placeholder="Ex.: foto escura, assinatura cortada, nome ilegível…"
                    disabled={busy}
                  />
                </FormField>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void confirmar(c.id)} disabled={busy}>
                    <CheckCircle2 size={16} />
                    Confirmar assinatura
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void devolver(c.id)}
                    disabled={busy}
                  >
                    <RotateCcw size={16} />
                    Devolver para reenvio
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resumo.comAssinatura > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
            <PenLine size={14} /> Já confirmadas ({resumo.comAssinatura})
          </p>
          <ul className="text-sm text-gray-600 space-y-1 max-h-32 overflow-y-auto">
            {resumo.listaComAssinatura.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-800">{c.nomeCompleto}</span>
                {c.assinaturaConfirmadaEm && (
                  <span className="text-xs text-gray-400">
                    {formatDateTime(c.assinaturaConfirmadaEm)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
