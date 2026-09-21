"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TrendingUp, TrendingDown, Wallet, Send, Pencil, Trash2, FileText, Search } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { canUser } from "@/permissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import {
  ensureControleAnualLivroCaixa,
  completarLancamentosContabeisPagamentos,
  confirmarEncerramentoAnoLivroCaixaContador,
  criarLancamentoManual,
  atualizarLancamentoManual,
  excluirLancamentoLivroCaixa,
  findLancamentosPorSequencia,
  formatNumeroSequenciaExibicao,
  getControleAnualLivroCaixa,
  isLancamentoManualEditavel,
  isLancamentoSemSequenciaLegado,
  isOrigemRetencaoContabil,
  mesesLivroCaixa,
  parseNumeroSequenciaInput,
  podeExcluirLancamentoLivroCaixa,
  resumoLivroCaixa,
  resumoLivroCaixaGeral,
  solicitarEncerramentoAnoLivroCaixa,
} from "@/services/livroCaixaService";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { gerarRelatorioLivroCaixaDiaHtml } from "@/utils/livroCaixaRelatorioHtml";
import type { LivroCaixaLancamento } from "@/types";
import { imprimirDocumentoHtml } from "@/utils/relatorioHtml";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import type { LivroCaixaOrigem, LivroCaixaTipo, Action, Resource } from "@/types";

const ORIGEM_LABELS: Record<LivroCaixaOrigem, string> = {
  manual: "Manual",
  mensalidade: "Mensalidade (PIX)",
  mensalidade_ficha: "Mensalidade na ficha",
  taxa_cooperativa: "Taxa cooperativa (5%)",
  desconto_ficha: "Desconto retido na ficha",
  pagamento_cooperado: "Pagamento cooperado",
  credito_avulso: "Crédito avulso",
  debito_avulso: "Débito avulso",
  pnae: "PNAE / contrato",
  prestacao_contas: "Prestação de contas",
  hb_app_repasse: `Repasse HB HB Créditos (${CONTA_COOP_DESCONTO_SPLIT.appPercent}%)`,
  outro: "Outro",
};

