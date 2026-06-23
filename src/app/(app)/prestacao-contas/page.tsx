"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { isDiretoriaRole, canUser } from "@/permissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { updateData, addAuditEntry, generateId, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import {
  adicionarNotasPrestacao,
  atualizarNotaPrestacao,
  conferirNotaPrestacao,
  criarPrestacaoContas,
  excluirPrestacaoContas,
  prestacoesAtivasCooperado,
  prestacoesCooperativa,
  prestacoesDoCooperado,
  TIPO_REPASSE_LABELS,
  resumoValoresPrestacao,
  tituloPrestacaoCooperado,
  valorRestantePrestacao,
} from "@/services/prestacaoContasService";
import { compressFotoFile, makeFotoThumbnail } from "@/utils/fotoEntrega";
import { formatCurrency, formatDate } from "@/utils/format";
import type { PrestacaoContas, TipoRepassePrestacao, AppData } from "@/types";

const STATUS_LABELS: Record<PrestacaoContas["status"], string> = {
  pendente: "Aguardando notas",
  em_conferencia: "Em conferência",
  parcial: "Parcialmente conferida",
  conferida: "Conferida",
};

function StatusBadge({ status }: { status: PrestacaoContas["status"] }) {
  const colors: Record<PrestacaoContas["status"], string> = {
    pendente: "bg-amber-100 text-amber-800",
    em_conferencia: "bg-blue-100 text-blue-800",
    parcial: "bg-orange-100 text-orange-800",
    conferida: "bg-green-100 text-green-800",
  };
  const label = STATUS_LABELS[status] ?? "Prestação";
  const color = colors[status] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
      {label}
    </span>
  );
}

function labelTipoRepasse(tipo: TipoRepassePrestacao | undefined): string {
  if (tipo && TIPO_REPASSE_LABELS[tipo]) return TIPO_REPASSE_LABELS[tipo];
  return "Repasse";
}

