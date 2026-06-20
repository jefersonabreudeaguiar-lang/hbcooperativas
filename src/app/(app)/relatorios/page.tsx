"use client";

import { useState, useMemo } from "react";
import { Download } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { PageHeader, FilterBar, DataTable } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getRelatorioResumoFinanceiro, getRelatorioPorCooperado, getRelatorioEntregasPorInstituicao,
  getRelatorioPNAE, exportToCSV, downloadCSV,
} from "@/services/dashboardService";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome, sumBy } from "@/utils/calculations";

const RELATORIOS = [
  { id: "resumo_financeiro", label: "Resumo Financeiro Mensal" },
  { id: "pagar_cooperado", label: "Valores a Pagar por Cooperado" },
  { id: "mensalidades_abertas", label: "Mensalidades em Aberto" },
  { id: "cotas_abertas", label: "Cotas em Aberto" },
  { id: "entregas_instituicao", label: "Entregas por Instituição" },
  { id: "vendas_pnae", label: "Vendas ao PNAE" },
  { id: "descontos_aplicados", label: "Descontos Aplicados" },
  { id: "saldo_mensal", label: "Saldo Mensal da Cooperativa" },
];

export default function RelatoriosPage() {
  const data = useAppData();
  const [tipo, setTipo] = useState("resumo_financeiro");
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [cooperadoId, setCooperadoId] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");

  const meses = useMemo(() => {
    if (!data) return [];
    const all = new Set([
      ...data.financeiro.map((f) => f.mesReferencia),
      ...data.entregas.map((e) => e.dataEntrega.slice(0, 7)),
      ...data.mensalidades.map((m) => m.mesReferencia),
    ]);
    return [...all].sort().reverse();
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    let headers: string[] = [];
    let rows: string[][] = [];

    switch (tipo) {
      case "mensalidades_abertas":
        headers = ["Cooperado", "Mês", "Valor", "Vencimento", "Status"];
        rows = data.mensalidades.filter((m) => m.status !== "paga").map((m) => [
          getCooperadoNome(data.cooperados, m.cooperadoId), m.mesReferencia, String(m.valor), m.vencimento, m.status,
        ]);
        break;
      case "cotas_abertas":
        headers = ["Cooperado", "Tipo", "Parcelas", "Valor Parcela", "Status"];
        rows = data.cotas.filter((c) => c.status !== "quitada").map((c) => [
          getCooperadoNome(data.cooperados, c.cooperadoId), c.tipo, `${c.parcelasPagas}/${c.quantidadeParcelas}`, String(c.valorParcela), c.status,
        ]);
        break;
      case "descontos_aplicados":
        headers = ["Data", "Cooperado", "Tipo", "Motivo", "Valor Descontado"];
        rows = data.descontos.map((d) => [
          d.data, getCooperadoNome(data.cooperados, d.cooperadoId), d.tipo, d.motivo, String(d.valorDescontado),
        ]);
        break;
      default:
        headers = ["Relatório", "Valor"];
        rows = [[tipo, mes]];
    }

    downloadCSV(`relatorio_${tipo}_${mes}.csv`, exportToCSV(headers, rows));
  };

  if (!data) return null;

  const renderRelatorio = () => {
    switch (tipo) {
      case "resumo_financeiro": {
        const r = getRelatorioResumoFinanceiro(mes, data);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Total Vendas" value={formatCurrency(r.totalVendas)} />
            <StatCard title="Total Líquido" value={formatCurrency(r.totalLiquido)} variant="success" />
            <StatCard title="Pagamentos Pendentes" value={String(r.pagamentosPendentes.length)} variant="warning" />
          </div>
        );
      }
      case "pagar_cooperado": {
        const pendentes = data.pagamentos.filter((p) => p.status === "pendente" || p.status === "parcial");
        const porCooperado = data.cooperados.map((c) => ({
          cooperado: c.nomeCompleto,
          total: sumBy(pendentes.filter((p) => p.cooperadoId === c.id), (p) => p.valorLiquido),
        })).filter((x) => x.total > 0);
        return (
          <DataTable data={porCooperado} keyField="cooperado" columns={[
            { key: "cooperado", label: "Cooperado" },
            { key: "total", label: "Valor a Pagar", render: (r) => formatCurrency(r.total) },
          ]} />
        );
      }
      case "mensalidades_abertas": {
        const items = data.mensalidades.filter((m) => m.status !== "paga");
        return (
          <DataTable data={items} keyField="id" columns={[
            { key: "cooperado", label: "Cooperado", render: (m) => getCooperadoNome(data.cooperados, m.cooperadoId) },
            { key: "mes", label: "Mês", render: (m) => formatMesReferencia(m.mesReferencia) },
            { key: "valor", label: "Valor", render: (m) => formatCurrency(m.valor) },
            { key: "vencimento", label: "Vencimento", render: (m) => formatDate(m.vencimento) },
            { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
          ]} />
        );
      }
      case "cotas_abertas": {
        const items = data.cotas.filter((c) => c.status !== "quitada");
        return (
          <DataTable data={items} keyField="id" columns={[
            { key: "cooperado", label: "Cooperado", render: (c) => getCooperadoNome(data.cooperados, c.cooperadoId) },
            { key: "tipo", label: "Tipo" },
            { key: "parcelas", label: "Parcelas", render: (c) => `${c.parcelasPagas}/${c.quantidadeParcelas}` },
            { key: "valorParcela", label: "Valor Parcela", render: (c) => formatCurrency(c.valorParcela) },
            { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
          ]} />
        );
      }
      case "entregas_instituicao": {
        const inst = instituicaoId || data.instituicoes[0]?.id;
        if (!inst) return <p className="text-gray-500">Selecione uma instituição.</p>;
        const r = getRelatorioEntregasPorInstituicao(inst, data);
        return (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard title="Total Bruto" value={formatCurrency(r.totalBruto)} />
              <StatCard title="Total Líquido" value={formatCurrency(r.totalLiquido)} variant="success" />
            </div>
            <DataTable data={r.entregas} keyField="id" columns={[
              { key: "data", label: "Data", render: (e) => formatDate(e.dataEntrega) },
              { key: "cooperado", label: "Cooperado", render: (e) => getCooperadoNome(data.cooperados, e.cooperadoId) },
              { key: "produto", label: "Produto" },
              { key: "valorBruto", label: "Bruto", render: (e) => formatCurrency(e.valorBruto) },
              { key: "status", label: "Status", render: (e) => <StatusBadge status={e.status} /> },
            ]} />
          </>
        );
      }
      case "vendas_pnae": {
        const r = getRelatorioPNAE(data);
        return (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard title="Total PNAE" value={formatCurrency(r.totalBruto)} variant="gold" />
              <StatCard title="Líquido PNAE" value={formatCurrency(r.totalLiquido)} variant="success" />
            </div>
            <DataTable data={r.entregas} keyField="id" columns={[
              { key: "data", label: "Data", render: (e) => formatDate(e.dataEntrega) },
              { key: "cooperado", label: "Cooperado", render: (e) => getCooperadoNome(data.cooperados, e.cooperadoId) },
              { key: "produto", label: "Produto" },
              { key: "valorBruto", label: "Bruto", render: (e) => formatCurrency(e.valorBruto) },
            ]} />
          </>
        );
      }
      case "descontos_aplicados": {
        return (
          <DataTable data={data.descontos} keyField="id" columns={[
            { key: "data", label: "Data", render: (d) => formatDate(d.data) },
            { key: "cooperado", label: "Cooperado", render: (d) => getCooperadoNome(data.cooperados, d.cooperadoId) },
            { key: "tipo", label: "Tipo" },
            { key: "motivo", label: "Motivo" },
            { key: "valorDescontado", label: "Descontado", render: (d) => formatCurrency(d.valorDescontado) },
          ]} />
        );
      }
      case "saldo_mensal": {
        const fin = data.financeiro.find((f) => f.mesReferencia === mes);
        if (!fin) return <Card><p className="text-gray-500">Sem dados para {formatMesReferencia(mes)}</p></Card>;
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
        subtitle="Relatórios filtráveis da cooperativa"
        action={<Button variant="secondary" onClick={handleExport}><Download size={18} /> Exportar CSV</Button>}
      />

      <FilterBar>
        <FormField label="Tipo de Relatório">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="min-w-[250px]">
            {RELATORIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Mês">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} className="min-w-[180px]">
            {meses.map((m) => <option key={m} value={m}>{formatMesReferencia(m)}</option>)}
          </Select>
        </FormField>
        {tipo === "entregas_instituicao" && (
          <FormField label="Instituição">
            <Select value={instituicaoId} onChange={(e) => setInstituicaoId(e.target.value)} className="min-w-[250px]">
              <option value="">Selecione...</option>
              {data.instituicoes.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Select>
          </FormField>
        )}
        {cooperadoId !== undefined && tipo === "pagar_cooperado" && (
          <FormField label="Cooperado">
            <Select value={cooperadoId} onChange={(e) => setCooperadoId(e.target.value)} className="min-w-[200px]">
              <option value="">Todos</option>
              {data.cooperados.map((c) => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
            </Select>
          </FormField>
        )}
      </FilterBar>

      <Card>{renderRelatorio()}</Card>
    </div>
  );
}
