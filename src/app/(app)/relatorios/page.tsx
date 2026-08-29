"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, FileText } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
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
  getRelatorioEntregasPorItens,
  getRelatorioPNAE,
  getRelatorioPagarCooperado,
  listMesesComLancamentos,
  exportToCSV,
  downloadCSV,
  getRelatorioSobrasPerdas,
  getRelatorioAtingimentoCronograma,
} from "@/services/dashboardService";
import {
  baixarDocumento,
  gerarRelatorioEntregasPorItensHtml,
  gerarRelatorioFinanceiroHtml,
  gerarRelatorioAtingimentoCronogramaHtml,
  gerarRelatorioSobrasPerdasHtml,
  gerarRelatorioReclamacoesHtml,
  gerarRelatorioVotacoesHtml,
  gerarRelatorioConciliacaoHtml,
  gerarRelatorioDemonstrativoPagamentosHtml,
  imprimirDocumentoHtml,
  nomeArquivoRelatorio,
} from "@/utils/relatorioHtml";
import { ModalEmitirRelatorio } from "@/components/relatorios/ModalEmitirRelatorio";
import type { EmissorRelatorio } from "@/types";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import { getRelatorioReclamacoes } from "@/services/reclamacaoService";
import { getRelatorioVotacoes } from "@/services/votacaoService";
import {
  calcularConciliacaoMensal,
  getDemonstrativoPagamentosMes,
} from "@/services/conciliacaoMensalService";
import { labelUnidade } from "@/utils/unidades";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const RELATORIOS = [
  { id: "resumo_financeiro", label: "Resumo Financeiro Mensal" },
  { id: "pagar_cooperado", label: "Valores a Pagar por Cooperado" },
  { id: "mensalidades_abertas", label: "Mensalidades em Aberto" },
  { id: "cotas_abertas", label: "Cotas em Aberto" },
  { id: "entregas_instituicao", label: "Entregas por Instituição" },
  { id: "entregas_por_itens", label: "Entregas por Item (mensal)" },
  { id: "atingimento_cronograma", label: "Atingimento do Cronograma (contrato)" },
  { id: "vendas_pnae", label: "Vendas ao PNAE" },
  { id: "descontos_aplicados", label: "Descontos Aplicados" },
  { id: "sobras_perdas", label: "Sobras e Perdas (transparência)" },
  { id: "saldo_mensal", label: "Saldo Mensal da Cooperativa" },
  { id: "historico_reclamacoes", label: "Histórico de Reclamações" },
  { id: "historico_votacoes", label: "Histórico de Votações" },
  { id: "conciliacao_mensal", label: "R4 — Conciliação mensal (contador)" },
  { id: "demonstrativo_pagamentos", label: "R2 — Demonstrativo de pagamentos" },
];