function ResponsavelView({ coopId, data }: { coopId: string; data: AppData }) {
  const { user } = usePermissions();
  const [cooperadoId, setCooperadoId] = useState("");
  const [tipoRepasse, setTipoRepasse] = useState<TipoRepassePrestacao>("despesa");
  const [historico, setHistorico] = useState("");
  const [valorRepasse, setValorRepasse] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [excluirPrestacaoTarget, setExcluirPrestacaoTarget] = useState<PrestacaoContas | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const podeExcluir = user ? canUser(user, "prestacao_contas", "delete") : false;

  const cooperados = useMemo(
    () =>
      data.cooperados
        .filter((c) => c.cooperativaId === coopId && c.status === "ativo")
        .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto)),
    [data.cooperados, coopId]
  );

  const prestacoes = useMemo(() => prestacoesCooperativa(data, coopId), [data, coopId]);

  const enviarRepasse = () => {
    if (!user) return;
    const coop = cooperados.find((c) => c.id === cooperadoId);
    const v = parseFloat(valorRepasse.replace(",", "."));
    if (!coop || !Number.isFinite(v) || v <= 0 || !historico.trim()) return;

    updateData((d) => {
      const next = criarPrestacaoContas(d, {
        id: generateId("pc"),
        cooperativaId: coopId,
        cooperadoId: coop.id,
        cooperadoNome: coop.nomeCompleto,
        tipoRepasse,
        historico,
        valorRepasse: v,
        responsavelId: user.id,
        responsavelNome: user.name,
      });
      return addAuditEntry(next, {
        entityType: "financeiro",
        entityId: coop.id,
        action: "criar",
        userId: user.id,
        userName: user.name,
        changes: `Prestação de contas · ${formatCurrency(v)} · ${historico.trim()}`,
      });
    });

    setCooperadoId("");
    setHistorico("");
    setValorRepasse("");
    setTipoRepasse("despesa");
  };

  const salvarCampoNota = (
    prestacaoId: string,
    notaId: string,
    patch: { valorNota?: number; dataNota?: string; localDespesa?: string }
  ) => {
    updateData((d) => atualizarNotaPrestacao(d, prestacaoId, notaId, patch));
  };

  const conferir = (prestacaoId: string, notaId: string) => {
    if (!user) return;
    updateData((d) => {
      const next = conferirNotaPrestacao(d, prestacaoId, notaId);
      return addAuditEntry(next, {
        entityType: "financeiro",
        entityId: prestacaoId,
        action: "aprovar",
        userId: user.id,
        userName: user.name,
        changes: "Nota conferida na prestação de contas",
      });
    });
  };

  const excluirPrestacao = async () => {
    if (!user || !excluirPrestacaoTarget) return;
    setExcluindo(true);
    try {
      const alvo = excluirPrestacaoTarget;
      let nextData: AppData | null = null;
      updateData((d) => {
        nextData = addAuditEntry(excluirPrestacaoContas(d, alvo.id, coopId), {
          entityType: "financeiro",
          entityId: alvo.id,
          action: "excluir",
          userId: user.id,
          userName: user.name,
          changes: `Prestação de contas excluída · ${alvo.cooperadoNomeSnapshot ?? "Cooperado"} · ${formatCurrency(alvo.valorRepasse)} · ${alvo.historico}`,
        });
        return nextData;
      });
      if (nextData) {
        const cnpj = await resolveCooperativaCnpj(nextData, coopId, user);
        if (cnpj) await pushOperacionalToCloud(cnpj, nextData, coopId, { authoritative: true });
      }
      if (expandido === alvo.id) setExpandido(null);
      setExcluirPrestacaoTarget(null);
    } finally {
      setExcluindo(false);
    }
  };

  const publicar = async () => {
    if (!user) return;
    setPublicando(true);
    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Novo repasse — prestação de contas">
        <p className="text-sm text-gray-500 mb-4">
          Informe o cooperado, o tipo de repasse e o valor. O cooperado verá no início do app e enviará as fotos das notas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Cooperado" required>
            <Select value={cooperadoId} onChange={(e) => setCooperadoId(e.target.value)}>
              <option value="">Selecione…</option>
              {cooperados.map((c) => (
                <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tipo de repasse" required>
            <Select value={tipoRepasse} onChange={(e) => setTipoRepasse(e.target.value as TipoRepassePrestacao)}>
              {(Object.keys(TIPO_REPASSE_LABELS) as TipoRepassePrestacao[]).map((k) => (
                <option key={k} value={k}>{TIPO_REPASSE_LABELS[k]}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="mt-4">
          <FormField label="Histórico" required>
            <Textarea
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              rows={2}
              placeholder="Ex: Repasse combustível entrega PNAE"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 items-end">
          <FormField label="Valor repassado (R$)" required>
            <Input type="number" step="0.01" min={0} value={valorRepasse} onChange={(e) => setValorRepasse(e.target.value)} />
          </FormField>
          <Button onClick={enviarRepasse} className="w-full sm:w-auto">
            <Send size={16} /> Enviar prestação
          </Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => void publicar()} disabled={publicando}>
          {publicando ? "Sincronizando…" : "Sincronizar nuvem"}
        </Button>
      </div>

      <Card title="Conferir prestações">
        {prestacoes.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Nenhuma prestação registrada.</p>
        ) : (
          <div className="space-y-3">
            {prestacoes.map((p) => {
              const resumo = resumoValoresPrestacao(p);
              const restante = resumo.restante;
              const aberto = expandido === p.id;

              return (
                <div key={p.id} className="border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50"
                    onClick={() => setExpandido(aberto ? null : p.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <User size={16} className="text-gray-400 shrink-0" />
                        <span className="font-semibold text-gray-900">{p.cooperadoNomeSnapshot}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-sm text-gray-600 mt-1 truncate">{p.historico}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {labelTipoRepasse(p.tipoRepasse)} · Repasse {formatCurrency(p.valorRepasse)}
                        {resumo.abatido > 0 && ` · Lançado ${formatCurrency(resumo.abatido)}`}
                        {resumo.conferido > 0 && ` · Conferido ${formatCurrency(resumo.conferido)}`}
                        {restante > 0 && (
                          <span className="text-amber-700 font-medium"> · Falta {formatCurrency(restante)}</span>
                        )}
                      </p>
                    </div>
                    {aberto ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>

                  {aberto && (
                    <div className="border-t p-4 bg-gray-50/80 space-y-4">
                      {restante > 0 && (
                        <AlertBanner variant="warning" title={`Saldo a prestar: ${formatCurrency(restante)}`}>
                          Informe o valor de cada nota. O saldo diminui conforme os valores são lançados nas notas enviadas.
                        </AlertBanner>
                      )}

                      {(p.notas ?? []).length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">Cooperado ainda não enviou fotos das notas.</p>
                      ) : (
                        (p.notas ?? []).map((nota) => {
                          const img = nota.fotoDataUrl || nota.fotoMiniatura;
                          return (
                            <div
                              key={nota.id}
                              className={`grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-xl border bg-white ${
                                nota.conferido ? "border-green-200 opacity-80" : "border-gray-200"
                              }`}
                            >
                              <div>
                                {img ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={img} alt="Nota fiscal" className="w-full max-h-72 object-contain rounded-lg border bg-gray-100" />
                                ) : (
                                  <div className="h-40 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">Sem imagem</div>
                                )}
                                <p className="text-xs text-gray-500 mt-2">
                                  Enviado em {nota.enviadoEm ? formatDate(nota.enviadoEm) : "—"}
                                </p>
                              </div>
                              <div className="space-y-3">
                                <FormField label="Cooperado">
                                  <Input value={p.cooperadoNomeSnapshot ?? ""} readOnly className="bg-gray-50" />
                                </FormField>
                                <FormField label="Valor da nota (R$)">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    disabled={nota.conferido}
                                    defaultValue={nota.valorNota ?? ""}
                                    onBlur={(e) => {
                                      const v = parseFloat(e.target.value);
                                      if (Number.isFinite(v)) salvarCampoNota(p.id, nota.id, { valorNota: v });
                                    }}
                                  />
                                </FormField>
                                <FormField label="Data da nota">
                                  <Input
                                    type="date"
                                    disabled={nota.conferido}
                                    defaultValue={nota.dataNota ?? ""}
                                    onBlur={(e) => salvarCampoNota(p.id, nota.id, { dataNota: e.target.value })}
                                  />
                                </FormField>
                                <FormField label="Local da despesa">
                                  <Input
                                    disabled={nota.conferido}
                                    defaultValue={nota.localDespesa ?? ""}
                                    placeholder="Ex: Posto Shell, mercado…"
                                    onBlur={(e) => salvarCampoNota(p.id, nota.id, { localDespesa: e.target.value })}
                                  />
                                </FormField>
                                {nota.conferido ? (
                                  <div className="flex items-center gap-2 text-green-700 font-medium">
                                    <CheckCircle2 size={18} /> Conferido
                                    {nota.conferidoEm && (
                                      <span className="text-xs text-gray-500 font-normal">
                                        · {formatDate(nota.conferidoEm)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <Button
                                    onClick={() => conferir(p.id, nota.id)}
                                    disabled={!(Number(nota.valorNota) > 0)}
                                  >
                                    <CheckCircle2 size={16} /> Conferido
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {p.status === "conferida" && restante <= 0 && (
                        <AlertBanner variant="success" title="Prestação conferida">
                          Todas as notas foram conferidas e o valor bate com o repasse.
                        </AlertBanner>
                      )}

                      {podeExcluir && (
                        <div className="pt-2 border-t border-gray-200">
                          <Button
                            variant="danger"
                            className="w-full sm:w-auto"
                            onClick={() => setExcluirPrestacaoTarget(p)}
                          >
                            <Trash2 size={16} /> Excluir prestação
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(excluirPrestacaoTarget)}
        onClose={() => !excluindo && setExcluirPrestacaoTarget(null)}
        onConfirm={excluirPrestacao}
        title="Excluir prestação de contas?"
        message={
          excluirPrestacaoTarget
            ? (() => {
                const notas = (excluirPrestacaoTarget.notas ?? []).filter(
                  (n) => n.fotoDataUrl || n.fotoMiniatura
                ).length;
                const base = `Excluir o repasse de ${formatCurrency(excluirPrestacaoTarget.valorRepasse)} para ${excluirPrestacaoTarget.cooperadoNomeSnapshot ?? "cooperado"} (${excluirPrestacaoTarget.historico})?`;
                return notas > 0
                  ? `${base} ${notas} nota(s) enviada(s) também serão removidas e o aviso some do início do cooperado.`
                  : `${base} O cooperado deixará de ver este valor no início do app.`;
              })()
            : ""
        }
        confirmLabel="Sim, excluir"
        variant="danger"
        loading={excluindo}
      />
    </div>
  );
}

function CooperadoView({
  cooperadoId,
  coopId,
  data,
}: {
  cooperadoId: string;
  coopId?: string;
  data: AppData;
}) {
  const { user } = usePermissions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prestacaoId, setPrestacaoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [previewValores, setPreviewValores] = useState<string[]>([]);

  const ativas = useMemo(
    () => prestacoesAtivasCooperado(data, cooperadoId, coopId),
    [data, cooperadoId, coopId]
  );
  const historico = useMemo(
    () => prestacoesDoCooperado(data, cooperadoId, coopId),
    [data, cooperadoId, coopId]
  );

  const selecionada = ativas.find((p) => p.id === prestacaoId) ?? ativas[0];

  useEffect(() => {
    if (ativas[0] && !prestacaoId) setPrestacaoId(ativas[0].id);
  }, [ativas, prestacaoId]);

  const onFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const compressed = await compressFotoFile(files[i]);
      urls.push(compressed);
    }
    setPreview((prev) => [...prev, ...urls]);
    setPreviewValores((prev) => [...prev, ...urls.map(() => "")]);
  };

  const enviarNotas = async () => {
    if (!selecionada || !preview.length || !user) return;

    const valores = preview.map((_, i) => parseFloat(previewValores[i]?.replace(",", ".") ?? ""));
    if (valores.some((v) => !Number.isFinite(v) || v <= 0)) {
      alert("Informe o valor (R$) de cada nota antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      const notas = await Promise.all(
        preview.map(async (full, i) => {
          const thumb = await makeFotoThumbnail(full);
          return {
            id: generateId("pcn"),
            fotoDataUrl: full,
            fotoMiniatura: thumb,
            valorNota: valores[i],
            conferido: false,
            enviadoEm: new Date().toISOString(),
          };
        })
      );

      updateData((d) => {
        const next = adicionarNotasPrestacao(d, selecionada.id, notas);
        return addAuditEntry(next, {
          entityType: "financeiro",
          entityId: selecionada.id,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: `${notas.length} nota(s) enviada(s) na prestação de contas`,
        });
      });

      setPreview([]);
      setPreviewValores([]);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setEnviando(false);
    }
  };

  if (ativas.length === 0 && historico.length === 0) {
    return (
      <AlertBanner variant="info" title="Nenhuma prestação pendente">
        Quando a cooperativa registrar um repasse para você, aparecerá aqui para enviar as fotos das notas.
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-6">
      {selecionada && (() => {
        const resumo = resumoValoresPrestacao(selecionada);
        return (
        <>
          <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="text-violet-700" size={22} />
              <span className="font-bold text-violet-900 text-lg">
                {tituloPrestacaoCooperado(selecionada)}
              </span>
            </div>
            <p className="text-sm text-violet-800">{labelTipoRepasse(selecionada.tipoRepasse)} · {selecionada.historico}</p>
            <div className="mt-3">
              <p className="text-2xl font-bold text-violet-900">
                {formatCurrency(resumo.restante > 0 ? resumo.restante : 0)}
              </p>
              <p className="text-sm text-violet-800 mt-0.5">
                {resumo.restante > 0 ? "Falta prestar" : "Aguardando conferência final"}
              </p>
              {resumo.abatido > 0 && (
                <p className="text-xs text-violet-700/90 mt-2">
                  Lançado nas notas: {formatCurrency(resumo.abatido)}
                </p>
              )}
            </div>
            <div className="mt-2">
              <StatusBadge status={selecionada.status} />
            </div>
          </div>

          {ativas.length > 1 && (
            <FormField label="Prestação">
              <Select value={selecionada.id} onChange={(e) => setPrestacaoId(e.target.value)}>
                {ativas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.historico} — {formatCurrency(valorRestantePrestacao(p))}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <Card title="Fotos das notas de despesa">
            <p className="text-sm text-gray-500 mb-4">
              Tire fotos das notas e informe o valor de cada uma. O saldo a prestar diminui conforme você envia.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => void onFotos(e.target.files)}
            />
            <Button variant="secondary" className="w-full mb-4" onClick={() => fileRef.current?.click()}>
              <Camera size={18} /> Tirar / escolher fotos
            </Button>

            {preview.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {preview.map((url, i) => (
                  <div key={i} className="rounded-lg border p-2 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full aspect-square object-cover rounded-lg" />
                    <FormField label="Valor da nota (R$)" required>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0,00"
                        value={previewValores[i] ?? ""}
                        onChange={(e) =>
                          setPreviewValores((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                      />
                    </FormField>
                  </div>
                ))}
              </div>
            )}

            {(selecionada.notas ?? []).length > 0 && (
              <p className="text-sm text-green-700 mb-3">
                {(selecionada.notas ?? []).length} nota(s) já enviada(s). Você pode enviar mais fotos se necessário.
              </p>
            )}

            <Button
              className="w-full"
              disabled={
                !preview.length ||
                enviando ||
                preview.some((_, i) => !(parseFloat(previewValores[i]?.replace(",", ".") ?? "") > 0))
              }
              onClick={() => void enviarNotas()}
            >
              <Send size={16} /> {enviando ? "Enviando…" : "Enviar notas para conferência"}
            </Button>
          </Card>
        </>
        );
      })()}

      {historico.filter((p) => p.status === "conferida").length > 0 && (
        <Card title="Histórico conferido">
          <div className="space-y-2">
            {historico
              .filter((p) => p.status === "conferida")
              .map((p) => (
                <div key={p.id} className="p-3 rounded-lg border border-green-100 bg-green-50/50 text-sm">
                  <span className="font-medium">{p.historico}</span>
                  <span className="text-gray-500 ml-2">{formatCurrency(p.valorRepasse)}</span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function PrestacaoContasPage() {
  const data = useAppData();
  const { user } = usePermissions();
  const router = useRouter();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const isDiretoria = user ? isDiretoriaRole(user.role) : false;

  useEffect(() => {
    if (!user) return;
    if (!canUser(user, "prestacao_contas", "view")) router.replace("/dashboard");
  }, [user, router]);

  if (!data || !user) return null;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Prestação de contas"
        subtitle={
          isDiretoria
            ? "Registre repasses e confira as notas enviadas pelos cooperados"
            : "Envie fotos das notas comprobatórias dos repasses recebidos"
        }
      />
      {isDiretoria && coopId ? (
        <ResponsavelView coopId={coopId} data={data} />
      ) : user.cooperadoId ? (
        <CooperadoView cooperadoId={user.cooperadoId} coopId={coopId} data={data} />
      ) : (
        <AlertBanner variant="warning" title="Acesso não configurado">
          Vincule este usuário a um cooperado ou perfil de responsável.
        </AlertBanner>
      )}
    </div>
  );
}
