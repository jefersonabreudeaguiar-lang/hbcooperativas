"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TrendingUp, TrendingDown, Wallet, Send, FileText, Search, Download } from "lucide-react";
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
import { requestAppSyncLight } from "@/services/syncRequest";
import {
  ensureControleAnualLivroCaixa,
  reconciliarLivroCaixaContabilCooperativa,
  confirmarEncerramentoAnoLivroCaixaContador,
  criarLancamentoManual,
  atualizarLancamentoManual,
  excluirLancamentoLivroCaixa,
  findLancamentosPorSequencia,
  formatNumeroSequenciaExibicao,
  getControleAnualLivroCaixa,
  isLancamentoManualEditavel,
  isLancamentoSemSequenciaLegado,
  mesesLivroCaixa,
  mesReferenciaInicialLivroCaixa,
  parseNumeroSequenciaInput,
  podeExcluirLancamentoLivroCaixa,
  resumoLivroCaixa,
  solicitarEncerramentoAnoLivroCaixa,
} from "@/services/livroCaixaService";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  gerarRelatorioLivroCaixaPlanilhaHtml,
  type LivroCaixaRelatorioPlanilhaOpts,
} from "@/utils/livroCaixaRelatorioHtml";
import {
  buildPlanilhaLinhas,
  lancamentosLivroCaixaPeriodo,
  saldoLivroCaixaAntesData,
  saldoLivroCaixaAntesMes,
} from "@/services/livroCaixaPlanilha";
import { LivroCaixaPlanilhaTable } from "@/components/livro-caixa/LivroCaixaPlanilhaTable";
import { LivroCaixaResumoCooperadosTable } from "@/components/livro-caixa/LivroCaixaResumoCooperadosTable";
import {
  calcularResumoOperacionalLivroCaixa,
  calcularResumoPorCooperadoLivroCaixa,
} from "@/services/livroCaixaResumoCooperado";
import type { LivroCaixaLancamento } from "@/types";
import { imprimirDocumentoHtml } from "@/utils/relatorioHtml";
import {
  buildLivroCaixaPacoteContabil,
  nomeZipPacoteContabil,
} from "@/services/livroCaixaExportContabil";
import { downloadLivroCaixaPacoteContabilZip } from "@/utils/livroCaixaExportDownload";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { LivroCaixaOrigem, LivroCaixaTipo, Action, Resource } from "@/types";

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
  const hojeIso = new Date().toISOString().split("T")[0];
  const inicioMesIso = `${hojeIso.slice(0, 8)}01`;
  const [modoVisualizacao, setModoVisualizacao] = useState<"mes" | "periodo">("mes");
  const [filtroDe, setFiltroDe] = useState(inicioMesIso);
  const [filtroAte, setFiltroAte] = useState(hojeIso);
  const [relatorioModo, setRelatorioModo] = useState<LivroCaixaRelatorioPlanilhaOpts["modo"]>("periodo");
  const [dataRelatorio, setDataRelatorio] = useState(hojeIso);
  const [relatorioDe, setRelatorioDe] = useState(inicioMesIso);
  const [relatorioAte, setRelatorioAte] = useState(hojeIso);
  const [incluirFichaRelatorio, setIncluirFichaRelatorio] = useState(false);
  const [incluirSobrasRelatorio, setIncluirSobrasRelatorio] = useState(false);
  const [incluirAbertosRelatorio, setIncluirAbertosRelatorio] = useState(false);
  const [exportandoContabil, setExportandoContabil] = useState(false);
  const [somenteMesAbertoRelatorio, setSomenteMesAbertoRelatorio] = useState(false);
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
    requestAppSyncLight();
  }, []);

  const dataCaixa = useMemo(() => {
    if (!data || !coopId) return null;
    return reconciliarLivroCaixaContabilCooperativa(data, coopId);
  }, [data, coopId]);

  useEffect(() => {
    if (!dataCaixa || !data || !coopId) return;
    if (dataCaixa !== data) updateData(() => dataCaixa);
  }, [data, dataCaixa, coopId]);

  const meses = useMemo(
    () => (dataCaixa && coopId ? mesesLivroCaixa(dataCaixa, coopId) : [getCurrentMesReferencia()]),
    [dataCaixa, coopId]
  );
  const resumoMes = useMemo(
    () =>
      dataCaixa && coopId
        ? resumoLivroCaixa(dataCaixa, coopId, mes)
        : { saldo: 0, saldoCaixaEfetivo: 0, totalCreditos: 0, totalDebitos: 0, totalCreditosRetencao: 0, lancamentos: [] },
    [dataCaixa, coopId, mes]
  );
  const lancamentosVisao = useMemo(() => {
    if (!dataCaixa || !coopId) return [];
    if (modoVisualizacao === "periodo") {
      return lancamentosLivroCaixaPeriodo(dataCaixa, coopId, filtroDe, filtroAte);
    }
    return resumoMes.lancamentos;
  }, [dataCaixa, coopId, modoVisualizacao, filtroDe, filtroAte, resumoMes.lancamentos]);

  const resumoOperacional = useMemo(
    () => calcularResumoOperacionalLivroCaixa(lancamentosVisao),
    [lancamentosVisao]
  );

  const resumoPorCooperado = useMemo(() => {
    if (!dataCaixa) return [];
    return calcularResumoPorCooperadoLivroCaixa(dataCaixa, lancamentosVisao);
  }, [dataCaixa, lancamentosVisao]);

  const saldoInicialMes = useMemo(
    () => (dataCaixa && coopId ? saldoLivroCaixaAntesMes(dataCaixa, coopId, mes) : 0),
    [dataCaixa, coopId, mes]
  );

  const saldoInicialVisao = useMemo(() => {
    if (!dataCaixa || !coopId) return 0;
    if (modoVisualizacao === "periodo") return saldoLivroCaixaAntesData(dataCaixa, coopId, filtroDe);
    return saldoInicialMes;
  }, [dataCaixa, coopId, modoVisualizacao, filtroDe, saldoInicialMes]);

  const planilhaLinhas = useMemo(
    () => buildPlanilhaLinhas(lancamentosVisao, saldoInicialVisao),
    [lancamentosVisao, saldoInicialVisao]
  );

  const saldoFinalMes = useMemo(() => {
    if (planilhaLinhas.length) return planilhaLinhas[planilhaLinhas.length - 1].saldoCorrido;
    return saldoInicialMes;
  }, [planilhaLinhas, saldoInicialMes]);

  const controleAnual = useMemo(
    () => (dataCaixa && coopId ? getControleAnualLivroCaixa(dataCaixa, coopId) : undefined),
    [dataCaixa, coopId]
  );

  useEffect(() => {
    if (!dataCaixa || !coopId) return;
    if (resumoMes.lancamentos.length > 0) return;
    const preferido = mesReferenciaInicialLivroCaixa(dataCaixa, coopId);
    if (preferido !== mes) setMes(preferido);
  }, [dataCaixa, coopId, mes, resumoMes.lancamentos.length]);

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
    if (
      !confirm(
        `Apagar este lançamento avulso?\n\n${l.historico}\n${formatCurrency(l.valor)}\n\nMovimentos automáticos (PIX, pagamentos, retenções) não podem ser apagados aqui.`
      )
    ) {
      return;
    }
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
    void publicar({ force: true });
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

  const relatorioOptsAtual = (): LivroCaixaRelatorioPlanilhaOpts =>
    relatorioModo === "dia"
      ? {
          modo: "dia",
          dataIso: dataRelatorio,
          incluirExtratoFicha: incluirFichaRelatorio,
          incluirSobrasPerdas: incluirSobrasRelatorio,
          mesSobrasPerdas: mes,
          incluirValoresEmAberto: incluirAbertosRelatorio,
        }
      : relatorioModo === "periodo"
        ? {
            modo: "periodo",
            dataDe: relatorioDe,
            dataAte: relatorioAte,
            incluirSobrasPerdas: incluirSobrasRelatorio,
            mesSobrasPerdas: mes,
            incluirValoresEmAberto: incluirAbertosRelatorio,
          }
        : {
            modo: "mes",
            mesReferencia: mes,
            somenteMesEmAberto: somenteMesAbertoRelatorio,
            incluirSobrasPerdas: incluirSobrasRelatorio,
            mesSobrasPerdas: mes,
            incluirValoresEmAberto: incluirAbertosRelatorio,
          };

  const imprimirRelatorio = () => {
    const html = gerarRelatorioLivroCaixaPlanilhaHtml(data, coopId, coopNome, relatorioOptsAtual());
    imprimirDocumentoHtml(html);
  };

  const exportarPacoteContabil = async () => {
    if (!dataCaixa || !coopId) return;
    setExportandoContabil(true);
    try {
      const opts = relatorioOptsAtual();
      const cnpj =
        data.cooperativas.find((c) => c.id === coopId)?.cnpj?.trim() ||
        (await resolveCooperativaCnpj(dataCaixa, coopId, permUser)) ||
        "";
      const pacote = buildLivroCaixaPacoteContabil(dataCaixa, coopId, coopNome, cnpj, opts);
      const slug = pacote.periodoLabel.replace(/[^\dA-Za-z]+/g, "_").slice(0, 48);
      await downloadLivroCaixaPacoteContabilZip(pacote, nomeZipPacoteContabil(cnpj, slug));
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o pacote contábil. Tente novamente.");
    } finally {
      setExportandoContabil(false);
    }
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
      const next = confirmarEncerramentoAnoLivroCaixaContador(d, coopId, permUser);
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

  const publicar = async (opts?: { force?: boolean }) => {
    setPublicando(true);
    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, permUser);
      if (cnpj) {
        await pushOperacionalToCloud(cnpj, d, coopId, {
          authoritative: true,
          forceOperacionalPush: opts?.force,
        });
      }
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Livro caixa"
        subtitle={
          controleAnual
            ? `Ano-livro ${controleAnual.anoLivro} · próximo nº ${controleAnual.proximoSequencia} · v${APP_BUILD_VERSION}`
            : `Movimentos automáticos e avulsos · v${APP_BUILD_VERSION}`
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

      <Card title="Período da visão">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <FormField label="Exibir totais e cooperados">
            <Select
              value={modoVisualizacao}
              onChange={(e) => setModoVisualizacao(e.target.value as "mes" | "periodo")}
              className="max-w-xs"
            >
              <option value="mes">Mês de referência</option>
              <option value="periodo">Data início e fim</option>
            </Select>
          </FormField>
          {modoVisualizacao === "mes" ? (
            <FormField label="Mês">
              <Select value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-xs">
                {meses.map((m) => (
                  <option key={m} value={m}>{formatMesReferencia(m)}</option>
                ))}
              </Select>
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-3 flex-1 max-w-md">
              <FormField label="Início">
                <Input type="date" value={filtroDe} onChange={(e) => setFiltroDe(e.target.value)} />
              </FormField>
              <FormField label="Fim">
                <Input type="date" value={filtroAte} onChange={(e) => setFiltroAte(e.target.value)} />
              </FormField>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Os três totais acima somam todo o livro caixa no período escolhido (automáticos e avulsos). Saldo = créditos
          − débitos. A tabela por cooperado detalha taxa, mensalidade e PIX; a planilha abaixo mostra o saldo corrido.
        </p>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-green-200 bg-green-50/90 p-5 shadow-sm">
          <TrendingUp size={22} className="text-green-700 mb-2" />
          <p className="text-sm text-green-800 font-medium">Créditos (total do período)</p>
          <p className="text-3xl font-bold text-green-900 mt-1">{formatCurrency(resumoOperacional.totalCreditos)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/90 p-5 shadow-sm">
          <TrendingDown size={22} className="text-red-700 mb-2" />
          <p className="text-sm text-red-800 font-medium">Débitos (total do período)</p>
          <p className="text-3xl font-bold text-red-900 mt-1">{formatCurrency(resumoOperacional.totalDebitos)}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-5 shadow-lg">
          <Wallet size={24} className="opacity-90 mb-2" />
          <p className="text-slate-200 text-sm">Saldo (créditos − débitos)</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(resumoOperacional.saldo)}</p>
          <p className="text-xs text-slate-300 mt-2">
            Saldo corrido na planilha (com saldo anterior): {formatCurrency(saldoFinalMes)}
          </p>
        </div>
      </div>

      <Card title="Resumo por cooperado">
        <LivroCaixaResumoCooperadosTable linhas={resumoPorCooperado} />
      </Card>

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
            <FormField label="Emissão do relatório (PDF / ZIP)">
              <Select
                value={relatorioModo}
                onChange={(e) => setRelatorioModo(e.target.value as LivroCaixaRelatorioPlanilhaOpts["modo"])}
              >
                <option value="periodo">Intervalo — data início e fim</option>
                <option value="mes">Planilha do mês selecionado</option>
                <option value="dia">Um dia</option>
              </Select>
            </FormField>
            {relatorioModo === "periodo" && (
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                onClick={() => {
                  setRelatorioDe(filtroDe);
                  setRelatorioAte(filtroAte);
                }}
              >
                Usar mesmo período da visão acima
              </Button>
            )}
            {relatorioModo === "dia" && (
              <FormField label="Data">
                <Input type="date" value={dataRelatorio} onChange={(e) => setDataRelatorio(e.target.value)} />
              </FormField>
            )}
            {relatorioModo === "periodo" && (
              <div className="grid grid-cols-2 gap-2">
                <FormField label="De">
                  <Input type="date" value={relatorioDe} onChange={(e) => setRelatorioDe(e.target.value)} />
                </FormField>
                <FormField label="Até">
                  <Input type="date" value={relatorioAte} onChange={(e) => setRelatorioAte(e.target.value)} />
                </FormField>
              </div>
            )}
            {relatorioModo === "mes" && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={somenteMesAbertoRelatorio}
                  onChange={(e) => setSomenteMesAbertoRelatorio(e.target.checked)}
                />
                Filtrar só lançamentos do mês em aberto (operacional)
              </label>
            )}
            {relatorioModo === "dia" && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={incluirFichaRelatorio}
                  onChange={(e) => setIncluirFichaRelatorio(e.target.checked)}
                />
                Incluir extrato da ficha (pagamentos do dia)
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={incluirSobrasRelatorio}
                onChange={(e) => setIncluirSobrasRelatorio(e.target.checked)}
              />
              Incluir sobras e perdas do mês
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={incluirAbertosRelatorio}
                onChange={(e) => setIncluirAbertosRelatorio(e.target.checked)}
              />
              Incluir valores em aberto (a pagar cooperados, todos os meses)
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={imprimirRelatorio}>
                <FileText size={16} /> Gerar PDF / imprimir
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={exportandoContabil}
                onClick={() => void exportarPacoteContabil()}
              >
                <Download size={16} />
                {exportandoContabil ? "Gerando ZIP…" : "Exportar pacote contábil (ZIP)"}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              O ZIP contém 7 planilhas CSV (CAPA, livro caixa, eventos de pagamento, retenções/HB, conciliação,
              pendências e mapeamento de contas) para o contador.
            </p>
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

      <Card
        title={
          modoVisualizacao === "periodo"
            ? `Livro caixa · ${formatDate(filtroDe)} a ${formatDate(filtroAte)}`
            : `Livro caixa · ${formatMesReferencia(mes)}`
        }
      >
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          Ano-livro {controleAnual?.anoLivro ?? "—"} · sequência por evento. Todo pagamento confirmado pelo responsável
          gera débito automático; taxa e mensalidades na ficha entram como crédito.
        </p>
        <LivroCaixaPlanilhaTable
          linhas={planilhaLinhas}
          saldoInicial={saldoInicialVisao}
          destaqueId={destaqueSeqId}
          onEditar={openEditar}
          onExcluir={excluirLancamento}
          canEdit={canEditLancamento}
          canDelete={canDeleteLancamento}
          emptyMessage="Nenhum lançamento neste período."
        />
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
