"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Pencil, PenLine, RotateCcw, RotateCw } from "lucide-react";
import type { AppData, Cooperado, User } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Textarea, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, getData } from "@/services/dataStore";
import { pushCooperadoToCloud, queueCooperadoPush, syncCooperadosFromCloud, encontrarCooperadoLocalEquivalente } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  confirmarAssinaturaCadastroCooperado,
  devolverAssinaturaCadastroCooperado,
  getAssinaturaCadastroDataUrl,
  getAssinaturaCadastroStatus,
  mergeAssinaturaCadastroFields,
  resumoAssinaturaCadastroApp,
} from "@/services/cooperadoAssinaturaService";
import { formatDateTime } from "@/utils/format";
import { finalizeAssinaturaEdit, rotateAssinaturaDataUrl } from "@/utils/assinaturaImageEdit";
import { AssinaturaImageEditor } from "@/components/cooperado/AssinaturaImageEditor";

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
  const [verAssinatura, setVerAssinatura] = useState<Cooperado | null>(null);
  const [editandoAssinatura, setEditandoAssinatura] = useState(false);
  const [assinaturaEditada, setAssinaturaEditada] = useState<{ dataUrl: string; hash: string } | null>(null);
  const [ajustesLista, setAjustesLista] = useState<Record<string, { dataUrl: string; hash: string }>>({});
  const [girandoId, setGirandoId] = useState<string | null>(null);
  const [syncando, setSyncando] = useState(false);

  const cooperadoIdLocal = (c: Cooperado) =>
    encontrarCooperadoLocalEquivalente(getData(), cooperativaId, c)?.id ?? c.id;

  const imagemAjustadaPara = (c: Cooperado) => {
    if (verAssinatura?.id === c.id && assinaturaEditada) return assinaturaEditada;
    return ajustesLista[c.id] ?? null;
  };

  const previewCooperado = (c: Cooperado) =>
    imagemAjustadaPara(c)?.dataUrl ?? getAssinaturaCadastroDataUrl(c);

  const girarImagem = async (c: Cooperado, graus: number) => {
    const src = previewCooperado(c);
    if (!src) return;
    setGirandoId(c.id);
    setErro("");
    try {
      const rotated = await rotateAssinaturaDataUrl(src, graus);
      const payload = await finalizeAssinaturaEdit(rotated);
      if (verAssinatura?.id === c.id) {
        setAssinaturaEditada(payload);
      } else {
        setAjustesLista((prev) => ({ ...prev, [c.id]: payload }));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível girar a imagem.");
    } finally {
      setGirandoId(null);
    }
  };

  const sincronizarNuvem = async () => {
    setSyncando(true);
    setErro("");
    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, cooperativaId, user);
      if (cnpj) await syncCooperadosFromCloud(cnpj, cooperativaId);
    } finally {
      setSyncando(false);
    }
  };

  useEffect(() => {
    setEditandoAssinatura(false);
    setAssinaturaEditada(null);
  }, [verAssinatura?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, cooperativaId, user);
      if (cancelled || !cnpj) return;
      await syncCooperadosFromCloud(cnpj, cooperativaId);
    })();
    return () => {
      cancelled = true;
    };
  }, [cooperativaId, user.id, user.cooperativaCnpj]);

  const previewVerAssinatura = verAssinatura ? previewCooperado(verAssinatura) : null;

  const syncCooperado = async (cooperado: Cooperado) => {
    const cnpj = await resolveCooperativaCnpj(data, cooperado.cooperativaId, user);
    if (!cnpj) return { ok: false as const, error: "CNPJ da cooperativa não encontrado." };
    return pushCooperadoToCloud(cnpj, cooperado, user.email);
  };

  const confirmar = async (
    ref: Cooperado,
    imagemAjustada?: { dataUrl: string; hash: string } | null
  ): Promise<boolean> => {
    const localId = cooperadoIdLocal(ref);
    setErro("");
    setBusyId(ref.id);
    try {
      let atualizado: Cooperado | null = null;
      updateData((d) => {
        const idx = d.cooperados.findIndex((c) => c.id === localId);
        let base = d;
        if (idx >= 0) {
          const fields = mergeAssinaturaCadastroFields(d.cooperados[idx], ref);
          base = {
            ...d,
            cooperados: d.cooperados.map((c, i) =>
              i === idx ? { ...c, ...fields, id: localId } : c
            ),
          };
        }
        const result = confirmarAssinaturaCadastroCooperado(
          base,
          localId,
          user,
          imagemAjustada ?? undefined
        );
        if (!result.ok) {
          setErro(result.error);
          return d;
        }
        atualizado = result.cooperado;
        return result.data;
      });
      if (!atualizado) return false;
      const salvo = getData().cooperados.find((c) => c.id === localId) ?? null;
      if (!salvo) return false;
      const push = await syncCooperado(salvo);
      if (!push.ok) {
        const cnpj = await resolveCooperativaCnpj(data, salvo.cooperativaId, user);
        if (cnpj) queueCooperadoPush(cnpj, salvo, user.email);
        setErro(push.error ?? "Confirmado localmente, mas falhou na nuvem — tentaremos enviar de novo.");
        return false;
      }
      setAjustesLista((prev) => {
        const next = { ...prev };
        delete next[ref.id];
        return next;
      });
      return true;
    } finally {
      setBusyId(null);
    }
  };

  const devolver = async (ref: Cooperado): Promise<boolean> => {
    const localId = cooperadoIdLocal(ref);
    setErro("");
    setBusyId(ref.id);
    try {
      let atualizado: Cooperado | null = null;
      const motivo = motivoDevolucao[ref.id] ?? motivoDevolucao[localId];
      updateData((d) => {
        const idx = d.cooperados.findIndex((c) => c.id === localId);
        let base = d;
        if (idx >= 0) {
          const fields = mergeAssinaturaCadastroFields(d.cooperados[idx], ref);
          base = {
            ...d,
            cooperados: d.cooperados.map((c, i) =>
              i === idx ? { ...c, ...fields, id: localId } : c
            ),
          };
        }
        const result = devolverAssinaturaCadastroCooperado(base, localId, user, motivo);
        if (!result.ok) {
          setErro(result.error);
          return d;
        }
        atualizado = result.cooperado;
        return result.data;
      });
      if (!atualizado) return false;
      const salvo = getData().cooperados.find((c) => c.id === localId) ?? null;
      if (!salvo) return false;
      const push = await syncCooperado(salvo);
      if (!push.ok) {
        const cnpj = await resolveCooperativaCnpj(data, salvo.cooperativaId, user);
        if (cnpj) queueCooperadoPush(cnpj, salvo, user.email);
        setErro(push.error ?? "Devolvido localmente, mas falhou na nuvem — tentaremos enviar de novo.");
        return false;
      }
      setMotivoDevolucao((prev) => {
        const next = { ...prev };
        delete next[ref.id];
        delete next[localId];
        return next;
      });
      return true;
    } finally {
      setBusyId(null);
    }
  };

  const statusVerAssinatura = verAssinatura ? getAssinaturaCadastroStatus(verAssinatura) : null;
  const podeDevolverVerAssinatura =
    Boolean(verAssinatura) &&
    Boolean(previewVerAssinatura) &&
    (statusVerAssinatura === "em_analise" || statusVerAssinatura === "confirmada");
  const modalBusy = Boolean(verAssinatura && busyId === verAssinatura.id);

  if (resumo.comApp === 0 && resumo.emAnalise === 0 && resumo.devolvida === 0) return null;

  return (
    <Card title="Conferir assinaturas dos cooperados" className="mb-6">
      <p className="text-sm text-gray-600 mb-4">
        Analise a foto da assinatura enviada pelo app. Use <strong>Girar</strong> se a foto estiver de lado,
        confirme ou devolva para reenvio.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => void sincronizarNuvem()} disabled={syncando}>
          {syncando ? "Sincronizando…" : "Atualizar da nuvem"}
        </Button>
      </div>

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
            const preview = previewCooperado(c);
            const busy = busyId === c.id;
            const girando = girandoId === c.id;
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

                {preview ? (
                  <div className="bg-white rounded-lg border border-amber-100 p-4 flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt={`Assinatura de ${c.nomeCompleto}`}
                      className="max-h-28 max-w-full object-contain"
                    />
                    <div className="flex flex-wrap gap-2 justify-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || girando}
                        onClick={() => void girarImagem(c, -90)}
                      >
                        <RotateCcw size={14} />
                        Girar esq.
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || girando}
                        onClick={() => void girarImagem(c, 90)}
                      >
                        <RotateCw size={14} />
                        Girar dir.
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setVerAssinatura(c)}>
                        <Eye size={14} />
                        Ver / editar
                      </Button>
                    </div>
                    {ajustesLista[c.id] && (
                      <span className="text-xs text-green-700">Imagem girada — confirme para salvar.</span>
                    )}
                  </div>
                ) : (
                  <AlertBanner variant="warning" title="Foto ainda não carregou neste aparelho">
                    Toque em <strong>Atualizar da nuvem</strong>. Se o cooperado acabou de enviar, aguarde alguns
                    segundos e atualize de novo.
                  </AlertBanner>
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
                  <Button
                    size="sm"
                    onClick={() => void confirmar(c, imagemAjustadaPara(c))}
                    disabled={busy || !preview}
                  >
                    <CheckCircle2 size={16} />
                    Confirmar assinatura
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void devolver(c)} disabled={busy}>
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
          <ul className="text-sm text-gray-600 space-y-2 max-h-64 overflow-y-auto">
            {[...resumo.listaComAssinatura]
              .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"))
              .map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-medium text-gray-800">{c.nomeCompleto}</span>
                    {c.assinaturaConfirmadaEm ? (
                      <span className="text-xs text-gray-400">
                        {formatDateTime(c.assinaturaConfirmadaEm)}
                      </span>
                    ) : c.assinaturaCadastradaEm ? (
                      <span className="text-xs text-gray-400">
                        Cadastro {formatDateTime(c.assinaturaCadastradaEm)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Cadastro anterior</span>
                    )}
                  </div>
                  {getAssinaturaCadastroDataUrl(c) && (
                    <Button size="sm" variant="secondary" onClick={() => setVerAssinatura(c)}>
                      <Eye size={14} />
                      Ver assinatura
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <Modal
        open={Boolean(verAssinatura)}
        onClose={() => !modalBusy && setVerAssinatura(null)}
        title={verAssinatura ? `Assinatura — ${verAssinatura.nomeCompleto}` : "Assinatura"}
        size={editandoAssinatura ? "lg" : "md"}
        footer={
          !editandoAssinatura ? (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="secondary" onClick={() => setVerAssinatura(null)} disabled={modalBusy}>
              Fechar
            </Button>
            {verAssinatura && statusVerAssinatura === "em_analise" && (
              <Button
                onClick={() =>
                  void (async () => {
                    const ok = await confirmar(verAssinatura, imagemAjustadaPara(verAssinatura));
                    if (ok) setVerAssinatura(null);
                  })()
                }
                disabled={modalBusy || !previewVerAssinatura}
              >
                <CheckCircle2 size={16} />
                Confirmar assinatura
              </Button>
            )}
            {podeDevolverVerAssinatura && verAssinatura && (
              <Button
                variant="danger"
                onClick={() =>
                  void (async () => {
                    const ok = await devolver(verAssinatura);
                    if (ok) setVerAssinatura(null);
                  })()
                }
                disabled={modalBusy}
              >
                <RotateCcw size={16} />
                Solicitar reenvio
              </Button>
            )}
          </div>
          ) : null
        }
      >
        {verAssinatura && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={getAssinaturaCadastroStatus(verAssinatura)} />
              {verAssinatura.assinaturaCadastroVersao ? (
                <span className="text-xs text-gray-500">Versão {verAssinatura.assinaturaCadastroVersao}</span>
              ) : null}
            </div>

            {previewVerAssinatura && editandoAssinatura ? (
              <AssinaturaImageEditor
                sourceDataUrl={previewVerAssinatura}
                disabled={modalBusy}
                onCancel={() => setEditandoAssinatura(false)}
                onApply={(payload) => {
                  setAssinaturaEditada(payload);
                  setEditandoAssinatura(false);
                }}
              />
            ) : previewVerAssinatura ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewVerAssinatura}
                    alt={`Assinatura de ${verAssinatura.nomeCompleto}`}
                    className="max-h-48 max-w-full object-contain"
                  />
                </div>
                {statusVerAssinatura === "em_analise" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={modalBusy || girandoId === verAssinatura.id}
                      onClick={() => void girarImagem(verAssinatura, -90)}
                    >
                      <RotateCcw size={14} />
                      Girar esquerda
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={modalBusy || girandoId === verAssinatura.id}
                      onClick={() => void girarImagem(verAssinatura, 90)}
                    >
                      <RotateCw size={14} />
                      Girar direita
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditandoAssinatura(true)}
                      disabled={modalBusy}
                    >
                      <Pencil size={14} />
                      Editar (recortar)
                    </Button>
                    {(assinaturaEditada || ajustesLista[verAssinatura.id]) && (
                      <span className="text-xs text-green-700 self-center">
                        Imagem ajustada — confirme abaixo para salvar.
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <AlertBanner variant="warning" title="Foto não disponível">
                Este cooperado não tem imagem de assinatura salva no cadastro.
              </AlertBanner>
            )}

            {podeDevolverVerAssinatura && (
              <>
                <AlertBanner variant="info" title="Solicitar correção">
                  {statusVerAssinatura === "confirmada"
                    ? "A assinatura será removida e o cooperado precisará fotografar de novo em Meu cadastro. Até reenviar e você confirmar, não poderá usá-la em recibos e votações."
                    : "O cooperado verá seu aviso no app e poderá enviar uma nova foto em Meu cadastro."}
                </AlertBanner>
                <FormField
                  label="Motivo do reenvio (opcional)"
                  hint="O cooperado verá esta mensagem no app"
                >
                  <Textarea
                    rows={2}
                    value={motivoDevolucao[verAssinatura.id] ?? ""}
                    onChange={(e) =>
                      setMotivoDevolucao((prev) => ({ ...prev, [verAssinatura.id]: e.target.value }))
                    }
                    placeholder="Ex.: foto escura, assinatura cortada, nome ilegível…"
                    disabled={modalBusy}
                  />
                </FormField>
              </>
            )}

            <dl className="grid gap-2 text-sm text-gray-600">
              {verAssinatura.assinaturaCadastradaEm && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-400">Enviada em</dt>
                  <dd>{formatDateTime(verAssinatura.assinaturaCadastradaEm)}</dd>
                </div>
              )}
              {verAssinatura.assinaturaConfirmadaEm && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-400">Confirmada em</dt>
                  <dd>
                    {formatDateTime(verAssinatura.assinaturaConfirmadaEm)}
                    {verAssinatura.assinaturaConfirmadaPorNome
                      ? ` · ${verAssinatura.assinaturaConfirmadaPorNome}`
                      : ""}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </Card>
  );
}
