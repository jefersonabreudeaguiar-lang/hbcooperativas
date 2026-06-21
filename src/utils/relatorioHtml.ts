import type { AppData, FechamentoMensal } from "@/types";
import { PLATFORM_NAME } from "@/utils/constants";
import { formatCnpj } from "@/utils/cooperativa";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import type { FechamentoCalculado, RelatorioEntregasPorItens, ResumoFinanceiroMes } from "@/services/relatorioService";
import { calcularFechamentoMensalLive, getRelatorioEntregasPorItensInstituicao, getResumoFinanceiroMes } from "@/services/relatorioService";
import { baixarHtmlComoPdf } from "@/utils/downloadPdf";

const DOC_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; max-width: 820px; margin: 0 auto; color: #111; padding: 32px 24px; line-height: 1.45; }
  .header { border-bottom: 3px solid #14532d; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-family: system-ui, sans-serif; font-size: 1.5rem; color: #14532d; margin: 0 0 4px; letter-spacing: -0.02em; }
  .header .meta { font-family: system-ui, sans-serif; font-size: 13px; color: #555; }
  .header .periodo { font-family: system-ui, sans-serif; font-size: 1.1rem; font-weight: 700; color: #15803d; margin-top: 8px; }
  h2 { font-family: system-ui, sans-serif; font-size: 1rem; color: #14532d; margin: 28px 0 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; font-family: system-ui, sans-serif; font-size: 13px; margin: 12px 0; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
  th { background: #14532d; color: #fff; font-weight: 600; }
  tr:nth-child(even) td { background: #f9fafb; }
  .num { text-align: right; white-space: nowrap; }
  .resumo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .resumo-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; background: #fafafa; }
  .resumo-card .label { font-family: system-ui, sans-serif; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
  .resumo-card .value { font-family: system-ui, sans-serif; font-size: 1.25rem; font-weight: 700; color: #14532d; margin-top: 4px; }
  .status { font-family: system-ui, sans-serif; display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .status-aprovado { background: #dcfce7; color: #166534; }
  .status-revisado { background: #fef9c3; color: #854d0e; }
  .status-rascunho { background: #f3f4f6; color: #374151; }
  .destinatario { font-family: system-ui, sans-serif; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 18px; margin: 20px 0 24px; }
  .destinatario .rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #166534; font-weight: 700; margin-bottom: 8px; }
  .destinatario .nome { font-size: 1.05rem; font-weight: 700; color: #14532d; }
  .destinatario .detalhe { font-size: 13px; color: #374151; margin-top: 4px; }
  .carta { font-family: system-ui, sans-serif; font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 20px; }
  tfoot td { background: #ecfdf5; font-weight: 700; }
  .resumo-itens-box { font-family: system-ui, sans-serif; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 18px; margin: 16px 0 24px; }
  .resumo-itens-box .titulo { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #166534; font-weight: 700; margin-bottom: 12px; }
  .resumo-itens-list { margin: 0; padding: 0; list-style: none; }
  .resumo-itens-list li { padding: 6px 0; border-bottom: 1px solid #dcfce7; font-size: 14px; color: #14532d; }
  .resumo-itens-list li:last-child { border-bottom: none; }
  .resumo-itens-list .qtd { font-weight: 700; }
  .coop-bloco { margin-top: 20px; page-break-inside: avoid; }
  .coop-bloco h3 { font-family: system-ui, sans-serif; font-size: 14px; color: #374151; margin: 0 0 8px; font-weight: 700; }
  .assinatura { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .assinatura-linha { border-top: 1px solid #111; padding-top: 6px; font-family: system-ui, sans-serif; font-size: 12px; text-align: center; }
  @media print {
    body { padding: 12mm; margin: 0; }
    .no-print { display: none !important; }
    tr { page-break-inside: avoid; }
  }
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveCooperativa(data: AppData, cooperativaId?: string) {
  if (cooperativaId) {
    return data.cooperativas.find((c) => c.id === cooperativaId) ?? data.cooperativas[0];
  }
  return data.cooperativas[0];
}

function cooperativaHeader(
  data: AppData,
  titulo: string,
  mesReferencia: string,
  cooperativaId?: string
): string {
  const coop = resolveCooperativa(data, cooperativaId);
  const nome = coop?.nome ?? PLATFORM_NAME;
  const cnpj = coop?.cnpj ? formatCnpj(coop.cnpj) : "";
  const endereco = coop?.endereco ?? "";
  const telefone = coop?.telefone ?? "";
  const email = coop?.email ?? "";
  return `
    <div class="header">
      <h1>${escapeHtml(nome)}</h1>
      <div class="meta">
        ${cnpj ? `CNPJ: ${escapeHtml(cnpj)}<br/>` : ""}
        ${endereco ? `${escapeHtml(endereco)}<br/>` : ""}
        ${telefone ? `Tel.: ${escapeHtml(telefone)}<br/>` : ""}
        ${email ? `${escapeHtml(email)}<br/>` : ""}
      </div>
      <div class="periodo">${escapeHtml(titulo)} · ${escapeHtml(formatMesReferencia(mesReferencia))}</div>
    </div>`;
}

function documentoShell(
  titulo: string,
  body: string,
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string
): string {
  const gerado = formatDate(new Date().toISOString().split("T")[0]);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(titulo)} — ${escapeHtml(formatMesReferencia(mesReferencia))}</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
  ${cooperativaHeader(data, titulo, mesReferencia, cooperativaId)}
  ${body}
  <div class="footer">
    Documento gerado em ${gerado} · ${escapeHtml(PLATFORM_NAME)}<br/>
    Uso interno da cooperativa — conferir valores antes de arquivar ou encaminhar.
  </div>
  <script class="no-print">window.onload=function(){/* opcional: window.print() */}</script>
</body>
</html>`;
}

function statusLabel(status?: string): string {
  if (status === "aprovado") return '<span class="status status-aprovado">Aprovado</span>';
  if (status === "revisado") return '<span class="status status-revisado">Revisado</span>';
  return '<span class="status status-rascunho">Rascunho</span>';
}

function statusPagamentoLabel(s: string): string {
  const map: Record<string, string> = {
    pago: "Pago",
    pendente: "A pagar",
    aguardando_assinatura: "Aguardando assinatura",
    sem_entrega: "—",
  };
  return map[s] ?? s;
}

export function gerarRelatorioFechamentoHtml(
  data: AppData,
  mesReferencia: string,
  fechamento?: FechamentoMensal
): string {
  const calc = calcularFechamentoMensalLive(mesReferencia, data);

  const linhasCoop = calc.linhasCooperado
    .map(
      (l) =>
        `<tr>
          <td>${escapeHtml(l.cooperadoNome)}</td>
          <td class="num">${l.entregas}</td>
          <td class="num">${formatCurrency(l.valorBruto)}</td>
          <td class="num">${formatCurrency(l.aPagar)}</td>
          <td class="num">${formatCurrency(l.pago)}</td>
          <td>${statusPagamentoLabel(l.statusPagamento)}</td>
        </tr>`
    )
    .join("");

  const linhasInst = calc.linhasInstituicao
    .map(
      (l) =>
        `<tr>
          <td>${escapeHtml(l.instituicaoNome)}</td>
          <td class="num">${l.entregas}</td>
          <td class="num">${formatCurrency(l.valorBruto)}</td>
          <td class="num">${formatCurrency(l.valorLiquido)}</td>
        </tr>`
    )
    .join("");

  const body = `
    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#374151;">
      Fechamento mensal consolidado a partir das entregas conferidas, ficha corrida e pagamentos registrados no sistema.
      Status: ${statusLabel(fechamento?.status)}
      ${fechamento?.revisadoPor ? ` · Revisado por ${escapeHtml(fechamento.revisadoPor)} em ${formatDate(fechamento.dataRevisao ?? "")}` : ""}
      ${fechamento?.aprovadoPor ? ` · Aprovado por ${escapeHtml(fechamento.aprovadoPor)} em ${formatDate(fechamento.dataAprovacao ?? "")}` : ""}
    </p>

    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Total vendas (bruto)</div><div class="value">${formatCurrency(calc.totalVendas)}</div></div>
      <div class="resumo-card"><div class="label">Pagamentos realizados</div><div class="value">${formatCurrency(calc.totalPagamentos)}</div></div>
      <div class="resumo-card"><div class="label">Mensalidades recebidas</div><div class="value">${formatCurrency(calc.totalMensalidades)}</div></div>
      <div class="resumo-card"><div class="label">Cotas recebidas</div><div class="value">${formatCurrency(calc.totalCotas)}</div></div>
      <div class="resumo-card"><div class="label">Descontos</div><div class="value">${formatCurrency(calc.totalDescontos)}</div></div>
      <div class="resumo-card"><div class="label">Saldo estimado</div><div class="value">${formatCurrency(calc.saldoCooperativa)}</div></div>
    </div>

    <p style="font-family:system-ui,sans-serif;font-size:13px;color:#555;">
      ${calc.qtdEntregas} entrega(s) conferida(s) · ${calc.qtdCooperadosPagos} pagamento(s) confirmado(s) · ${calc.qtdCooperadosAPagar} cooperado(s) com valor a pagar
    </p>

    <h2>Resumo por cooperado</h2>
    <table>
      <thead><tr>
        <th>Cooperado</th><th class="num">Entregas</th><th class="num">Bruto</th>
        <th class="num">A pagar</th><th class="num">Pago</th><th>Situação</th>
      </tr></thead>
      <tbody>${linhasCoop || `<tr><td colspan="6">Nenhum lançamento neste mês.</td></tr>`}</tbody>
    </table>

    <h2>Resumo por instituição / contrato</h2>
    <table>
      <thead><tr>
        <th>Instituição</th><th class="num">Entregas</th><th class="num">Bruto</th><th class="num">Líquido</th>
      </tr></thead>
      <tbody>${linhasInst || `<tr><td colspan="4">Nenhuma entrega neste mês.</td></tr>`}</tbody>
    </table>

    <div class="assinatura">
      <div><div class="assinatura-linha">Responsável pela revisão</div></div>
      <div><div class="assinatura-linha">Tesoureiro</div></div>
    </div>`;

  return documentoShell("Fechamento mensal", body, data, mesReferencia);
}

function formatQuantidadeItem(quantidade: number, unidade: string): string {
  const q = quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return unidade ? `${q} ${unidade}` : q;
}

export function gerarRelatorioEntregasPorItensHtml(
  data: AppData,
  mesReferencia: string,
  instituicaoId: string,
  cooperativaId?: string
): string {
  const rel = getRelatorioEntregasPorItensInstituicao(mesReferencia, instituicaoId, data, cooperativaId);
  const coop = resolveCooperativa(data, cooperativaId);
  const inst = rel.instituicao;
  const localEntrega = inst?.localEntrega?.trim() || inst?.endereco?.trim() || "";
  const responsavelInst = inst?.responsavel?.trim() || "";
  const hoje = formatDate(new Date().toISOString().split("T")[0]);

  const linhasItens = rel.itens
    .map(
      (item, idx) =>
        `<tr>
          <td class="num">${idx + 1}</td>
          <td>${escapeHtml(item.produtoNome)}</td>
          <td>${escapeHtml(item.unidade)}</td>
          <td class="num">${item.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
          <td class="num">${formatCurrency(item.precoUnitario)}</td>
          <td class="num">${formatCurrency(item.valorTotal)}</td>
        </tr>`
    )
    .join("");

  const resumoConsolidadoLista = rel.itens
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.produtoNome)}</strong>: <span class="qtd">${escapeHtml(formatQuantidadeItem(item.quantidade, item.unidade))}</span> — ${formatCurrency(item.valorTotal)}</li>`
    )
    .join("");

  const body = `
    <div class="destinatario">
      <div class="rotulo">Destinatário</div>
      <div class="nome">${escapeHtml(rel.instituicaoNome)}</div>
      ${localEntrega ? `<div class="detalhe">${escapeHtml(localEntrega)}</div>` : ""}
      ${responsavelInst ? `<div class="detalhe">A/C ${escapeHtml(responsavelInst)}</div>` : ""}
      ${inst?.cnpj ? `<div class="detalhe">CNPJ: ${escapeHtml(formatCnpj(inst.cnpj))}</div>` : ""}
    </div>

    <p class="carta">
      ${responsavelInst ? `Prezado(a) Senhor(a) <strong>${escapeHtml(responsavelInst)}</strong>,` : "Prezado(a) Senhor(a),"}
      <br/><br/>
      A <strong>${escapeHtml(coop?.nome ?? PLATFORM_NAME)}</strong> apresenta o resumo consolidado das entregas
      realizadas no mês de <strong>${escapeHtml(formatMesReferencia(mesReferencia))}</strong>,
      referentes ao contrato de fornecimento com <strong>${escapeHtml(rel.instituicaoNome)}</strong>.
      ${rel.quantidadeEntregas > 0 ? ` Foram registradas <strong>${rel.quantidadeEntregas}</strong> entrega(s) conferida(s) no período.` : ""}
    </p>

    <div class="resumo-itens-box">
      <div class="titulo">Resumo consolidado do mês — total vendido por item (todos os cooperados)</div>
      ${
        rel.itens.length > 0
          ? `<ul class="resumo-itens-list">${resumoConsolidadoLista}</ul>
             <p class="carta" style="margin:12px 0 0;font-size:13px;">
               <strong>Total geral:</strong> ${formatCurrency(rel.totalBruto)} · ${rel.itens.length} item(ns) distinto(s)
             </p>`
          : `<p class="carta" style="margin:0;">Nenhum item conferido neste mês para esta instituição.</p>`
      }
    </div>

    <h2>Resumo por item (detalhado)</h2>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Item / Produto</th>
          <th>Unidade</th>
          <th class="num">Quantidade total</th>
          <th class="num">Valor unitário</th>
          <th class="num">Valor total</th>
        </tr>
      </thead>
      <tbody>
        ${linhasItens || `<tr><td colspan="6">Nenhum item conferido neste mês para esta instituição.</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">Total geral das entregas (bruto)</td>
          <td class="num">${formatCurrency(rel.totalBruto)}</td>
        </tr>
      </tfoot>
    </table>

    <p class="carta" style="margin-top:24px;">
      Este documento consolida as quantidades e valores unitários praticados nas entregas conferidas.
      Permanecemos à disposição para esclarecimentos.
    </p>

    <p class="carta" style="margin-top:32px;">
      ${escapeHtml(coop?.endereco ?? coop?.nome ?? PLATFORM_NAME)}, ${hoje}.
    </p>

    <div class="assinatura">
      <div><div class="assinatura-linha">${escapeHtml(coop?.nome ?? PLATFORM_NAME)}</div></div>
      <div><div class="assinatura-linha">Responsável</div></div>
    </div>`;

  return documentoShell(
    `Entregas — ${rel.instituicaoNome}`,
    body,
    data,
    mesReferencia,
    cooperativaId
  );
}

export function gerarRelatorioFinanceiroHtml(data: AppData, mesReferencia: string, tituloRelatorio: string): string {
  const r = getResumoFinanceiroMes(mesReferencia, data);
  const calc = calcularFechamentoMensalLive(mesReferencia, data);

  const linhasPagar = calc.linhasCooperado
    .filter((l) => l.aPagar > 0)
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.cooperadoNome)}</td><td class="num">${l.entregas}</td><td class="num">${formatCurrency(l.aPagar)}</td></tr>`
    )
    .join("");

  const body = `
    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Entregas conferidas</div><div class="value">${r.totalEntregas}</div></div>
      <div class="resumo-card"><div class="label">Vendas (bruto)</div><div class="value">${formatCurrency(r.totalVendasBruto)}</div></div>
      <div class="resumo-card"><div class="label">Vendas (líquido)</div><div class="value">${formatCurrency(r.totalVendasLiquido)}</div></div>
      <div class="resumo-card"><div class="label">A pagar cooperados</div><div class="value">${formatCurrency(r.valoresAPagar)}</div></div>
      <div class="resumo-card"><div class="label">Pagamentos realizados</div><div class="value">${formatCurrency(r.pagamentosRealizados)}</div></div>
      <div class="resumo-card"><div class="label">Aguardando conferência</div><div class="value">${r.entregasAguardando}</div></div>
    </div>

    <h2>Valores a pagar por cooperado</h2>
    <table>
      <thead><tr><th>Cooperado</th><th class="num">Entregas</th><th class="num">Valor a pagar</th></tr></thead>
      <tbody>${linhasPagar || `<tr><td colspan="3">Nenhum valor pendente neste mês.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2"><strong>Total</strong></td><td class="num"><strong>${formatCurrency(r.valoresAPagar)}</strong></td></tr></tfoot>
    </table>`;

  return documentoShell(tituloRelatorio, body, data, mesReferencia);
}

export async function baixarDocumento(html: string, nomeArquivo: string): Promise<void> {
  await baixarHtmlComoPdf(html, nomeArquivo);
}

/** @deprecated Use baixarDocumento */
export const baixarDocumentoHtml = baixarDocumento;

export function imprimirDocumentoHtml(html: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    void baixarDocumento(html, "relatorio.pdf");
    return;
  }
  w.document.write(html.replace(/window.onload=function\(\)\{[^}]*\}/, "window.onload=function(){window.print();}"));
  w.document.close();
}

export function nomeArquivoRelatorio(tipo: string, mesReferencia: string, sufixo?: string): string {
  const extra = sufixo
    ? `-${sufixo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)}`
    : "";
  return `relatorio-${tipo}-${mesReferencia}${extra}.pdf`;
}

export type { ResumoFinanceiroMes, FechamentoCalculado };
