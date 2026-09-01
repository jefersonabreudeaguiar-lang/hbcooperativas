"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, FileDown, Megaphone, Plus, Send, Trash2, Users, Vote } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { FormField, Input, Textarea } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { formatDate } from "@/utils/format";
import { getCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { requestAppSync } from "@/services/syncRequest";
import {
  abrirPautaVotacao,
  criarPautaVotacao,
  getResumoPauta,
  labelEscopoEleitoral,
  listarPautasCooperativa,
  publicarResultadoPauta,
  removerPautaRascunho,
  labelVoto,
  getEscopoEleitoralPauta,
} from "@/services/votacaoService";
import type { EscopoEleitoralVotacao } from "@/types";
import { baixarAtaDeliberacaoVotacaoPdf } from "@/utils/votacaoDeliberativaHtml";

const hojeIso = () => new Date().toISOString().split("T")[0];

export default function VotacoesPage() {
  const data = useAppData();
  const router = useRouter();
  const { check, user, isCooperado, isDiretoria } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const [texto, setTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [reuniaoWhatsapp, setReuniaoWhatsapp] = useState("");
  const [reuniaoHorarioInicio, setReuniaoHorarioInicio] = useState("");
  const [reuniaoHorarioFim, setReuniaoHorarioFim] = useState("");
  const [inicioEm, setInicioEm] = useState(hojeIso());
  const [fimEm, setFimEm] = useState(hojeIso());
  const [escopoEleitoral, setEscopoEleitoral] = useState<EscopoEleitoralVotacao>("todos");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState<string | null>(null);

  useEffect(() => {
    if (isCooperado) router.replace("/dashboard");
    else if (user && !check("votacoes", "view")) router.replace("/dashboard");
  }, [isCooperado, user, router, check]);

  const pautas = useMemo(
    () => (data && coopId ? listarPautasCooperativa(data, coopId) : []),
    [data, coopId]
  );

  const resumos = useMemo(
    () => pautas.map((p) => (data && coopId ? getResumoPauta(data, p.id, coopId) : null)).filter(Boolean),
    [pautas, data, coopId]
  );

  const syncNuvem = async (nextData: typeof data) => {
    if (!nextData || !coopId) return;
    const cnpj = getCooperativaCnpj(nextData, coopId);
    if (!cnpj) {
      requestAppSync();
      return;
    }
    setSyncing(true);
    try {
      await pushOperacionalToCloud(cnpj, nextData, coopId, { authoritative: true });
      requestAppSync();
    } finally {
      setSyncing(false);
    }
  };

  const handleCriar = () => {
    if (!data || !coopId || !user) return;
    setErro("");
    setMsg("");
    updateData((d) => {
      const result = criarPautaVotacao(d, {
        cooperativaId: coopId,
        texto,
        observacao,
        reuniaoWhatsapp,
        reuniaoHorarioInicio,
        reuniaoHorarioFim,
        inicioEm,
        fimEm,
        escopoEleitoral,
        criadoPorUserId: user.id,
        criadoPorNome: user.name,
      });
      if (!result.ok) {
        setErro(result.error);
        return d;
      }
      setTexto("");
      setObservacao("");
      setReuniaoWhatsapp("");
      setReuniaoHorarioInicio("");
      setReuniaoHorarioFim("");
      setInicioEm(hojeIso());
      setFimEm(hojeIso());
      setEscopoEleitoral("todos");
      setMsg(
        escopoEleitoral === "diretoria"
          ? "Pauta salva como rascunho (votação restrita à diretoria). Revise e use «Lançar enquete»."
          : "Pauta salva como rascunho. Revise e use «Lançar enquete» para todos os cooperados."
      );
      void syncNuvem(result.data);
      return addAuditEntry(result.data, {
        entityType: "votacao",
        entityId: result.pauta.id,
        action: "criar",
        userId: user.id,
        userName: user.name,
        changes: `Pauta criada: ${result.pauta.texto.slice(0, 80)}`,
      });
    });
  };

  const handleAbrir = (pautaId: string) => {
    if (!data || !coopId || !user) return;
    setErro("");
    setMsg("");
    updateData((d) => {
      const result = abrirPautaVotacao(d, pautaId, coopId);
      if (!result.ok) {
        setErro(result.error);
        return d;
      }
      const pautaAberta = (result.data.votacaoPautas ?? []).find((p) => p.id === pautaId);
      setMsg(
        pautaAberta?.escopoEleitoral === "diretoria"
          ? "Enquete lançada! Apenas membros da diretoria verão a votação no Início."
          : "Enquete lançada! Os cooperados verão a votação no Início."
      );
      void syncNuvem(result.data);
      return addAuditEntry(result.data, {
        entityType: "votacao",
        entityId: pautaId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Enquete aberta para cooperados",
      });
    });
  };

  const handlePublicarResultado = (pautaId: string) => {
    if (!data || !coopId || !user) return;
    setErro("");
    setMsg("");
    updateData((d) => {
      const result = publicarResultadoPauta(d, pautaId, coopId);
      if (!result.ok) {
        setErro(result.error);
        return d;
      }
      setMsg("Resultado publicado no mural dos cooperados por 24 horas.");
      void syncNuvem(result.data);
      return addAuditEntry(result.data, {
        entityType: "votacao",
        entityId: pautaId,
        action: "aprovar",
        userId: user.id,
        userName: user.name,
        changes: "Resultado da votação publicado",
      });
    });
  };

  const handleExcluirRascunho = (pautaId: string) => {
    if (!data || !coopId) return;
    if (!window.confirm("Excluir este rascunho de pauta?")) return;
    updateData((d) => {
      const result = removerPautaRascunho(d, pautaId, coopId);
      if (!result.ok) {
        setErro(result.error);
        return d;
      }
      setMsg("Rascunho excluído.");
      void syncNuvem(result.data);
      return result.data;
    });
  };

  const handleBaixarAta = async (pautaId: string) => {
    if (!data || !coopId) return;
    setErro("");
    setGerandoPdf(pautaId);
    try {
      await baixarAtaDeliberacaoVotacaoPdf(data, pautaId, coopId);
      setMsg("Ata de deliberação gerada. Revise o PDF e arquive conforme orientação jurídica.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o documento.");
    } finally {
      setGerandoPdf(null);
    }
  };

  if (!data || !coopId || !isDiretoria) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Votações"
        subtitle="Crie pautas com observações e reunião online, acompanhe votos com assinatura e gere a ata de deliberação."
      />

      {msg && (
        <AlertBanner variant="success" title="Pronto">
          <p>{msg}</p>
        </AlertBanner>
      )}
      {erro && (
        <AlertBanner variant="error" title="Atenção">
          <p>{erro}</p>
        </AlertBanner>
      )}

      {check("votacoes", "create") && (
        <Card title="Nova pauta de votação">
          <div className="space-y-4">
            <FormField label="Pauta — o que será votado">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                placeholder="Ex.: Aprovar a implementação da Conta Coop com desconto automático na ficha corrida?"
                className="min-h-[100px]"
              />
            </FormField>
            <FormField label="Observações (reunião, contexto, orientações)">
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Ex.: Reunião online para esclarecimentos. Deliberação formal via aplicativo HB Cooperativas."
              />
            </FormField>
            <FormField label="Reunião online — WhatsApp (link ou identificação do grupo)">
              <Input
                value={reuniaoWhatsapp}
                onChange={(e) => setReuniaoWhatsapp(e.target.value)}
                placeholder="Ex.: https://chat.whatsapp.com/... ou nome do grupo"
              />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Horário início (reunião)">
                <Input type="time" value={reuniaoHorarioInicio} onChange={(e) => setReuniaoHorarioInicio(e.target.value)} />
              </FormField>
              <FormField label="Horário fim (reunião)">
                <Input type="time" value={reuniaoHorarioFim} onChange={(e) => setReuniaoHorarioFim(e.target.value)} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Data de início">
                <Input type="date" value={inicioEm} onChange={(e) => setInicioEm(e.target.value)} />
              </FormField>
              <FormField label="Data de fim">
                <Input type="date" value={fimEm} onChange={(e) => setFimEm(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Quem pode votar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    escopoEleitoral === "todos"
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="escopoEleitoral"
                    checked={escopoEleitoral === "todos"}
                    onChange={() => setEscopoEleitoral("todos")}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">Todos os cooperados</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Cada cooperado ativo poderá votar e assinar no app.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    escopoEleitoral === "diretoria"
                      ? "border-purple-400 bg-purple-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="escopoEleitoral"
                    checked={escopoEleitoral === "diretoria"}
                    onChange={() => setEscopoEleitoral("diretoria")}
                    className="mt-1 text-purple-700 focus:ring-purple-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">Somente diretoria</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Apenas cooperados marcados como diretoria em Cooperados verão a votação.
                    </span>
                  </span>
                </label>
              </div>
            </FormField>
            <Button type="button" onClick={handleCriar} disabled={syncing}>
              <Plus size={18} /> Salvar pauta (rascunho)
            </Button>
          </div>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600 flex items-center gap-2">
          <Vote size={18} /> Pautas e acompanhamento
        </h2>

        {resumos.length === 0 && (
          <Card>
            <p className="text-center text-gray-500 py-10">Nenhuma pauta cadastrada ainda.</p>
          </Card>
        )}

        {resumos.map((resumo) => {
          if (!resumo) return null;
          const { pauta, totalVotos, totalElegiveis, votosSim, votosNao, votosAbstencao, pctSim, pctNao, pctAbstencao, todosVotaram, pendentes, votos, podePublicarResultado } = resumo;
          const pctParticipacao =
            totalElegiveis > 0 ? Math.round((totalVotos / totalElegiveis) * 1000) / 10 : 0;

          return (
            <Card key={pauta.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={pauta.status === "aberta" ? "aberta" : pauta.status} />
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        getEscopoEleitoralPauta(pauta) === "diretoria"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-indigo-100 text-indigo-800"
                      }`}
                    >
                      {labelEscopoEleitoral(getEscopoEleitoralPauta(pauta))}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 mt-2 text-lg leading-snug">{pauta.texto}</p>
                  {pauta.observacao?.trim() && (
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{pauta.observacao.trim()}</p>
                  )}
                  {(pauta.reuniaoWhatsapp || pauta.reuniaoHorarioInicio || pauta.reuniaoHorarioFim) && (
                    <p className="text-xs text-indigo-700 mt-2">
                      {pauta.reuniaoWhatsapp ? `WhatsApp: ${pauta.reuniaoWhatsapp}` : ""}
                      {pauta.reuniaoHorarioInicio || pauta.reuniaoHorarioFim
                        ? ` · Reunião: ${pauta.reuniaoHorarioInicio ?? "—"} às ${pauta.reuniaoHorarioFim ?? "—"}`
                        : ""}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} /> {formatDate(pauta.inicioEm)} → {formatDate(pauta.fimEm)}
                    </span>
                    {pauta.criadoPorNome && <span>Por {pauta.criadoPorNome}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pauta.status === "rascunho" && check("votacoes", "edit") && (
                    <>
                      <Button type="button" size="sm" onClick={() => handleAbrir(pauta.id)} disabled={syncing}>
                        <Send size={16} /> Lançar enquete
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => handleExcluirRascunho(pauta.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </>
                  )}
                  {pauta.status === "aberta" && podePublicarResultado && check("votacoes", "edit") && (
                    <Button type="button" size="sm" onClick={() => handlePublicarResultado(pauta.id)} disabled={syncing}>
                      <Megaphone size={16} /> Lançar resultado
                    </Button>
                  )}
                  {pauta.status !== "rascunho" && totalVotos > 0 && check("votacoes", "view") && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleBaixarAta(pauta.id)}
                      disabled={gerandoPdf === pauta.id}
                    >
                      <FileDown size={16} /> Baixar ata oficial
                    </Button>
                  )}
                </div>
              </div>

              {pauta.status !== "rascunho" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                    <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                      <p className="text-xs text-green-800 font-medium">SIM</p>
                      <p className="text-2xl font-bold text-green-900 tabular-nums">{votosSim}</p>
                      <p className="text-xs text-green-700">{pctSim.toLocaleString("pt-BR")}%</p>
                    </div>
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
                      <p className="text-xs text-red-800 font-medium">NÃO</p>
                      <p className="text-2xl font-bold text-red-900 tabular-nums">{votosNao}</p>
                      <p className="text-xs text-red-700">{pctNao.toLocaleString("pt-BR")}%</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
                      <p className="text-xs text-gray-700 font-medium">ABST.</p>
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">{votosAbstencao}</p>
                      <p className="text-xs text-gray-600">{pctAbstencao.toLocaleString("pt-BR")}%</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
                      <p className="text-xs text-gray-600 font-medium flex items-center justify-center gap-1">
                        <Users size={12} /> Votos
                      </p>
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {totalVotos}/{totalElegiveis}
                      </p>
                      <p className="text-xs text-gray-500">{pctParticipacao.toLocaleString("pt-BR")}% participação</p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-center">
                      <p className="text-xs text-indigo-800 font-medium">Situação</p>
                      <p className="text-sm font-bold text-indigo-900 mt-2 leading-tight">
                        {todosVotaram ? "Todos votaram" : pendentes.length > 0 ? `${pendentes.length} pendente(s)` : "Aguardando"}
                      </p>
                    </div>
                  </div>

                  {todosVotaram && pauta.status === "aberta" && (
                    <AlertBanner variant="info" title="Votação completa">
                      <p>
                        {getEscopoEleitoralPauta(pauta) === "diretoria"
                          ? "Todos os membros da diretoria registraram voto. Você pode publicar o resultado para o mural."
                          : "Todos os cooperados registraram voto. Você pode publicar o resultado para o mural."}
                      </p>
                    </AlertBanner>
                  )}

                  {votos.length > 0 && (
                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Votos registrados</p>
                      <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto rounded-lg border border-gray-100">
                        {votos.map((v) => (
                          <li key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-gray-800 truncate pr-2">{v.cooperadoNome}</span>
                            <span
                              className={
                                v.voto === "sim"
                                  ? "font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded"
                                  : v.voto === "nao"
                                    ? "font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded"
                                    : "font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded"
                              }
                            >
                              {labelVoto(v.voto)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {votos.length > 0 && check("votacoes", "view") && (
                    <div className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Ata de deliberação (PDF)</p>
                        <p className="text-xs text-emerald-800 mt-1">
                          Documento profissional com dados cadastrais, voto e assinatura manuscrita de cada cooperado participante.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleBaixarAta(pauta.id)}
                        disabled={gerandoPdf === pauta.id}
                        className="shrink-0"
                      >
                        <FileDown size={18} /> {gerandoPdf === pauta.id ? "Gerando…" : "Baixar PDF"}
                      </Button>
                    </div>
                  )}

                  {pendentes.length > 0 && pauta.status === "aberta" && (
                    <p className="text-xs text-gray-500 mt-3">
                      Aguardando: {pendentes.slice(0, 8).map((p) => p.nome.split(" ")[0]).join(", ")}
                      {pendentes.length > 8 ? ` e mais ${pendentes.length - 8}…` : ""}
                    </p>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