export default function RelatoriosPage() {
  const data = useAppData();
  const { user, check } = usePermissions();
  const router = useRouter();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [tipo, setTipo] = useState("resumo_financeiro");
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [cooperadoId, setCooperadoId] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [modalEmissao, setModalEmissao] = useState<"pdf" | "print" | null>(null);

  useEffect(() => {
    if (user && !check("relatorios", "view")) {
      router.replace("/dashboard");
    }
  }, [user, router, check]);

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    return listMesesComLancamentos(data);
  }, [data]);

  const instituicoesCoop = useMemo(() => {
    if (!data) return [];
    return data.instituicoes.filter((i) => !coopId || i.cooperativaId === coopId);
  }, [data, coopId]);

  const instituicaoSelecionadaId = instituicaoId || instituicoesCoop[0]?.id || "";

  const tituloRelatorio = RELATORIOS.find((r) => r.id === tipo)?.label ?? "Relatório";

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
      if (!inst) return "";
      return gerarRelatorioEntregasPorItensHtml(data, mes, inst, coopId, emissor);
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
    return gerarRelatorioFinanceiroHtml(data, mes, tituloRelatorio, emissor);
  };

  const nomeDocumento = () => {
    if (tipo === "historico_reclamacoes") {
      return nomeArquivoRelatorio(tipo, getCurrentMesReferencia());
    }
    if (tipo === "historico_votacoes") {
      return nomeArquivoRelatorio(tipo, getCurrentMesReferencia());
    }
    if (tipo === "entregas_por_itens" || tipo === "atingimento_cronograma") {
      const inst = data?.instituicoes.find((i) => i.id === instituicaoSelecionadaId);
      return nomeArquivoRelatorio(tipo, mes, inst?.nome);
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
        headers = ["Cooperado", "Entregas", "Valor a pagar"];
        rows = getRelatorioPagarCooperado(mes, data, cooperadoId || undefined).map((x) => [
          x.cooperado,
          String(x.entregas),
          String(x.total),
        ]);
        break;
      }
      case "mensalidades_abertas":
        headers = ["Cooperado", "Mês", "Valor", "Vencimento", "Status"];
        rows = data.mensalidades
          .filter((m) => m.status !== "paga" && (!mes || m.mesReferencia === mes))
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
        if (!inst) break;
        const r = getRelatorioEntregasPorItens(inst, mes, data, coopId);
        headers = ["Item", "Unidade", "Quantidade total", "Valor unitário médio", "Valor total"];
        rows = r.itens.map((item) => [
          item.produtoNome,
          item.unidade,
          String(item.quantidade),
          String(item.precoUnitario),
          String(item.valorTotal),
        ]);
        if (rows.length > 0) {
          rows.push(["", "", "", "TOTAL GERAL", String(r.totalBruto)]);
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
      default:
        headers = ["Relatório", "Mês"];
        rows = [[tipo, mes]];
    }

    downloadCSV(`relatorio_${tipo}_${mes}.csv`, exportToCSV(headers, rows));
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

  const handleExportDocumento = () => {
    if (!check("relatorios", "export")) return;
    setModalEmissao("pdf");
  };

  const handlePrint = () => {
    if (!check("relatorios", "export")) return;
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
        const porCooperado = getRelatorioPagarCooperado(mes, data, cooperadoId || undefined);
        return (
          <DataTable
            data={porCooperado}
            keyField="cooperado"
            columns={[
              { key: "cooperado", label: "Cooperado" },
              { key: "entregas", label: "Entregas" },
              { key: "total", label: "Valor a Pagar", render: (r) => formatCurrency(r.total) },
            ]}
            emptyMessage="Nenhum valor a pagar neste mês."
          />
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
        const r = getRelatorioEntregasPorItens(inst, mes, data, coopId);
        return (
          <>
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50/60 p-4">
              <p className="text-sm font-semibold text-green-900">{r.instituicaoNome}</p>
              <p className="text-xs text-green-800 mt-1">
                {formatMesReferencia(mes)} · {r.quantidadeEntregas} entrega(s) conferida(s)
              </p>
            </div>

            <div className="mb-6 rounded-xl border border-emerald-300 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-800 mb-3">
                Resumo consolidado do mês — total por item (todos os cooperados)
              </h3>
              {r.itens.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum item conferido neste mês.</p>
              ) : (
                <ul className="space-y-2">
                  {r.itens.map((item) => (
                    <li
                      key={item.produtoInstituicaoId || `${item.produtoNome}-${item.unidade}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-50 pb-2 last:border-0"
                    >
                      <span className="font-semibold text-gray-900">{item.produtoNome}</span>
                      <span className="text-sm text-emerald-900">
                        {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                        {labelUnidade(item.unidade) || item.unidade}
                        <span className="text-gray-500 mx-2">·</span>
                        {formatCurrency(item.valorTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.itens.length > 0 && (
                <p className="mt-4 text-right text-lg font-bold text-green-800">
                  Total geral: {formatCurrency(r.totalBruto)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <StatCard title="Itens distintos" value={String(r.itens.length)} />
              <StatCard title="Total geral (bruto)" value={formatCurrency(r.totalBruto)} variant="success" />
            </div>
            <DataTable
              data={r.itens.map((item, idx) => ({
                ...item,
                id: item.produtoInstituicaoId || `${item.produtoNome}-${idx}`,
              }))}
              keyField="id"
              emptyMessage="Nenhum item conferido neste mês para esta instituição."
              columns={[
                { key: "produto", label: "Item", render: (item) => item.produtoNome },
                {
                  key: "unidade",
                  label: "Unidade",
                  render: (item) => labelUnidade(item.unidade) || item.unidade,
                },
                {
                  key: "quantidade",
                  label: "Quantidade total",
                  render: (item) =>
                    `${item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${item.unidade}`,
                },
                { key: "preco", label: "Preço médio", render: (item) => formatCurrency(item.precoUnitario) },
                { key: "total", label: "Valor total", render: (item) => formatCurrency(item.valorTotal) },
              ]}
            />

            <p className="text-xs text-gray-500 mt-4">
              Use <strong>PDF</strong> para baixar o relatório formal com o resumo consolidado por item.
            </p>
          </>
        );
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
                { key: "status", label: "Status" },
              ]}
            />
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
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="min-w-[250px]">
            {RELATORIOS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Mês">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} className="min-w-[180px]" disabled={tipo === "historico_reclamacoes" || tipo === "historico_votacoes"}>
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </FormField>
        {tipo === "entregas_instituicao" || tipo === "entregas_por_itens" || tipo === "atingimento_cronograma" ? (
          <FormField label={tipo === "atingimento_cronograma" ? "Contrato / Instituição" : "Instituição de entrega"}>
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
