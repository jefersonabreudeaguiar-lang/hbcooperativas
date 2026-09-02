"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Printer, FileText } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { useSyncContaCoopValorReceberCooperativa } from "@/hooks/useSyncContaCoopValorReceberCooperativa";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, FilterBar, DataTable } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import {
  getRelatorioResumoFinanceiro,
  getRelatorioEntregasPorInstituicao,
  getRelatorioEntregasPorItensPeriodoReport,
  getRelatorioPNAE,
  getRelatorioPagarCooperadoEmAbertoReport,
  getRelatorioResumoFinanceiroEmAbertoReport,
  getRelatorioMensalidadesEmAbertoConsolidadoReport,
  getTotalValoresAPagarEmAberto,
  listMesesComLancamentos,
  listarMesesComDebitoCooperativa,
  exportToCSV,
  downloadCSV,
  getRelatorioSobrasPerdas,
  getRelatorioAtingimentoCronograma,
  calcularFechamentoMensal,
} from "@/services/dashboardService";
import { calcularFechamentoMensalLive, flattenLinhasPagarCooperadoEmAberto } from "@/services/relatorioService";
import {
  baixarDocumento,
  gerarRelatorioEntregasPorItensPeriodoHtml,
  gerarRelatorioEntregasInstituicaoHtml,
  gerarRelatorioFinanceiroHtml,
  gerarRelatorioMensalidadesAbertasMesHtml,
  gerarRelatorioMensalidadesAbertasTotalHtml,
  gerarRelatorioPagarCooperadoAbertoHtml,
  gerarRelatorioResumoFinanceiroAbertoHtml,
  gerarRelatorioAtingimentoCronogramaHtml,
  gerarRelatorioSobrasPerdasHtml,
  gerarRelatorioReclamacoesHtml,
  gerarRelatorioVotacoesHtml,
  gerarRelatorioConciliacaoHtml,
  gerarRelatorioDemonstrativoPagamentosHtml,
  gerarRelatorioRazaoAnaliticoHtml,
  gerarRelatorioMapaReceitasHtml,
  gerarRelatorioExtratoContaCoopHtml,
  gerarRelatorioTrilhaAuditoriaHtml,
  gerarRelatorioParecerContabilHtml,
  gerarRelatorioFechamentoHtml,
  imprimirDocumentoHtml,
  nomeArquivoRelatorio,
} from "@/utils/relatorioHtml";
import { ModalEmitirRelatorio, buildEmissorFromUser } from "@/components/relatorios/ModalEmitirRelatorio";
import { EntregasPorItensPainel } from "@/components/relatorios/EntregasPorItensPainel";
import type { EmissorRelatorio } from "@/types";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import { getRelatorioReclamacoes } from "@/services/reclamacaoService";
import { getRelatorioVotacoes } from "@/services/votacaoService";
import {
  calcularConciliacaoMensal,
  getDemonstrativoPagamentosMes,
} from "@/services/conciliacaoMensalService";
import {
  auditLogParaExportacao,
  getExtratoContaCoopMes,
  getMapaReceitasContrato,
  getParecerContabilMes,
  getRazaoAnaliticoCooperado,
  getRazaoAnaliticoTodosCooperados,
} from "@/services/contadorRelatorioService";
import { labelUnidade } from "@/utils/unidades";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { TrilhaAuditoriaPanel } from "@/components/contador/TrilhaAuditoriaPanel";
import { hrefRelatorio } from "@/utils/relatorioRoutes";
import { isContadorRole, isResponsavelRole } from "@/permissions";
import type { UserRole } from "@/types";

type ReportAudience = "gestao" | "contador" | "ambos";

type ReportDef = {
  id: string;
  label: string;
  grupo: string;
  audience: ReportAudience;
  /** Não usa filtro de mês — consolida todos os meses com débito. */
  consolidado?: boolean;
};

const RELATORIOS: ReportDef[] = [
  { id: "resumo_financeiro", label: "Resumo Financeiro (mês)", grupo: "Financeiro", audience: "ambos" },
  { id: "resumo_financeiro_aberto", label: "Resumo Financeiro — Total em Aberto", grupo: "Financeiro", audience: "ambos", consolidado: true },
  { id: "pagar_cooperado", label: "Pagamento por cooperado (em aberto)", grupo: "Financeiro", audience: "ambos", consolidado: true },
  { id: "mensalidades_abertas", label: "Mensalidades em Aberto (mês)", grupo: "Financeiro", audience: "ambos" },
  { id: "mensalidades_abertas_total", label: "Mensalidades em Aberto — Total", grupo: "Financeiro", audience: "ambos", consolidado: true },
  { id: "cotas_abertas", label: "Cotas em Aberto", grupo: "Financeiro", audience: "ambos", consolidado: true },
  { id: "saldo_mensal", label: "Saldo Mensal da Cooperativa", grupo: "Financeiro", audience: "ambos" },
  { id: "fechamento_mensal", label: "Fechamento Mensal", grupo: "Financeiro", audience: "ambos" },
  { id: "entregas_instituicao", label: "Entregas por Instituição (mês)", grupo: "Entregas e contratos", audience: "gestao" },
  { id: "entregas_por_itens", label: "Item por mês (em aberto)", grupo: "Entregas e contratos", audience: "ambos" },
  { id: "atingimento_cronograma", label: "Atingimento do Cronograma", grupo: "Entregas e contratos", audience: "gestao" },
  { id: "vendas_pnae", label: "Vendas ao PNAE (mês)", grupo: "Entregas e contratos", audience: "gestao" },
  { id: "descontos_aplicados", label: "Descontos Aplicados (mês)", grupo: "Transparência", audience: "ambos" },
  { id: "sobras_perdas", label: "Sobras e Perdas", grupo: "Transparência", audience: "ambos" },
  { id: "historico_reclamacoes", label: "Histórico de Reclamações", grupo: "Transparência", audience: "ambos", consolidado: true },
  { id: "historico_votacoes", label: "Histórico de Votações", grupo: "Transparência", audience: "ambos", consolidado: true },
  { id: "razao_analitico", label: "R1 — Razão analítico por cooperado", grupo: "Contabilidade", audience: "contador" },
  { id: "demonstrativo_pagamentos", label: "R2 — Demonstrativo de pagamentos", grupo: "Contabilidade", audience: "contador" },
  { id: "mapa_receitas_contrato", label: "R3 — Mapa receitas por contrato", grupo: "Contabilidade", audience: "contador" },
  { id: "conciliacao_mensal", label: "R4 — Conciliação mensal", grupo: "Contabilidade", audience: "contador" },
  { id: "extrato_conta_coop", label: "R5 — Extrato Conta Coop", grupo: "Contabilidade", audience: "contador" },
  { id: "trilha_auditoria", label: "R6 — Trilha de auditoria", grupo: "Contabilidade", audience: "contador" },
  { id: "parecer_contabil", label: "R9 — Parecer contábil mensal", grupo: "Contabilidade", audience: "contador" },
];

const RELATORIOS_CONSOLIDADOS = new Set(RELATORIOS.filter((r) => r.consolidado).map((r) => r.id));
const RELATORIOS_MESES_MULTIPLOS = new Set(["entregas_por_itens"]);
/** PDF/impressão sem assinatura — só nome do responsável logado. */
const RELATORIOS_EMISSAO_SIMPLES = new Set(["pagar_cooperado", "entregas_por_itens"]);
const RELATORIOS_INSTITUICAO_DOCUMENTO = new Set(["entregas_por_itens", "pagar_cooperado", "entregas_instituicao", "atingimento_cronograma"]);

function relatorioVisivel(role: UserRole | string | undefined, r: ReportDef): boolean {
  if (!role || role === "tesoureiro" || role === "admin" || role === "presidente") return true;
  if (isContadorRole(role as UserRole)) return r.audience === "contador" || r.audience === "ambos";
  if (isResponsavelRole(role)) return r.audience === "gestao" || r.audience === "ambos";
  return true;
}

