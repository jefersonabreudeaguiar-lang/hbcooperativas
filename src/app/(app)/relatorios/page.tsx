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
} from "@/services/dashboardService";
import {
  baixarDocumento,
  gerarRelatorioEntregasPorItensHtml,
  gerarRelatorioFinanceiroHtml,
  gerarRelatorioSobrasPerdasHtml,
  imprimirDocumentoHtml,
  nomeArquivoRelatorio,
} from "@/utils/relatorioHtml";
import { ModalEmitirRelatorio } from "@/components/relatorios/ModalEmitirRelatorio";
import type { EmissorRelatorio } from "@/types";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import { labelUnidade } from "@/utils/unidades";

const RELATORIOS = [
  { id: "resumo_financeiro", label: "Resumo Financeiro Mensal" },
  { id: "pagar_cooperado", label: "Valores a Pagar por Cooperado" },
  { id: "mensalidades_abertas", label: "Mensalidades em Aberto" },
  { id: "cotas_abertas", label: "Cotas em Aberto" },
  { id: "entregas_instituicao", label: "Entregas por Instituição" },
  { id: "entregas_por_itens", label: "Entregas por Item (mensal)" },
  { id: "vendas_pnae", label: "Vendas ao PNAE" },
  { id: "descontos_aplicados", label: "Descontos Aplicados" },
  { id: "sobras_perdas", label: "Sobras e Perdas (transparência)" },
  { id: "saldo_mensal", label: "Saldo Mensal da Cooperativa" },
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
    if (tipo === "entregas_instituicao" || tipo === "entregas_por_itens") {
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
    if (tipo === "sobras_perdas") {
      return gerarRelatorioSobrasPerdasHtml(data, mes, coopId, emissor);
    }
    return gerarRelatorioFinanceiroHtml(data, mes, tituloRelatorio, emissor);
  };

  const nomeDocumento = () => {
    if (tipo === "entregas_por_itens") {
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

  if (!data || !user) return null;
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
          <Select value={mes} onChange={(e) => setMes(e.target.value)} className="min-w-[180px]">
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </FormField>
        {tipo === "entregas_instituicao" || tipo === "entregas_por_itens" ? (
          <FormField label="Instituição de entrega">
            <Select value={instituicaoSelecionadaId} onChange={(e) => setInstituicaoId(e.target.value)} className="min-w-[250px]">
              <option value="">Selecione...</option>
              {instituicoesCoop.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {tipo === "pagar_cooperado" && (
          <FormField label="Cooperado">
            <Select value={cooperadoId} onChange={(e) => setCooperadoId(e.target.value)} className="min-w-[200px]">
              <option value="">Todos</option>
              {data.cooperados.map((c) => (
                <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
              ))}
            </Select>
          </FormField>
        )}
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