export default function LivroCaixaPage() {
  const data = useAppData();
  const { user, accountUser } = useAuth();
  const permUser = accountUser ?? user;
  const router = useRouter();
  const coopId =
    (accountUser ?? user) && data ? getUserCooperativaId(accountUser ?? user!, data) : undefined;

  const check = (resource: Resource, action: Action) => {
    if (!permUser) return false;
    return canUser(permUser, resource, action);
  };
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [modalOpen, setModalOpen] = useState(false);
  const [tipo, setTipo] = useState<LivroCaixaTipo>("credito");
  const [valor, setValor] = useState("");
  const [historico, setHistorico] = useState("");
  const [dataLanc, setDataLanc] = useState(new Date().toISOString().split("T")[0]);
  const [origem, setOrigem] = useState<LivroCaixaOrigem>("credito_avulso");
  const [publicando, setPublicando] = useState(false);
  const [editing, setEditing] = useState<LivroCaixaLancamento | null>(null);
  const [buscaSequencia, setBuscaSequencia] = useState("");
  const [destaqueSeqId, setDestaqueSeqId] = useState<string | null>(null);
  const [dataRelatorio, setDataRelatorio] = useState(new Date().toISOString().split("T")[0]);
  const [incluirFichaRelatorio, setIncluirFichaRelatorio] = useState(false);
  const [encBackupOk, setEncBackupOk] = useState(false);
  const [encRelatoriosOk, setEncRelatoriosOk] = useState(false);

  const resetForm = () => {
    setTipo("credito");
    setValor("");
    setHistorico("");
    setDataLanc(new Date().toISOString().split("T")[0]);
    setOrigem("credito_avulso");
    setEditing(null);
  };

  const openNovo = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditar = (l: LivroCaixaLancamento) => {
    setEditing(l);
    setTipo(l.tipo);
    setValor(String(l.valor));
    setHistorico(l.historico);
    setDataLanc(l.data);
    setOrigem(l.origem);
    setModalOpen(true);
  };

  useEffect(() => {
    if (permUser && !check("livro_caixa", "view")) router.replace("/dashboard");
  }, [permUser, router]);

  useEffect(() => {
    if (!data || !coopId) return;
    let updated = completarLancamentosContabeisPagamentos(data, coopId);
    updated = ensureControleAnualLivroCaixa(updated, coopId);
    if (updated !== data) updateData(() => updated);
  }, [data, coopId]);

  const meses = useMemo(() => (data && coopId ? mesesLivroCaixa(data, coopId) : [getCurrentMesReferencia()]), [data, coopId]);
  const resumoMes = useMemo(
    () =>
      data && coopId
        ? resumoLivroCaixa(data, coopId, mes)
        : { saldo: 0, saldoCaixaEfetivo: 0, totalCreditos: 0, totalDebitos: 0, totalCreditosRetencao: 0, lancamentos: [] },
    [data, coopId, mes]
  );
  const resumoGeral = useMemo(
    () =>
      data && coopId
        ? resumoLivroCaixaGeral(data, coopId)
        : { saldo: 0, saldoCaixaEfetivo: 0, totalCreditos: 0, totalDebitos: 0, totalCreditosRetencao: 0, lancamentos: [] },
    [data, coopId]
  );

  const controleAnual = useMemo(
    () => (data && coopId ? getControleAnualLivroCaixa(data, coopId) : undefined),
    [data, coopId]
  );

  if (!data || !permUser || !coopId) return null;

  const coopNome = data.cooperativas.find((c) => c.id === coopId)?.nome ?? "Cooperativa";
  const isContador = permUser.role === "contador";
  const podeEncerrarResponsavel =
    permUser.role === "admin" || permUser.role === "tesoureiro" || permUser.role === "responsavel";

  const canEdit = check("livro_caixa", "create");
  const canEditLancamento = check("livro_caixa", "edit");
  const canDeleteLancamento = check("livro_caixa", "delete");

  const salvarLancamento = () => {
    const v = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0 || !historico.trim()) return;

    if (editing) {
      updateData((d) => {
        const next = atualizarLancamentoManual(d, coopId, editing.id, {
          tipo,
          valor: v,
          historico,
          data: dataLanc,
          origem,
        });
        if (next === d) return d;
        return addAuditEntry(next, {
          entityType: "financeiro",
          entityId: editing.id,
          action: "editar",
          userId: permUser.id,
          userName: permUser.name,
          changes: `Livro caixa · ${tipo} ${formatCurrency(v)} · ${historico.trim().slice(0, 80)}`,
        });
      });
    } else {
      updateData((d) => {
        const next = criarLancamentoManual(d, coopId, tipo, v, historico, {
          data: dataLanc,
          origem,
          responsavel: permUser.name,
        });
        return addAuditEntry(next, {
          entityType: "financeiro",
          entityId: coopId,
          action: "criar",
          userId: permUser.id,
          userName: permUser.name,
          changes: `Livro caixa · ${tipo} ${formatCurrency(v)}`,
        });
      });
    }

    setModalOpen(false);
    resetForm();
  };

  const excluirLancamento = (l: LivroCaixaLancamento) => {
    if (!canDeleteLancamento || !podeExcluirLancamentoLivroCaixa(l)) return;
    const legado = isLancamentoSemSequenciaLegado(l) && !isLancamentoManualEditavel(l);
    const msg = legado
      ? `Remover lançamento antigo (sem número de sequência)?\n\n${l.historico}\n${formatCurrency(l.valor)}`
      : `Remover este lançamento do livro caixa?\n\n${l.historico}\n${formatCurrency(l.valor)}`;
    if (!confirm(msg)) return;
    updateData((d) => {
      const next = excluirLancamentoLivroCaixa(d, coopId, l.id);
      if (next === d) return d;
      return addAuditEntry(next, {
        entityType: "financeiro",
        entityId: l.id,
        action: "excluir",
        userId: permUser.id,
        userName: permUser.name,
        changes: `Livro caixa removido · ${l.historico.slice(0, 80)}`,
      });
    });
  };

  const irParaSequencia = () => {
    const n = parseNumeroSequenciaInput(buscaSequencia);
    if (n == null) {
      alert("Informe um número de sequência válido (ex.: 1, 01 ou 10).");
      return;
    }
    const linhas = findLancamentosPorSequencia(data, coopId, n, controleAnual?.anoLivro);
    if (linhas.length === 0) {
      alert(`Nenhum lançamento com sequência ${n} no ano ${controleAnual?.anoLivro ?? "—"}.`);
      return;
    }
    const principal =
      linhas.find((l) => isLancamentoManualEditavel(l)) ??
      linhas.find((l) => l.origem === "pagamento_cooperado") ??
      linhas[0];
    if (principal.mesReferencia !== mes) setMes(principal.mesReferencia);
    setDestaqueSeqId(principal.id);
    if (isLancamentoManualEditavel(principal) && canEditLancamento) {
      openEditar(principal);
    } else {
      alert(
        `Sequência ${formatNumeroSequenciaExibicao(n)} · ${linhas.length} linha(s). Lançamento automático — somente leitura.`
      );
    }
  };

  const imprimirRelatorioDia = () => {
    const html = gerarRelatorioLivroCaixaDiaHtml(data, coopId, coopNome, dataRelatorio, {
      incluirExtratoFicha: incluirFichaRelatorio,
    });
    imprimirDocumentoHtml(html);
  };

  const solicitarEncerramento = () => {
    if (!podeEncerrarResponsavel || !controleAnual) return;
    if (!encBackupOk || !encRelatoriosOk) {
      alert("Marque backup e relatórios impressos antes de solicitar o encerramento.");
      return;
    }
    if (
      !confirm(
        `Solicitar encerramento do livro caixa ${controleAnual.anoLivro}? O contador precisará confirmar no app para reiniciar a sequência em ${controleAnual.anoLivro + 1}.`
      )
    ) {
      return;
    }
    updateData((d) => {
      const next = solicitarEncerramentoAnoLivroCaixa(d, coopId, permUser, {
        anoEncerrado: controleAnual.anoLivro,
        backupConfirmado: encBackupOk,
        relatoriosImpressosConfirmados: encRelatoriosOk,
      });
      if (next === d) return d;
      return addAuditEntry(next, {
        entityType: "financeiro",
        entityId: coopId,
        action: "editar",
        userId: permUser.id,
        userName: permUser.name,
        changes: `Livro caixa · encerramento ${controleAnual.anoLivro} solicitado (aguarda contador)`,
      });
    });
  };

  const confirmarEncerramentoContador = () => {
    if (!isContador || !controleAnual?.encerramentoPendente) return;
    const p = controleAnual.encerramentoPendente;
    if (
      !confirm(
        `Confirmar encerramento do ano ${p.anoEncerrado}? Próximo livro: ano ${p.novoAnoLivro}, sequência reinicia em 1.`
      )
    ) {
      return;
    }
    updateData((d) => {
      const next = confirmarEncerramentoAnoLivroCaixaContador(d, coopId, user);
      if (next === d) return d;
      return addAuditEntry(next, {
        entityType: "financeiro",
        entityId: coopId,
        action: "aprovar",
        userId: permUser.id,
        userName: permUser.name,
        changes: `Livro caixa · ano ${p.anoEncerrado} encerrado · contador confirmou`,
      });
    });
  };

  const publicar = async () => {
    setPublicando(true);
    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Livro caixa"
        subtitle={
          controleAnual
            ? `Ano-livro ${controleAnual.anoLivro} · próximo nº ${controleAnual.proximoSequencia}`
            : "Movimentos automáticos, retenções contábeis e lançamentos avulsos"
        }
        action={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void publicar()} disabled={publicando}>
                <Send size={16} /> {publicando ? "Enviando…" : "Sincronizar"}
              </Button>
              <Button onClick={openNovo}>
                <Plus size={16} /> Lançamento
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5 shadow-lg">
          <Wallet size={24} className="opacity-90 mb-2" />
          <p className="text-emerald-100 text-sm">Saldo caixa efetivo</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(resumoGeral.saldoCaixaEfetivo)}</p>
          <p className="text-xs text-emerald-100/80 mt-2">Exclui retenções contábeis da ficha</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
          <Wallet size={22} className="text-slate-600 mb-2" />
          <p className="text-sm text-slate-700">Saldo contábil geral</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(resumoGeral.saldo)}</p>
          <p className="text-xs text-slate-500 mt-2">Inclui taxa 5% e descontos na ficha</p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50/80 p-5">
          <TrendingUp size={22} className="text-green-700 mb-2" />
          <p className="text-sm text-green-800">Entradas · {formatMesReferencia(mes)}</p>
          <p className="text-2xl font-bold text-green-900">{formatCurrency(resumoMes.totalCreditos)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5">
          <TrendingDown size={22} className="text-red-700 mb-2" />
          <p className="text-sm text-red-800">Saídas · {formatMesReferencia(mes)}</p>
          <p className="text-2xl font-bold text-red-900">{formatCurrency(resumoMes.totalDebitos)}</p>
        </div>
      </div>

      <Card title="Conferência rápida">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <FormField label="Ir para sequência" hint="Aceita 1, 01, 010… Avulsos abrem para editar; automáticos só leitura.">
              <div className="flex gap-2">
                <Input
                  value={buscaSequencia}
                  onChange={(e) => setBuscaSequencia(e.target.value)}
                  placeholder="Nº"
                  className="max-w-[120px]"
                />
                <Button type="button" variant="secondary" onClick={irParaSequencia}>
                  <Search size={16} /> Localizar
                </Button>
              </div>
            </FormField>
          </div>
          <div className="space-y-3">
            <FormField label="Relatório do dia">
              <Input type="date" value={dataRelatorio} onChange={(e) => setDataRelatorio(e.target.value)} />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={incluirFichaRelatorio}
                onChange={(e) => setIncluirFichaRelatorio(e.target.checked)}
              />
              Incluir extrato da ficha corrida (pagamentos do dia)
            </label>
            <Button type="button" variant="secondary" onClick={imprimirRelatorioDia}>
              <FileText size={16} /> Imprimir / PDF do dia
            </Button>
          </div>
        </div>
      </Card>

      {(podeEncerrarResponsavel || isContador) && controleAnual && (
        <Card title={`Encerramento anual · ${controleAnual.anoLivro}`}>
          {controleAnual.encerramentoPendente ? (
            <div className="space-y-3 text-sm">
              <p>
                Encerramento solicitado por <strong>{controleAnual.encerramentoPendente.responsavelNome}</strong> em{" "}
                {formatDate(controleAnual.encerramentoPendente.responsavelConfirmadoEm.split("T")[0])}. Aguardando
                confirmação do contador.
              </p>
              {isContador && (
                <Button onClick={confirmarEncerramentoContador}>Confirmar encerramento (contador)</Button>
              )}
            </div>
          ) : podeEncerrarResponsavel ? (
            <div className="space-y-3 text-sm">
              <p>Após backup e impressão dos relatórios, solicite o encerramento. O contador confirma no app para reiniciar a sequência.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={encBackupOk} onChange={(e) => setEncBackupOk(e.target.checked)} />
                Backup realizado
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={encRelatoriosOk} onChange={(e) => setEncRelatoriosOk(e.target.checked)} />
                Relatórios necessários impressos/exportados
              </label>
              <Button variant="secondary" onClick={solicitarEncerramento}>
                Solicitar encerramento do ano
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhum encerramento pendente.</p>
          )}
        </Card>
      )}

      <Card title={`Movimentos · ${formatMesReferencia(mes)}`}>
        <div className="mb-4">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-xs">
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Ordem por número de sequência (ano-livro {controleAnual?.anoLivro ?? "—"}). Pagamentos a cooperados geram saída (líquido) e créditos contábeis de retenção.
          Mensalidades confirmadas via PIX entram como entrada efetiva. Lançamentos automáticos são somente leitura; avulsos podem ser editados ou excluídos.
          Lançamentos antigos sem número podem ser excluídos para limpeza (permissão de exclusão).
        </p>
        <div className="space-y-2">
          {resumoMes.lancamentos.map((l) => (
            <div
              key={l.id}
              id={`lc-row-${l.id}`}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl border ${
                destaqueSeqId === l.id ? "ring-2 ring-amber-400" : ""
              } ${
                l.tipo === "credito"
                  ? isOrigemRetencaoContabil(l.origem)
                    ? "border-blue-100 bg-blue-50/40"
                    : "border-green-100 bg-green-50/40"
                  : "border-red-100 bg-red-50/40"
              }`}
            >
              <div className="min-w-0 flex gap-3">
                <div className="shrink-0 w-10 text-center font-mono font-bold text-gray-700 pt-0.5">
                  {formatNumeroSequenciaExibicao(l.numeroSequencia)}
                </div>
                <div>
                <p className="font-medium text-gray-900">{l.historico}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDate(l.data)} · {ORIGEM_LABELS[l.origem]}
                  {isOrigemRetencaoContabil(l.origem) ? " · retenção contábil" : ""}
                  {l.responsavel ? ` · ${l.responsavel}` : ""}
                </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p
                  className={`text-lg font-bold ${
                    l.tipo === "credito"
                      ? isOrigemRetencaoContabil(l.origem)
                        ? "text-blue-700"
                        : "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {l.tipo === "credito" ? "+" : "−"} {formatCurrency(l.valor)}
                </p>
                {canEditLancamento && isLancamentoManualEditavel(l) && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => openEditar(l)}
                      className="p-2 rounded-lg hover:bg-white/80 text-gray-600"
                      title="Editar lançamento manual"
                    >
                      <Pencil size={16} />
                    </button>
                    {canDeleteLancamento && (
                      <button
                        type="button"
                        onClick={() => excluirLancamento(l)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                        title="Excluir lançamento manual"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
                {canDeleteLancamento && !isLancamentoManualEditavel(l) && podeExcluirLancamentoLivroCaixa(l) && (
                  <button
                    type="button"
                    onClick={() => excluirLancamento(l)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                    title="Excluir lançamento legado (sem sequência)"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {resumoMes.lancamentos.length === 0 && (
            <p className="text-center text-gray-500 py-8">Nenhum lançamento neste mês.</p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Retenções contábeis no mês</span>
            <span className="text-blue-700 font-semibold">{formatCurrency(resumoMes.totalCreditosRetencao)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo caixa efetivo do mês</span>
            <span className={resumoMes.saldoCaixaEfetivo >= 0 ? "text-green-700" : "text-red-700"}>
              {formatCurrency(resumoMes.saldoCaixaEfetivo)}
            </span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Saldo contábil do mês</span>
            <span className={resumoMes.saldo >= 0 ? "text-green-700" : "text-red-700"}>{formatCurrency(resumoMes.saldo)}</span>
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editing ? `Editar lançamento · nº ${formatNumeroSequenciaExibicao(editing.numeroSequencia)}` : "Novo lançamento"}
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Tipo">
            <Select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as LivroCaixaTipo;
                setTipo(t);
                setOrigem(t === "credito" ? "credito_avulso" : "debito_avulso");
              }}
            >
              <option value="credito">Crédito (entrada)</option>
              <option value="debito">Débito (saída)</option>
            </Select>
          </FormField>
          <FormField label="Origem">
            <Select value={origem} onChange={(e) => setOrigem(e.target.value as LivroCaixaOrigem)}>
              {tipo === "credito" ? (
                <>
                  <option value="credito_avulso">Crédito avulso</option>
                  <option value="pnae">PNAE / contrato</option>
                  <option value="outro">Outro</option>
                </>
              ) : (
                <>
                  <option value="debito_avulso">Débito avulso</option>
                  <option value="outro">Outro</option>
                </>
              )}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Valor (R$)" required>
              <Input type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} />
            </FormField>
            <FormField label="Data">
              <Input type="date" value={dataLanc} onChange={(e) => setDataLanc(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Histórico" required>
            <Textarea value={historico} onChange={(e) => setHistorico(e.target.value)} rows={3} placeholder="Ex: Repasse PNAE contrato escola X" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setModalOpen(false);
              resetForm();
            }}
          >
            Cancelar
          </Button>
          <Button onClick={salvarLancamento}>{editing ? "Salvar alterações" : "Salvar"}</Button>
        </div>
      </Modal>
    </div>
  );
}