export default function RelatoriosPage() {
  const data = useAppData();
  const { user, check } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const [tipo, setTipo] = useState("resumo_financeiro");
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [cooperadoId, setCooperadoId] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [mesesEntregasItens, setMesesEntregasItens] = useState<string[]>([]);
  const [apenasPendenteItens, setApenasPendenteItens] = useState(true);
  const [modalEmissao, setModalEmissao] = useState<"pdf" | "print" | null>(null);
  const [urlSynced, setUrlSynced] = useState(false);
  const tipoAnteriorRef = useRef<string>("");

  const relatorioUsaContaCoop =
    tipo === "pagar_cooperado" || tipo === "resumo_financeiro_aberto";

  useSyncContaCoopValorReceberCooperativa(
    coopId && user && relatorioUsaContaCoop
      ? { cooperativaId: coopId, user, enabled: Boolean(data) }
      : undefined
  );

  const aplicarPadraoEntregasPorItensEmAberto = useCallback(() => {
    if (!data) return;
    const mesesAberto = listarMesesComDebitoCooperativa(data, coopId);
    setMesesEntregasItens(mesesAberto.length > 0 ? mesesAberto : [mes]);
    setApenasPendenteItens(true);
  }, [data, coopId, mes]);

  const syncRelatorioUrl = useCallback(
    (nextTipo: string, nextMes: string, nextMesesItens?: string[], nextPendenteItens?: boolean) => {
      const params = new URLSearchParams({ tipo: nextTipo });
      if (!RELATORIOS_CONSOLIDADOS.has(nextTipo) && !RELATORIOS_MESES_MULTIPLOS.has(nextTipo)) {
        params.set("mes", nextMes);
      }
      if (RELATORIOS_MESES_MULTIPLOS.has(nextTipo) && nextMesesItens?.length) {
        params.set("meses", nextMesesItens.join(","));
      }
      if (RELATORIOS_MESES_MULTIPLOS.has(nextTipo) && nextPendenteItens) {
        params.set("pendente", "1");
      }
      router.replace(`/relatorios?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    if (user && !check("relatorios", "view")) {
      router.replace("/dashboard");
    }
  }, [user, router, check]);

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    return listMesesComLancamentos(data);
  }, [data]);

  const relatoriosVisiveis = useMemo(
    () => RELATORIOS.filter((r) => relatorioVisivel(user?.role, r)),
    [user?.role]
  );

  const gruposRelatorio = useMemo(() => {
    const map = new Map<string, ReportDef[]>();
    for (const r of relatoriosVisiveis) {
      const list = map.get(r.grupo) ?? [];
      list.push(r);
      map.set(r.grupo, list);
    }
    return [...map.entries()];
  }, [relatoriosVisiveis]);

  useEffect(() => {
    if (relatoriosVisiveis.some((r) => r.id === tipo)) return;
    if (relatoriosVisiveis[0]) setTipo(relatoriosVisiveis[0].id);
  }, [relatoriosVisiveis, tipo]);

  useEffect(() => {
    if (!data || urlSynced) return;
    const qTipo = searchParams.get("tipo");
    const qMes = searchParams.get("mes");
    const qMeses = searchParams.get("meses");
    const qPendente = searchParams.get("pendente");
    if (qTipo === "entregas_por_itens_aberto" || qTipo === "pagar_cooperado_aberto") {
      setTipo(qTipo === "pagar_cooperado_aberto" ? "pagar_cooperado" : "entregas_por_itens");
      setApenasPendenteItens(true);
      if (data) setMesesEntregasItens(listarMesesComDebitoCooperativa(data, coopId));
    } else if (qTipo && relatoriosVisiveis.some((r) => r.id === qTipo)) {
      setTipo(qTipo);
      if (qTipo === "entregas_por_itens" && !qMeses && data) {
        setMesesEntregasItens(listarMesesComDebitoCooperativa(data, coopId));
        setApenasPendenteItens(true);
      }
    }
    if (qMes) setMes(qMes);
    if (qMeses) {
      setMesesEntregasItens(qMeses.split(",").filter(Boolean));
    } else if (qMes && qTipo === "entregas_por_itens") {
      setMesesEntregasItens([qMes]);
    }
    if (qPendente === "1") setApenasPendenteItens(true);
    setUrlSynced(true);
  }, [data, searchParams, relatoriosVisiveis, urlSynced, coopId]);

  useEffect(() => {
    if (!urlSynced) return;
    syncRelatorioUrl(tipo, mes, mesesEntregasItens, apenasPendenteItens);
  }, [tipo, mes, mesesEntregasItens, apenasPendenteItens, urlSynced, syncRelatorioUrl]);

  useEffect(() => {
    if (tipo !== "entregas_por_itens" || !data || !urlSynced) return;
    if (mesesEntregasItens.length > 0) return;
    aplicarPadraoEntregasPorItensEmAberto();
  }, [tipo, data, urlSynced, mesesEntregasItens.length, aplicarPadraoEntregasPorItensEmAberto]);

  useEffect(() => {
    const prev = tipoAnteriorRef.current;
    tipoAnteriorRef.current = tipo;
    if (tipo !== "entregas_por_itens" || !data) return;
    if (prev === "entregas_por_itens") return;
    if (searchParams.get("meses")) return;
    aplicarPadraoEntregasPorItensEmAberto();
  }, [tipo, data, searchParams, aplicarPadraoEntregasPorItensEmAberto]);

  const instituicoesCoop = useMemo(() => {
    if (!data) return [];
    return data.instituicoes.filter((i) => !coopId || i.cooperativaId === coopId);
  }, [data, coopId]);

  const instituicaoSelecionadaId = instituicaoId || instituicoesCoop[0]?.id || "";

  const mesesEntregasItensEfetivos = useMemo(() => {
    if (mesesEntregasItens.length > 0) return [...mesesEntregasItens].sort();
    if (data && tipo === "entregas_por_itens") {
      const abertos = listarMesesComDebitoCooperativa(data, coopId);
      if (abertos.length > 0) return abertos;
    }
    return [mes];
  }, [mesesEntregasItens, mes, data, coopId, tipo]);

  const mesesEntregasItensOpcoes = useMemo(() => {
    if (!data) return meses;
    const abertos = listarMesesComDebitoCooperativa(data, coopId);
    return abertos.length > 0 ? abertos : meses;
  }, [data, coopId, meses]);

  const tituloRelatorio = RELATORIOS.find((r) => r.id === tipo)?.label ?? "Relatório";

  const toggleMesEntregasItens = (mesRef: string) => {
    setMesesEntregasItens((prev) => {
      const base = prev.length > 0 ? prev : mesesEntregasItensEfetivos;
      if (base.includes(mesRef)) {
        const next = base.filter((m) => m !== mesRef);
        return next.length > 0 ? next.sort() : base;
      }
      return [...base, mesRef].sort();
    });
  };

  const resolveInstituicaoId = () => {
    if (
      tipo === "entregas_instituicao" ||
      tipo === "entregas_por_itens" ||
      tipo === "atingimento_cronograma"
    ) {
      return instituicaoSelecionadaId;
    }
    return "";
  };

  const gerarHtmlDocumento = (emissor?: EmissorRelatorio) => {
    if (!data) return "";
    if (tipo === "entregas_por_itens") {
      const inst = resolveInstituicaoId();
      if (!inst || mesesEntregasItensEfetivos.length === 0) return "";
      return gerarRelatorioEntregasPorItensPeriodoHtml(
        data,
        inst,
        mesesEntregasItensEfetivos,
        coopId,
        emissor,
        { apenasPendente: true }
      );
    }
    if (tipo === "entregas_instituicao") {
      const inst = resolveInstituicaoId();
      if (!inst) return "";
      return gerarRelatorioEntregasInstituicaoHtml(data, mes, inst, coopId, emissor);
    }
    if (tipo === "mensalidades_abertas_total") {
      return gerarRelatorioMensalidadesAbertasTotalHtml(data, coopId, emissor);
    }
    if (tipo === "mensalidades_abertas") {
      return gerarRelatorioMensalidadesAbertasMesHtml(data, mes, coopId, emissor);
    }
    if (tipo === "resumo_financeiro_aberto") {
      return gerarRelatorioResumoFinanceiroAbertoHtml(data, coopId, emissor);
    }
    if (tipo === "pagar_cooperado") {
      return gerarRelatorioPagarCooperadoAbertoHtml(
        data,
        coopId,
        cooperadoId || undefined,
        emissor,
        instituicaoSelecionadaId || undefined
      );
    }
    if (tipo === "atingimento_cronograma") {
      const inst = resolveInstituicaoId();
      if (!inst) return "";
      return gerarRelatorioAtingimentoCronogramaHtml(data, mes, inst, coopId, emissor);
    }
    if (tipo === "sobras_perdas") {
      return gerarRelatorioSobrasPerdasHtml(data, mes, coopId, emissor);
    }
    if (tipo === "historico_reclamacoes") {
      return gerarRelatorioReclamacoesHtml(data, coopId, cooperadoId || undefined, emissor);
    }
    if (tipo === "historico_votacoes") {
      return gerarRelatorioVotacoesHtml(data, coopId, emissor);
    }
    if (tipo === "conciliacao_mensal") {
      const coop = coopId ? data.cooperativas.find((c) => c.id === coopId) : data.cooperativas[0];
      const conc = calcularConciliacaoMensal(data, mes, coopId ?? undefined);
      return gerarRelatorioConciliacaoHtml(data, conc, coop, emissor);
    }
    if (tipo === "demonstrativo_pagamentos") {
      const linhas = getDemonstrativoPagamentosMes(data, mes);
      return gerarRelatorioDemonstrativoPagamentosHtml(data, mes, linhas, emissor);
    }
    if (tipo === "razao_analitico") {
      const razoes = cooperadoId
        ? [getRazaoAnaliticoCooperado(data, cooperadoId, mes, coopId ?? undefined)]
        : getRazaoAnaliticoTodosCooperados(data, mes, coopId ?? undefined);
      return gerarRelatorioRazaoAnaliticoHtml(data, razoes, mes, emissor);
    }
    if (tipo === "mapa_receitas_contrato") {
      return gerarRelatorioMapaReceitasHtml(data, getMapaReceitasContrato(data, mes, coopId ?? undefined), emissor);
    }
    if (tipo === "extrato_conta_coop") {
      return gerarRelatorioExtratoContaCoopHtml(data, getExtratoContaCoopMes(data, mes, coopId ?? undefined), emissor);
    }
    if (tipo === "trilha_auditoria") {
      return gerarRelatorioTrilhaAuditoriaHtml(data, auditLogParaExportacao(data, mes), mes, emissor);
    }
    if (tipo === "parecer_contabil") {
      const parecer = coopId ? getParecerContabilMes(data, coopId, mes) : undefined;
      if (!parecer) return "";
      return gerarRelatorioParecerContabilHtml(data, parecer, emissor);
    }
    if (tipo === "fechamento_mensal") {
      const fechamento = data.fechamentos.find((f) => f.mesReferencia === mes);
      return gerarRelatorioFechamentoHtml(data, mes, fechamento, emissor);
    }
    return gerarRelatorioFinanceiroHtml(data, mes, tituloRelatorio, emissor);
  };

  const nomeDocumento = () => {
    if (tipo === "historico_reclamacoes") {
      return nomeArquivoRelatorio(tipo, getCurrentMesReferencia());
    }
    if (tipo === "historico_votacoes") {
      return nomeArquivoRelatorio(tipo, getCurrentMesReferencia());
    }
    if (tipo === "entregas_por_itens" || tipo === "entregas_instituicao" || tipo === "atingimento_cronograma") {
      const inst = data?.instituicoes.find((i) => i.id === instituicaoSelecionadaId);
      const periodo =
        tipo === "entregas_por_itens"
          ? mesesEntregasItensEfetivos.length === 1
            ? mesesEntregasItensEfetivos[0]
            : "periodo"
          : mes;
      return nomeArquivoRelatorio(tipo, periodo, inst?.nome);
    }
    if (RELATORIOS_CONSOLIDADOS.has(tipo)) {
      return nomeArquivoRelatorio(tipo, getCurrentMesReferencia());
    }
    return nomeArquivoRelatorio(tipo, mes);
  };

  const handleExportCsv = () => {
    if (!data) return;
    let headers: string[] = [];
    let rows: string[][] = [];

    switch (tipo) {
      case "resumo_financeiro": {
        const r = getRelatorioResumoFinanceiro(mes, data);
        headers = ["Indicador", "Valor"];
        rows = [
          ["Entregas conferidas", String(r.resumo.totalEntregas)],
          ["Vendas bruto", String(r.totalVendas)],
          ["Vendas líquido", String(r.totalLiquido)],
          ["A pagar cooperados", String(r.resumo.valoresAPagar)],
          ["Pagamentos realizados", String(r.resumo.pagamentosRealizados)],
          ["Aguardando conferência", String(r.resumo.entregasAguardando)],
        ];
        break;
      }
      case "pagar_cooperado": {
        headers = ["Cooperado", "Mês", "Entregas", "Valor a pagar"];
        rows = flattenLinhasPagarCooperadoEmAberto(
          getRelatorioPagarCooperadoEmAbertoReport(data, coopId, cooperadoId || undefined)
        ).map((l) => [l.cooperado, l.mesesLabel, String(l.entregas), String(l.total)]);
        break;
      }
      case "resumo_financeiro_aberto": {
        const r = getRelatorioResumoFinanceiroEmAbertoReport(data, coopId);
        headers = ["Indicador", "Valor"];
        rows = [
          ["Meses com débito", r.mesesLabel],
          ["Cooperados com débito", String(r.cooperadosComDebito)],
          ["Entregas (período)", String(r.totalEntregas)],
          ["Vendas bruto", String(r.totalVendasBruto)],
          ["Vendas líquido", String(r.totalVendasLiquido)],
          ["Total a pagar", String(r.valoresAPagar)],
        ];
        break;
      }
      case "mensalidades_abertas_total": {
        const r = getRelatorioMensalidadesEmAbertoConsolidadoReport(data, coopId);
        headers = ["Cooperado", "Mês", "Valor", "Vencimento", "Status"];
        rows = r.linhas.map((m) => [m.cooperadoNome, m.mesReferencia, String(m.valor), m.vencimento, m.status]);
        if (rows.length) rows.push(["", "", "TOTAL", String(r.total), ""]);
        break;
      }
      case "mensalidades_abertas":
        headers = ["Cooperado", "Mês", "Valor", "Vencimento", "Status"];
        rows = data.mensalidades
          .filter((m) => m.status !== "paga" && m.mesReferencia === mes)
          .map((m) => [
            getCooperadoNome(data.cooperados, m.cooperadoId),
            m.mesReferencia,
            String(m.valor),
            m.vencimento,
            m.status,
          ]);
        break;
      case "cotas_abertas":
        headers = ["Cooperado", "Tipo", "Parcelas", "Valor Parcela", "Status"];
        rows = data.cotas.filter((c) => c.status !== "quitada").map((c) => [
          getCooperadoNome(data.cooperados, c.cooperadoId),
          c.tipo,
          `${c.parcelasPagas}/${c.quantidadeParcelas}`,
          String(c.valorParcela),
          c.status,
        ]);
        break;
      case "entregas_instituicao": {
        const inst = instituicaoSelecionadaId;
        if (!inst) break;
        const r = getRelatorioEntregasPorInstituicao(inst, mes, data);
        headers = ["Data", "Cooperado", "Nota", "Bruto", "Líquido", "Status"];
        rows = r.entregas.map((n) => [
          n.dataEntrega,
          getCooperadoNome(data.cooperados, n.cooperadoId),
          n.numeroNota,
          String(n.valorBruto),
          String(n.valorLiquido),
          n.status,
        ]);
        break;
      }
      case "entregas_por_itens": {
        const inst = instituicaoSelecionadaId;
        if (!inst || mesesEntregasItensEfetivos.length === 0) break;
        const r = getRelatorioEntregasPorItensPeriodoReport(
          inst,
          mesesEntregasItensEfetivos,
          data,
          coopId,
          { apenasPendente: true }
        );
        headers = ["Seção", "Cooperado", "Item", "Unidade", "Quantidade", "Valor unitário médio", "Valor total"];
        rows = r.itens.map((item) => [
          "Consolidado",
          "",
          item.produtoNome,
          item.unidade,
          String(item.quantidade),
          String(item.precoUnitario),
          String(item.valorTotal),
        ]);
        for (const coop of r.porCooperado) {
          for (const item of coop.itens) {
            rows.push([
              "Detalhe",
              coop.cooperadoNome,
              item.produtoNome,
              item.unidade,
              String(item.quantidade),
              "",
              String(item.valorTotal),
            ]);
          }
        }
        if (rows.length > 0) {
          rows.push(["", "", "", "", "", "TOTAL GERAL", String(r.totalBruto)]);
        }
        break;
      }
      case "atingimento_cronograma": {
        const inst = instituicaoSelecionadaId;
        if (!inst) break;
        const r = getRelatorioAtingimentoCronograma(data, inst, mes, coopId);
        headers = [
          "Item",
          "Qtd prevista",
          "Qtd entregue",
          "Valor previsto",
          "Valor entregue",
          "Falta R$",
          "Atingimento %",
        ];
        rows = r.itens.map((i) => [
          i.produtoNome,
          String(i.quantidadePrevista),
          String(i.quantidadeEntregue),
          String(i.valorPrevisto),
          String(i.valorEntregue),
          String(i.valorFaltante),
          String(i.percentualValor),
        ]);
        if (rows.length > 0) {
          rows.push([
            "TOTAL",
            "",
            "",
            String(r.valorLimiteContrato),
            String(r.valorEntregueTotal),
            String(r.valorFaltante),
            String(r.percentualAtingimentoValor),
          ]);
        }
        break;
      }
      case "vendas_pnae": {
        const r = getRelatorioPNAE(mes, data);
        headers = ["Data", "Cooperado", "Nota", "Bruto", "Status"];
        rows = r.entregas.map((n) => [
          n.dataEntrega,
          getCooperadoNome(data.cooperados, n.cooperadoId),
          n.numeroNota,
          String(n.valorBruto),
          n.status,
        ]);
        break;
      }
      case "descontos_aplicados":
        headers = ["Data", "Cooperado", "Tipo", "Motivo", "Valor Descontado"];
        rows = data.descontos
          .filter((d) => !mes || d.data.startsWith(mes))
          .map((d) => [
            d.data,
            getCooperadoNome(data.cooperados, d.cooperadoId),
            d.tipo,
            d.motivo,
            String(d.valorDescontado),
          ]);
        break;
      case "sobras_perdas": {
        const r = getRelatorioSobrasPerdas(mes, data, coopId);
        headers = ["Seção", "Categoria", "Descrição", "Valor", "Quantidade"];
        rows = [
          ...r.perdas.map((p) => ["Perda", p.categoria, p.descricao, String(p.valor), String(p.quantidade ?? "")]),
          ...r.sobras.map((s) => ["Sobra", s.categoria, s.descricao, String(s.valor), String(s.quantidade ?? "")]),
          ["Equação", "Bruto entregas", "", String(r.equacao.valorBrutoEntregas), ""],
          ["Equação", "Total perdas", "", String(r.equacao.totalPerdas), ""],
          ["Equação", "Líquido apurado", "", String(r.equacao.valorLiquidoApurado), ""],
          ["Equação", "Saldo a acertar", "", String(r.equacao.totalSobrasAcertar), ""],
          ...r.linhasCooperado.map((l) => [
            "Cooperado",
            l.cooperadoNome,
            `${l.entregasConferidas} entrega(s) · ${l.statusPagamento}`,
            String(l.sobraAcertar),
            String(l.entregasConferidas),
          ]),
        ];
        break;
      }
      case "saldo_mensal": {
        const fin = data.financeiro.find((f) => f.mesReferencia === mes);
        const r = getRelatorioResumoFinanceiro(mes, data);
        headers = ["Campo", "Valor"];
        rows = fin
          ? [
              ["Saldo inicial", String(fin.saldoInicial)],
              ["Entradas", String(fin.entradas)],
              ["Saídas", String(fin.saidas)],
              ["Saldo final", String(fin.saldoFinal)],
            ]
          : [
              ["Vendas líquidas (calculado)", String(r.totalLiquido)],
              ["Pagamentos realizados", String(r.resumo.pagamentosRealizados)],
              ["Mensalidades recebidas", String(r.resumo.mensalidadesRecebidas)],
            ];
        break;
      }
      case "fechamento_mensal": {
        const calc = calcularFechamentoMensalLive(mes, data);
        const calcStored = calcularFechamentoMensal(mes, data);
        headers = ["Seção", "Cooperado / Instituição", "Entregas", "Bruto", "A pagar", "Pago", "Líquido"];
        rows = [
          ["Resumo", "Total vendas", "", "", String(calcStored.totalVendas ?? 0), "", ""],
          ["Resumo", "Pagamentos", "", "", String(calcStored.totalPagamentos ?? 0), "", ""],
          ["Resumo", "Saldo cooperativa", "", "", String(calcStored.saldoCooperativa ?? 0), "", ""],
          ...calc.linhasCooperado.map((l) => [
            "Cooperado",
            l.cooperadoNome,
            String(l.entregas),
            String(l.valorBruto),
            String(l.aPagar),
            String(l.pago),
            "",
          ]),
          ...calc.linhasInstituicao.map((l) => [
            "Instituição",
            l.instituicaoNome,
            String(l.entregas),
            String(l.valorBruto),
            "",
            "",
            String(l.valorLiquido),
          ]),
        ];
        break;
      }
      case "historico_reclamacoes": {
        const r = getRelatorioReclamacoes(data, coopId, cooperadoId || undefined);
        headers = ["Seção", "Data", "Cooperado", "Item", "Descrição", "Quantidade", "Percentual"];
        rows = [
          ["Resumo", "", "", "", "Total de reclamações", String(r.total), "100%"],
          ...r.porCooperado.map((p) => [
            "Por cooperado",
            "",
            p.cooperadoNome,
            "",
            "",
            String(p.quantidade),
            `${p.percentual}%`,
          ]),
          ...r.historico.map((h) => [
            "Histórico",
            h.data,
            h.cooperadoNome,
            h.item,
            h.descricao,
            "",
            "",
          ]),
        ];
        break;
      }
      case "historico_votacoes": {
        const r = getRelatorioVotacoes(data, coopId);
        headers = ["Pauta", "Período", "Cooperado", "Voto", "Data", "SIM %", "NÃO %"];
        rows = r.pautas.flatMap(({ pauta, resumo }) => {
          const periodo = `${pauta.inicioEm} a ${pauta.fimEm}`;
          const headerRow = [
            pauta.texto,
            periodo,
            "",
            "",
            "",
            `${resumo.pctSim}%`,
            `${resumo.pctNao}%`,
          ];
          const votoRows = resumo.votos.map((v) => [
            pauta.texto,
            periodo,
            v.cooperadoNome,
            v.voto === "sim" ? "SIM" : "NÃO",
            v.createdAt.split("T")[0],
            "",
            "",
          ]);
          return [headerRow, ...votoRows];
        });
        break;
      }
      case "conciliacao_mensal": {
        const conc = calcularConciliacaoMensal(data, mes, coopId ?? undefined);
        headers = ["Verificação", "Fonte A", "Valor A", "Fonte B", "Valor B", "Diferença", "Status"];
        rows = conc.linhas.map((l) => [
          l.label,
          l.labelA,
          String(l.valorA),
          l.labelB,
          String(l.valorB),
          String(l.diferenca),
          l.status,
        ]);
        break;
      }
      case "demonstrativo_pagamentos": {
        headers = ["Cooperado", "Bruto", "Desc. coop.", "Líquido", "Status", "Assinado", "Registrado por", "Data"];
        rows = getDemonstrativoPagamentosMes(data, mes).map((p) => [
          p.cooperadoNome,
          String(p.valorBruto),
          String(p.descontoCooperativa),
          String(p.valorLiquido),
          p.status,
          p.assinado ? "sim" : "nao",
          p.pagoPor,
          p.pagoEm.split("T")[0],
        ]);
        break;
      }
      case "razao_analitico": {
        const razoes = cooperadoId
          ? [getRazaoAnaliticoCooperado(data, cooperadoId, mes, coopId ?? undefined)]
          : getRazaoAnaliticoTodosCooperados(data, mes, coopId ?? undefined);
        headers = ["Cooperado", "Data", "Tipo", "Descrição", "Valor", "Saldo"];
        rows = razoes.flatMap((r) =>
          r.linhas.map((l) => [r.cooperadoNome, l.data, l.tipo, l.descricao, String(l.valor), String(l.saldo)])
        );
        break;
      }
      case "mapa_receitas_contrato": {
        const mapa = getMapaReceitasContrato(data, mes, coopId ?? undefined);
        headers = ["Instituição", "Entregas", "Bruto", "Líquido"];
        rows = mapa.linhas.map((l) => [l.instituicaoNome, String(l.qtdEntregas), String(l.valorBruto), String(l.valorLiquido)]);
        break;
      }
      case "extrato_conta_coop": {
        const ex = getExtratoContaCoopMes(data, mes, coopId ?? undefined);
        headers = ["Cooperado", "Descrição", "Valor"];
        rows = ex.linhas.map((l) => [l.cooperadoNome, l.motivo, String(l.valor)]);
        break;
      }
      case "trilha_auditoria": {
        headers = ["Data", "Usuário", "Ação", "Entidade", "Resumo"];
        rows = auditLogParaExportacao(data, mes).map((e) => [
          e.timestamp,
          e.userName,
          e.action,
          e.entityType,
          e.changes ?? "",
        ]);
        break;
      }
      case "parecer_contabil": {
        const parecer = coopId ? getParecerContabilMes(data, coopId, mes) : undefined;
        headers = ["Campo", "Valor"];
        rows = parecer
          ? [
              ["Mês", parecer.mesReferencia],
              ["Contador", parecer.contadorNome],
              ["Função", parecer.contadorFuncao],
              ["Emitido em", parecer.emitidoEm],
              ["Texto", parecer.texto],
            ]
          : [["Aviso", "Nenhum parecer registrado para este mês"]];
        break;
      }
      default:
        headers = ["Relatório", "Mês"];
        rows = [[tipo, mes]];
    }

    downloadCSV(
      `relatorio_${tipo}_${
        RELATORIOS_CONSOLIDADOS.has(tipo)
          ? "consolidado"
          : RELATORIOS_MESES_MULTIPLOS.has(tipo)
            ? mesesEntregasItensEfetivos.join("-")
            : mes
      }.csv`,
      exportToCSV(headers, rows)
    );
  };

  const validarEmissaoDocumento = (): boolean => {
    if (RELATORIOS_INSTITUICAO_DOCUMENTO.has(tipo) && !instituicaoSelecionadaId) {
      window.alert("Selecione a instituição do contrato para gerar o documento.");
      return false;
    }
    if (tipo === "entregas_por_itens" && mesesEntregasItensEfetivos.length === 0) {
      window.alert("Selecione ao menos um mês em aberto.");
      return false;
    }
    return true;
  };

  const emitirDocumento = (emissor: EmissorRelatorio) => {
    const html = gerarHtmlDocumento(emissor);
    if (!html) return;
    if (modalEmissao === "print") {
      imprimirDocumentoHtml(html);
    } else {
      void baixarDocumento(html, nomeDocumento());
    }
    setModalEmissao(null);
  };

  const emitirDocumentoDireto = (modo: "pdf" | "print") => {
    if (!user || !validarEmissaoDocumento()) return;
    const emissor = buildEmissorFromUser(user, { modo: "simples" });
    const html = gerarHtmlDocumento(emissor);
    if (!html) return;
    if (modo === "print") {
      imprimirDocumentoHtml(html);
    } else {
      void baixarDocumento(html, nomeDocumento());
    }
  };

  const handleExportDocumento = () => {
    if (!check("relatorios", "export")) return;
    if (RELATORIOS_EMISSAO_SIMPLES.has(tipo)) {
      emitirDocumentoDireto("pdf");
      return;
    }
    setModalEmissao("pdf");
  };

  const handlePrint = () => {
    if (!check("relatorios", "export")) return;
    if (RELATORIOS_EMISSAO_SIMPLES.has(tipo)) {
      emitirDocumentoDireto("print");
      return;
    }
    setModalEmissao("print");
  };

  if (!data || !user) return <PageSkeleton />;
  if (!check("relatorios", "view")) return null;

  const renderRelatorio = () => {
    switch (tipo) {
      case "resumo_financeiro": {
        const r = getRelatorioResumoFinanceiro(mes, data);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard title="Entregas conferidas" value={String(r.resumo.totalEntregas)} />
            <StatCard title="Vendas (bruto)" value={formatCurrency(r.totalVendas)} />
            <StatCard title="Vendas (líquido)" value={formatCurrency(r.totalLiquido)} variant="success" />
            <StatCard title="A pagar cooperados" value={formatCurrency(r.resumo.valoresAPagar)} variant="warning" />
            <StatCard title="Pagamentos realizados" value={formatCurrency(r.resumo.pagamentosRealizados)} variant="success" />
            <StatCard title="Aguardando conferência" value={String(r.resumo.entregasAguardando)} />
          </div>
        );
      }
      case "pagar_cooperado": {
        const porCooperado = getRelatorioPagarCooperadoEmAbertoReport(data, coopId, cooperadoId || undefined);
        const linhasTabela = flattenLinhasPagarCooperadoEmAberto(porCooperado);
        const detalharPorMes = porCooperado.some((r) => r.porMes.length > 1);
        const totalGeral = cooperadoId
          ? porCooperado.reduce((s, r) => s + r.total, 0)
          : getTotalValoresAPagarEmAberto(data, coopId);
        return (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Consolidado dos meses com pagamento pendente (ex.: agosto e setembro). Valores sincronizados com a
              ficha corrida e Quanto vou receber.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <StatCard title="Cooperados com valor em aberto" value={String(porCooperado.length)} />
              <StatCard title="Total geral a pagar" value={formatCurrency(totalGeral)} variant="warning" />
            </div>
            <DataTable
              data={linhasTabela}
              keyField="id"
              columns={[
                { key: "cooperado", label: "Cooperado" },
                {
                  key: "mesesLabel",
                  label: detalharPorMes ? "Mês" : "Meses em aberto",
                },
                { key: "entregas", label: "Entregas" },
                { key: "total", label: "Valor a Pagar", render: (r) => formatCurrency(r.total) },
              ]}
              emptyMessage="Nenhum valor pendente de pagamento."
            />
          </>
        );
      }
      case "resumo_financeiro_aberto": {
        const r = getRelatorioResumoFinanceiroEmAbertoReport(data, coopId);
        return (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Soma de todos os meses com débito: <strong>{r.mesesLabel}</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard title="Cooperados com débito" value={String(r.cooperadosComDebito)} variant="warning" />
              <StatCard title="Entregas (período)" value={String(r.totalEntregas)} />
              <StatCard title="Vendas (bruto)" value={formatCurrency(r.totalVendasBruto)} />
              <StatCard title="Vendas (líquido)" value={formatCurrency(r.totalVendasLiquido)} variant="success" />
              <StatCard title="Total a pagar" value={formatCurrency(r.valoresAPagar)} variant="warning" />
              <StatCard title="Aguardando conferência (últ. meses)" value={String(r.entregasAguardando)} />
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Total a pagar conferido e sincronizado com o relatório &quot;Pagamento por cooperado (em aberto)&quot; ({r.cooperadosComDebito} cooperado(s)).
            </p>
          </>
        );
      }
      case "mensalidades_abertas_total": {
        const r = getRelatorioMensalidadesEmAbertoConsolidadoReport(data, coopId);
        return (
          <>
            <div className="mb-4">
              <StatCard title="Total mensalidades em aberto" value={formatCurrency(r.total)} variant="warning" />
            </div>
            <DataTable
              data={r.linhas}
              keyField="id"
              columns={[
                { key: "cooperadoNome", label: "Cooperado" },
                { key: "mes", label: "Mês", render: (m) => formatMesReferencia(m.mesReferencia) },
                { key: "valor", label: "Valor", render: (m) => formatCurrency(m.valor) },
                { key: "vencimento", label: "Vencimento", render: (m) => formatDate(m.vencimento) },
                { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
              ]}
              emptyMessage="Nenhuma mensalidade em aberto."
            />
          </>
        );
      }
      case "mensalidades_abertas": {
        const items = data.mensalidades.filter((m) => m.status !== "paga" && m.mesReferencia === mes);
        return (
          <DataTable
            data={items}
            keyField="id"
            columns={[
              { key: "cooperado", label: "Cooperado", render: (m) => getCooperadoNome(data.cooperados, m.cooperadoId) },
              { key: "mes", label: "Mês", render: (m) => formatMesReferencia(m.mesReferencia) },
              { key: "valor", label: "Valor", render: (m) => formatCurrency(m.valor) },
              { key: "vencimento", label: "Vencimento", render: (m) => formatDate(m.vencimento) },
              { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
            ]}
          />
        );
      }
      case "cotas_abertas": {
        const items = data.cotas.filter((c) => c.status !== "quitada");
        return (
          <DataTable
            data={items}
            keyField="id"
            columns={[
              { key: "cooperado", label: "Cooperado", render: (c) => getCooperadoNome(data.cooperados, c.cooperadoId) },
              { key: "tipo", label: "Tipo" },
              { key: "parcelas", label: "Parcelas", render: (c) => `${c.parcelasPagas}/${c.quantidadeParcelas}` },
              { key: "valorParcela", label: "Valor Parcela", render: (c) => formatCurrency(c.valorParcela) },
              { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
            ]}
          />
        );
      }
      case "entregas_instituicao": {
        const inst = instituicaoSelecionadaId;
        if (!inst) return <p className="text-gray-500">Cadastre uma instituição em Contratos.</p>;
        const r = getRelatorioEntregasPorInstituicao(inst, mes, data);
        return (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard title="Total Bruto" value={formatCurrency(r.totalBruto)} />
              <StatCard title="Total Líquido" value={formatCurrency(r.totalLiquido)} variant="success" />
            </div>
            <DataTable
              data={r.entregas}
              keyField="id"
              columns={[
                { key: "data", label: "Data", render: (n) => formatDate(n.dataEntrega) },
                { key: "cooperado", label: "Cooperado", render: (n) => getCooperadoNome(data.cooperados, n.cooperadoId) },
                { key: "nota", label: "Nota", render: (n) => n.numeroNota },
                { key: "valorBruto", label: "Bruto", render: (n) => formatCurrency(n.valorBruto) },
                { key: "status", label: "Status", render: (n) => <NotaStatusBadge status={n.status} /> },
              ]}
            />
          </>
        );
      }
      case "entregas_por_itens": {
        const inst = instituicaoSelecionadaId;
        if (!inst) return <p className="text-gray-500">Cadastre uma instituição em Contratos.</p>;
        if (mesesEntregasItensEfetivos.length === 0) {
          return <p className="text-gray-500">Selecione ao menos um mês para gerar o relatório.</p>;
        }
        const r = getRelatorioEntregasPorItensPeriodoReport(
          inst,
          mesesEntregasItensEfetivos,
          data,
          coopId,
          { apenasPendente: true }
        );
        return <EntregasPorItensPainel relatorio={r} />;
      }
      case "atingimento_cronograma": {
        const inst = instituicaoSelecionadaId;
        if (!inst) {
          return (
            <p className="text-sm text-gray-600">Selecione o contrato / instituição contratante para gerar o relatório.</p>
          );
        }
        const r = getRelatorioAtingimentoCronograma(data, inst, mes, coopId);
        if (!r.cronograma) {
          return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Cronograma não lançado para {formatMesReferencia(mes)}</p>
              <p className="mt-2">
                Lance o cronograma em <strong>Contratos → Cronogramas</strong> antes de emitir este relatório.
              </p>
            </div>
          );
        }
        const pct = r.percentualAtingimentoValor;
        return (
          <>
            {r.anotacaoMes && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-900">
                <p className="font-semibold">Referência do mês</p>
                <p className="mt-1">{r.anotacaoMes}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <StatCard title="Meta do contrato" value={formatCurrency(r.valorLimiteContrato)} variant="gold" />
              <StatCard title="Total entregue" value={formatCurrency(r.valorEntregueTotal)} variant="success" />
              <StatCard title="Saldo a entregar" value={formatCurrency(r.valorFaltante)} variant="warning" />
              <StatCard
                title="Atingimento"
                value={`${pct.toLocaleString("pt-BR")}%`}
                variant={pct >= 100 ? "success" : pct >= 70 ? "gold" : "danger"}
              />
            </div>

            {r.itensCriticos.length > 0 && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50/60 p-4">
                <p className="text-sm font-semibold text-red-900 mb-2">Itens com maior dificuldade</p>
                <ul className="text-sm text-red-800 space-y-1 list-disc pl-5">
                  {r.itensCriticos.map((i) => (
                    <li key={i.produtoInstituicaoId}>
                      {i.produtoNome} — {i.percentualValor.toLocaleString("pt-BR")}% · faltam{" "}
                      {formatCurrency(i.valorFaltante)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DataTable
              data={r.itens.map((item, idx) => ({ ...item, id: item.produtoInstituicaoId || String(idx) }))}
              keyField="id"
              emptyMessage="Nenhum item no cronograma."
              columns={[
                { key: "produto", label: "Item", render: (i) => i.produtoNome },
                {
                  key: "previsto",
                  label: "Previsto",
                  render: (i) =>
                    `${i.quantidadePrevista.toLocaleString("pt-BR")} ${labelUnidade(i.unidade) || i.unidade}`,
                },
                {
                  key: "entregue",
                  label: "Entregue",
                  render: (i) => i.quantidadeEntregue.toLocaleString("pt-BR"),
                },
                { key: "valorPrev", label: "Valor meta", render: (i) => formatCurrency(i.valorPrevisto) },
                { key: "valorEnt", label: "Valor entregue", render: (i) => formatCurrency(i.valorEntregue) },
                {
                  key: "pct",
                  label: "Atingimento",
                  render: (i) => `${i.percentualValor.toLocaleString("pt-BR")}%`,
                },
              ]}
            />

            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2 mt-8">Por cooperado</h3>
            <DataTable
              data={r.porCooperado.map((c) => ({ ...c, id: c.cooperadoId }))}
              keyField="id"
              emptyMessage="Nenhuma entrega conferida."
              columns={[
                { key: "nome", label: "Cooperado", render: (c) => c.cooperadoNome },
                { key: "entregas", label: "Entregas", render: (c) => String(c.entregas) },
                { key: "valor", label: "Valor entregue", render: (c) => formatCurrency(c.valorEntregue) },
                {
                  key: "pct",
                  label: "% da meta",
                  render: (c) => `${c.percentualDoContrato.toLocaleString("pt-BR")}%`,
                },
              ]}
            />

            <p className="text-xs text-gray-500 mt-4">
              Use <strong>PDF</strong> para o relatório formal de atingimento do cronograma contratual.
            </p>
          </>
        );
      }
      case "vendas_pnae": {
        const r = getRelatorioPNAE(mes, data);
        return (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard title="Total PNAE" value={formatCurrency(r.totalBruto)} variant="gold" />
              <StatCard title="Líquido PNAE" value={formatCurrency(r.totalLiquido)} variant="success" />
            </div>
            <DataTable
              data={r.entregas}
              keyField="id"
              columns={[
                { key: "data", label: "Data", render: (n) => formatDate(n.dataEntrega) },
                { key: "cooperado", label: "Cooperado", render: (n) => getCooperadoNome(data.cooperados, n.cooperadoId) },
                { key: "nota", label: "Nota", render: (n) => n.numeroNota },
                { key: "valorBruto", label: "Bruto", render: (n) => formatCurrency(n.valorBruto) },
              ]}
            />
          </>
        );
      }
      case "descontos_aplicados": {
        const items = data.descontos.filter((d) => d.data.startsWith(mes));
        return (
          <DataTable
            data={items}
            keyField="id"
            columns={[
              { key: "data", label: "Data", render: (d) => formatDate(d.data) },
              { key: "cooperado", label: "Cooperado", render: (d) => getCooperadoNome(data.cooperados, d.cooperadoId) },
              { key: "tipo", label: "Tipo" },
              { key: "motivo", label: "Motivo" },
              { key: "valorDescontado", label: "Descontado", render: (d) => formatCurrency(d.valorDescontado) },
            ]}
          />
        );
      }
      case "sobras_perdas": {
        const r = getRelatorioSobrasPerdas(mes, data, coopId);
        return (
          <>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-amber-950">Relatório de transparência — acertos futuros</p>
              <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                Perdas: retenções e descontos sobre entregas. Sobras: saldos pendentes de pagamento e conferência.
                Use o PDF para arquivar e apresentar à diretoria ou assembleia.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              <StatCard title="Valor bruto" value={formatCurrency(r.equacao.valorBrutoEntregas)} />
              <StatCard title="Total perdas" value={formatCurrency(r.equacao.totalPerdas)} variant="danger" />
              <StatCard title="Líquido apurado" value={formatCurrency(r.equacao.valorLiquidoApurado)} variant="success" />
              <StatCard title="Pago confirmado" value={formatCurrency(r.equacao.totalPagoConfirmado)} variant="success" />
              <StatCard title="Saldo a acertar" value={formatCurrency(r.equacao.totalSobrasAcertar)} variant="warning" />
              <StatCard title="Entregas conferidas" value={String(r.entregasConferidas)} />
            </div>

            <div className="mb-6 rounded-xl border border-green-200 bg-green-50/50 p-4 font-mono text-sm text-green-900 space-y-1">
              <p>Bruto − Perdas + Créditos = Líquido apurado</p>
              <p>
                {formatCurrency(r.equacao.valorBrutoEntregas)} − {formatCurrency(r.equacao.totalPerdas)} +{" "}
                {formatCurrency(r.equacao.totalCreditos)} = {formatCurrency(r.equacao.valorLiquidoApurado)}
              </p>
              <p className="pt-2">Líquido − Pago = Saldo a acertar</p>
              <p>
                {formatCurrency(r.equacao.valorLiquidoApurado)} − {formatCurrency(r.equacao.totalPagoConfirmado)} ={" "}
                {formatCurrency(r.equacao.totalSobrasAcertar)}
              </p>
            </div>

            <h3 className="text-sm font-bold uppercase tracking-wide text-red-800 mb-2">Perdas do mês</h3>
            <DataTable
              data={r.perdas.map((p, i) => ({ ...p, id: `perda_${i}` }))}
              keyField="id"
              emptyMessage="Nenhuma perda registrada."
              columns={[
                { key: "categoria", label: "Categoria" },
                { key: "descricao", label: "Descrição" },
                { key: "valor", label: "Valor", render: (p) => formatCurrency(p.valor) },
              ]}
            />

            <h3 className="text-sm font-bold uppercase tracking-wide text-amber-800 mb-2 mt-8">Sobras — saldos a acertar</h3>
            <DataTable
              data={r.sobras.map((s, i) => ({ ...s, id: `sobra_${i}` }))}
              keyField="id"
              emptyMessage="Nenhuma sobra pendente."
              columns={[
                { key: "categoria", label: "Categoria" },
                { key: "descricao", label: "Descrição" },
                { key: "valor", label: "Valor", render: (s) => formatCurrency(s.valor) },
              ]}
            />

            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2 mt-8">Por cooperado</h3>
            <DataTable
              data={r.linhasCooperado}
              keyField="cooperadoId"
              emptyMessage="Nenhum cooperado com movimentação neste mês."
              columns={[
                { key: "nome", label: "Cooperado", render: (l) => l.cooperadoNome },
                { key: "entregas", label: "Entregas", render: (l) => String(l.entregasConferidas) },
                { key: "bruto", label: "Bruto", render: (l) => formatCurrency(l.valorBruto) },
                {
                  key: "perdas",
                  label: "Perdas",
                  render: (l) => formatCurrency(l.taxaCooperativa + l.outrasPerdas),
                },
                { key: "liquido", label: "Líquido", render: (l) => formatCurrency(l.valorLiquido) },
                { key: "acertar", label: "A acertar", render: (l) => formatCurrency(l.sobraAcertar) },
                {
                  key: "status",
                  label: "Situação",
                  render: (l) =>
                    l.statusPagamento === "pago"
                      ? "Pago"
                      : l.statusPagamento === "aguardando_assinatura"
                        ? "Aguardando assinatura"
                        : l.statusPagamento === "pendente"
                          ? "A pagar"
                          : "—",
                },
              ]}
            />

            <ul className="mt-6 text-xs text-gray-600 space-y-1 list-disc pl-5">
              {r.observacoesTransparencia.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </>
        );
      }
      case "saldo_mensal": {
        const fin = data.financeiro.find((f) => f.mesReferencia === mes);
        const r = getRelatorioResumoFinanceiro(mes, data);
        if (!fin) {
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Saldo manual não cadastrado — valores calculados dos lançamentos:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard title="Vendas líquidas" value={formatCurrency(r.totalLiquido)} variant="success" />
                <StatCard title="Pagamentos realizados" value={formatCurrency(r.resumo.pagamentosRealizados)} />
                <StatCard title="Mensalidades recebidas" value={formatCurrency(r.resumo.mensalidadesRecebidas)} />
                <StatCard title="A pagar" value={formatCurrency(r.resumo.valoresAPagar)} variant="warning" />
              </div>
            </div>
          );
        }
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard title="Saldo Inicial" value={formatCurrency(fin.saldoInicial)} />
            <StatCard title="Saldo Final" value={formatCurrency(fin.saldoFinal)} variant="gold" />
            <StatCard title="Entradas" value={formatCurrency(fin.entradas)} variant="success" />
            <StatCard title="Saídas" value={formatCurrency(fin.saidas)} variant="warning" />
          </div>
        );
      }
      case "fechamento_mensal": {
        const fechamento = data.fechamentos.find((f) => f.mesReferencia === mes);
        const calculoLive = calcularFechamentoMensalLive(mes, data);
        const calculo = calcularFechamentoMensal(mes, data);
        return (
          <>
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50/60 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-green-900">Consolidação mensal</p>
                <p className="text-xs text-green-800 mt-1">
                  {calculoLive.qtdEntregas} entrega(s) · {calculoLive.qtdCooperadosPagos} pagamento(s) ·{" "}
                  {calculoLive.qtdCooperadosAPagar} cooperado(s) a pagar
                  {fechamento?.status ? ` · Status: ${fechamento.status}` : ""}
                </p>
              </div>
              <Link href={`/fechamento-mensal?mes=${mes}`}>
                <Button size="sm" variant="secondary">
                  Revisar / aprovar fechamento →
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              <StatCard title="Total Vendas" value={formatCurrency(calculo.totalVendas ?? 0)} />
              <StatCard title="Total Pagamentos" value={formatCurrency(calculo.totalPagamentos ?? 0)} variant="success" />
              <StatCard title="Mensalidades" value={formatCurrency(calculo.totalMensalidades ?? 0)} />
              <StatCard title="Cotas" value={formatCurrency(calculo.totalCotas ?? 0)} />
              <StatCard title="Descontos" value={formatCurrency(calculo.totalDescontos ?? 0)} variant="warning" />
              <StatCard title="Saldo Cooperativa" value={formatCurrency(calculo.saldoCooperativa ?? 0)} variant="gold" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-3">Por cooperado</h3>
            <DataTable
              data={calculoLive.linhasCooperado}
              keyField="cooperadoId"
              columns={[
                { key: "nome", label: "Cooperado", render: (l) => l.cooperadoNome },
                { key: "entregas", label: "Entregas" },
                { key: "bruto", label: "Bruto", render: (l) => formatCurrency(l.valorBruto) },
                { key: "pagar", label: "A pagar", render: (l) => formatCurrency(l.aPagar) },
                { key: "pago", label: "Pago", render: (l) => formatCurrency(l.pago) },
              ]}
              emptyMessage="Nenhum lançamento neste mês."
            />
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mt-8 mb-3">Por instituição</h3>
            <DataTable
              data={calculoLive.linhasInstituicao.map((l) => ({ ...l, id: l.instituicaoId }))}
              keyField="id"
              columns={[
                { key: "instituicao", label: "Instituição", render: (l) => l.instituicaoNome },
                { key: "entregas", label: "Entregas" },
                { key: "bruto", label: "Bruto", render: (l) => formatCurrency(l.valorBruto) },
                { key: "liquido", label: "Líquido", render: (l) => formatCurrency(l.valorLiquido) },
              ]}
              emptyMessage="Nenhuma entrega neste mês."
            />
          </>
        );
      }
      case "historico_reclamacoes": {
        const r = getRelatorioReclamacoes(data, coopId, cooperadoId || undefined);
        return (
          <>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-amber-950">Levantamento de reclamações</p>
              <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                Histórico completo com distribuição percentual por cooperado (soma 100%). Exporte em PDF para arquivo ou assembleia.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard title="Total de reclamações" value={String(r.total)} />
              <StatCard title="Cooperados com ocorrências" value={String(r.porCooperado.length)} variant="warning" />
              <StatCard
                title="Maior incidência"
                value={
                  r.porCooperado[0]
                    ? `${r.porCooperado[0].percentual.toLocaleString("pt-BR")}%`
                    : "—"
                }
              />
            </div>

            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2">Distribuição por cooperado</h3>
            <DataTable
              data={r.porCooperado.map((p) => ({ ...p, id: p.cooperadoId }))}
              keyField="id"
              emptyMessage="Nenhuma reclamação registrada."
              columns={[
                { key: "nome", label: "Cooperado", render: (p) => p.cooperadoNome },
                { key: "qtd", label: "Reclamações", render: (p) => String(p.quantidade) },
                {
                  key: "pct",
                  label: "% do total",
                  render: (p) => `${p.percentual.toLocaleString("pt-BR")}%`,
                },
              ]}
            />

            {r.porCooperado.length > 0 && (
              <div className="my-6 space-y-3">
                {r.porCooperado.map((p) => (
                  <div key={p.cooperadoId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-900">{p.cooperadoNome}</span>
                      <span className="text-gray-600 tabular-nums">
                        {p.quantidade} · {p.percentual.toLocaleString("pt-BR")}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.min(100, p.percentual)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2 mt-8">Histórico completo</h3>
            <DataTable
              data={r.historico}
              keyField="id"
              emptyMessage="Nenhuma reclamação registrada."
              columns={[
                { key: "data", label: "Data", render: (h) => formatDate(h.data) },
                { key: "cooperado", label: "Cooperado", render: (h) => h.cooperadoNome },
                { key: "item", label: "Item" },
                {
                  key: "descricao",
                  label: "Descrição",
                  render: (h) => (
                    <span className="line-clamp-2 max-w-md" title={h.descricao}>
                      {h.descricao}
                    </span>
                  ),
                },
              ]}
            />
          </>
        );
      }
      case "historico_votacoes": {
        const r = getRelatorioVotacoes(data, coopId);
        return (
          <>
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <p className="text-sm font-semibold text-indigo-950">Histórico de pautas de votação</p>
              <p className="text-xs text-indigo-900 mt-1 leading-relaxed">
                Cada pauta com votos SIM/NÃO, nome de quem votou e percentuais sobre 100% dos votos computados.
              </p>
            </div>

            {r.pautas.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhuma pauta de votação registrada.</p>
            )}

            {r.pautas.map(({ pauta, resumo }) => (
              <div key={pauta.id} className="mb-10 last:mb-0 border-b border-gray-100 pb-8 last:border-0">
                <h3 className="text-base font-bold text-gray-900 leading-snug">{pauta.texto}</h3>
                <p className="text-xs text-gray-500 mt-1 mb-4">
                  {formatDate(pauta.inicioEm)} → {formatDate(pauta.fimEm)} · {resumo.totalVotos} voto(s)
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4 max-w-md">
                  <StatCard title="SIM" value={`${resumo.pctSim.toLocaleString("pt-BR")}%`} subtitle={`${resumo.votosSim} voto(s)`} />
                  <StatCard title="NÃO" value={`${resumo.pctNao.toLocaleString("pt-BR")}%`} subtitle={`${resumo.votosNao} voto(s)`} variant="warning" />
                </div>
                <DataTable
                  data={resumo.votos.map((v) => ({ ...v }))}
                  keyField="id"
                  emptyMessage="Nenhum voto nesta pauta."
                  columns={[
                    { key: "nome", label: "Cooperado", render: (v) => v.cooperadoNome },
                    {
                      key: "voto",
                      label: "Voto",
                      render: (v) => (
                        <span className={v.voto === "sim" ? "font-bold text-green-700" : "font-bold text-red-700"}>
                          {v.voto === "sim" ? "SIM" : "NÃO"}
                        </span>
                      ),
                    },
                    { key: "data", label: "Data", render: (v) => formatDate(v.createdAt.split("T")[0]) },
                  ]}
                />
              </div>
            ))}
          </>
        );
      }
      case "conciliacao_mensal": {
        const conc = calcularConciliacaoMensal(data, mes, coopId ?? undefined);
        return (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Visão unificada de conciliação (substitui a rota legada /contador/conciliacao).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <StatCard title="Conciliação OK" value={`${conc.resumo.percentualOk}%`} variant={conc.resumo.divergencias ? "warning" : "success"} />
              <StatCard title="Divergências" value={String(conc.resumo.divergencias)} variant="warning" />
              <StatCard title="Notas sem ficha" value={String(conc.kpis.notasSemFicha)} />
              <StatCard title="Fechamento" value={conc.kpis.fechamentoStatus ?? "—"} />
            </div>
            <DataTable
              data={conc.linhas.map((l) => ({ ...l, id: l.id }))}
              keyField="id"
              columns={[
                { key: "label", label: "Verificação" },
                { key: "valorA", label: "Fonte A", render: (l) => formatCurrency(l.valorA) },
                { key: "valorB", label: "Fonte B", render: (l) => formatCurrency(l.valorB) },
                { key: "diferenca", label: "Diferença", render: (l) => formatCurrency(l.diferenca) },
                {
                  key: "status",
                  label: "Status",
                  render: (l) => (
                    <StatusBadge
                      status={
                        l.status === "ok" ? "aprovado" : l.status === "divergencia" ? "bloqueado" : "pendente"
                      }
                    />
                  ),
                },
              ]}
            />
            {conc.alertas.length > 0 && (
              <>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mt-8 mb-3">Alertas de auditoria</h3>
                <DataTable
                  data={conc.alertas.map((a) => ({
                    ...a,
                    id: a.id,
                    severidade:
                      a.severidade === "critico" ? "Crítico" : a.severidade === "aviso" ? "Aviso" : "Info",
                  }))}
                  keyField="id"
                  columns={[
                    { key: "severidade", label: "Nível" },
                    { key: "titulo", label: "Alerta" },
                    { key: "descricao", label: "Detalhe" },
                  ]}
                />
              </>
            )}
          </>
        );
      }
      case "demonstrativo_pagamentos": {
        const linhas = getDemonstrativoPagamentosMes(data, mes);
        return (
          <DataTable
            data={linhas}
            keyField="id"
            columns={[
              { key: "cooperadoNome", label: "Cooperado" },
              { key: "valorBruto", label: "Bruto", render: (p) => formatCurrency(p.valorBruto) },
              { key: "valorLiquido", label: "Líquido", render: (p) => formatCurrency(p.valorLiquido) },
              {
                key: "status",
                label: "Status",
                render: (p) => (
                  <StatusBadge status={p.status === "confirmado" ? "pago" : "aguardando_confirmacao"} />
                ),
              },
              { key: "assinado", label: "Assinado", render: (p) => (p.assinado ? "Sim" : "Não") },
              { key: "pagoPor", label: "Registrado por" },
            ]}
            emptyMessage="Nenhum pagamento registrado neste mês."
          />
        );
      }
      case "razao_analitico": {
        const razoes = cooperadoId
          ? [getRazaoAnaliticoCooperado(data, cooperadoId, mes, coopId ?? undefined)]
          : getRazaoAnaliticoTodosCooperados(data, mes, coopId ?? undefined);
        if (razoes.length === 0) return <p className="text-gray-500">Sem movimentação no mês.</p>;
        return (
          <div className="space-y-6">
            {razoes.map((r) => (
              <Card key={r.cooperadoId} title={r.cooperadoNome}>
                <DataTable
                  data={r.linhas.map((l, i) => ({ ...l, id: `${r.cooperadoId}_${i}` }))}
                  keyField="id"
                  columns={[
                    { key: "data", label: "Data" },
                    { key: "tipo", label: "Tipo" },
                    { key: "descricao", label: "Descrição" },
                    { key: "valor", label: "Valor", render: (l) => formatCurrency(l.valor) },
                    { key: "saldo", label: "Saldo", render: (l) => formatCurrency(l.saldo) },
                  ]}
                />
                <p className="text-sm font-medium text-green-800 mt-2">Saldo final: {formatCurrency(r.saldoFinal)}</p>
              </Card>
            ))}
          </div>
        );
      }
      case "mapa_receitas_contrato": {
        const mapa = getMapaReceitasContrato(data, mes, coopId ?? undefined);
        return (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard title="Total bruto" value={formatCurrency(mapa.totalBruto)} />
              <StatCard title="Total líquido" value={formatCurrency(mapa.totalLiquido)} variant="success" />
            </div>
            <DataTable
              data={mapa.linhas.map((l) => ({ ...l, id: l.instituicaoId }))}
              keyField="id"
              columns={[
                { key: "instituicaoNome", label: "Instituição" },
                { key: "qtdEntregas", label: "Entregas" },
                { key: "valorBruto", label: "Bruto", render: (l) => formatCurrency(l.valorBruto) },
                { key: "valorLiquido", label: "Líquido", render: (l) => formatCurrency(l.valorLiquido) },
              ]}
            />
          </>
        );
      }
      case "extrato_conta_coop": {
        const ex = getExtratoContaCoopMes(data, mes, coopId ?? undefined);
        return (
          <>
            <div className="mb-4">
              <StatCard title="Total Conta Coop" value={formatCurrency(ex.total)} />
            </div>
            <DataTable
              data={ex.linhas.map((l, i) => ({ ...l, id: `${l.cooperadoId}_${i}` }))}
              keyField="id"
              columns={[
                { key: "cooperadoNome", label: "Cooperado" },
                { key: "motivo", label: "Descrição" },
                { key: "valor", label: "Valor", render: (l) => formatCurrency(l.valor) },
              ]}
              emptyMessage="Sem compras Conta Coop neste mês."
            />
          </>
        );
      }
      case "trilha_auditoria": {
        return <TrilhaAuditoriaPanel data={data} mes={mes} coopId={coopId} />;
      }
      case "parecer_contabil": {
        const parecer = coopId ? getParecerContabilMes(data, coopId, mes) : undefined;
        if (!parecer) {
          return (
            <Card>
              <p className="text-gray-600">Nenhum parecer registrado para {formatMesReferencia(mes)}.</p>
              <Link href={`/contador/parecer?mes=${mes}`} className="inline-block mt-3 text-sm text-green-700 font-medium">
                Registrar parecer contábil →
              </Link>
            </Card>
          );
        }
        return (
          <Card title={`Parecer — ${parecer.contadorNome}`}>
            <p className="text-xs text-gray-500 mb-3">
              {parecer.contadorFuncao} · {formatDate(parecer.emitidoEm.split("T")[0])}
            </p>
            <p className="text-sm whitespace-pre-wrap text-gray-800">{parecer.texto}</p>
          </Card>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Atualizados automaticamente conforme entregas, ficha corrida e pagamentos"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportCsv}>
              <Download size={16} /> CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportDocumento}>
              <FileText size={16} /> PDF
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer size={16} /> Imprimir
            </Button>
          </div>
        }
      />

      <FilterBar>
        <FormField label="Tipo de Relatório">
          <Select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
            }}
            className="min-w-[280px]"
          >
            {gruposRelatorio.map(([grupo, items]) => (
              <optgroup key={grupo} label={grupo}>
                {items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </FormField>
        <FormField label="Mês">
          <Select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="min-w-[180px]"
            disabled={RELATORIOS_CONSOLIDADOS.has(tipo) || RELATORIOS_MESES_MULTIPLOS.has(tipo)}
          >
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </FormField>
        {tipo === "entregas_por_itens" && (
          <FormField label="Meses em aberto">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 max-h-48 overflow-y-auto min-w-[320px]">
              <p className="text-xs text-amber-900 mb-3">
                Soma apenas entregas com pagamento pendente (fichas em aberto). Padrão: todos os meses com débito.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!data) return;
                    aplicarPadraoEntregasPorItensEmAberto();
                  }}
                >
                  Todos os meses em aberto
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {mesesEntregasItensOpcoes.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mesesEntregasItensEfetivos.includes(m)}
                      onChange={() => toggleMesEntregasItens(m)}
                      className="rounded border-gray-300 text-green-700 focus:ring-green-600"
                    />
                    {formatMesReferencia(m)}
                  </label>
                ))}
              </div>
            </div>
          </FormField>
        )}
        {RELATORIOS_INSTITUICAO_DOCUMENTO.has(tipo) ? (
          <FormField
            label={
              tipo === "atingimento_cronograma"
                ? "Contrato / Instituição"
                : tipo === "pagar_cooperado"
                  ? "Instituição do contrato"
                  : "Instituição de entrega"
            }
          >
            <Select value={instituicaoSelecionadaId} onChange={(e) => setInstituicaoId(e.target.value)} className="min-w-[250px]">
              <option value="">Selecione...</option>
              {instituicoesCoop.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {tipo === "pagar_cooperado" || tipo === "historico_reclamacoes" ? (
          <FormField label="Cooperado">
            <Select value={cooperadoId} onChange={(e) => setCooperadoId(e.target.value)} className="min-w-[200px]">
              <option value="">Todos</option>
              {data.cooperados
                .filter((c) => !coopId || c.cooperativaId === coopId)
                .map((c) => (
                <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </FilterBar>

      <Card>{renderRelatorio()}</Card>

      <ModalEmitirRelatorio
        open={modalEmissao !== null}
        onClose={() => setModalEmissao(null)}
        onConfirm={emitirDocumento}
        user={user}
        titulo={modalEmissao === "print" ? "Imprimir relatório" : "Emitir PDF do relatório"}
      />
    </div>
  );
}
