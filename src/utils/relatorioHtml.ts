import type { AppData, EmissorRelatorio, FechamentoMensal } from "@/types";
import { PLATFORM_NAME } from "@/utils/constants";
import { formatCnpj } from "@/utils/cooperativa";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { FechamentoCalculado, RelatorioEntregasPorItens, ResumoFinanceiroMes } from "@/services/relatorioService";
import { calcularFechamentoMensalLive, getRelatorioEntregasPorItensInstituicao, getResumoFinanceiroMes } from "@/services/relatorioService";
import { getRelatorioSobrasPerdas, type RelatorioSobrasPerdas } from "@/services/sobrasPerdasService";
import { getRelatorioReclamacoes } from "@/services/reclamacaoService";
import { getRelatorioVotacoes } from "@/services/votacaoService";
import { getRelatorioAtingimentoCronograma, type StatusAtingimentoItem } from "@/services/relatorioCronogramaService";
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
  .box-transparencia { font-family: system-ui, sans-serif; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px 18px; margin: 20px 0; }
  .box-transparencia .titulo { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #92400e; font-weight: 700; margin-bottom: 10px; }
  .box-transparencia ul { margin: 0; padding-left: 18px; font-size: 13px; color: #78350f; line-height: 1.55; }
  .box-perdas { border-left: 4px solid #dc2626; }
  .box-sobras { border-left: 4px solid #d97706; }
  .box-equacao { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px 18px; margin: 20px 0; font-family: system-ui, sans-serif; }
  .box-equacao .titulo { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #166534; font-weight: 700; margin-bottom: 10px; }
  .box-equacao .linha { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 14px; color: #14532d; border-bottom: 1px dashed #bbf7d0; }
  .box-equacao .linha:last-child { border-bottom: none; font-weight: 700; font-size: 15px; padding-top: 8px; }
  .valor-perda { color: #b91c1c; font-weight: 600; }
  .valor-sobra { color: #b45309; font-weight: 600; }
  .valor-positivo { color: #15803d; font-weight: 600; }
  .assinatura { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .assinatura-linha { border-top: 1px solid #111; padding-top: 6px; font-family: system-ui, sans-serif; font-size: 12px; text-align: center; }
  .assinatura-img { max-height: 72px; max-width: 220px; margin: 0 auto 8px; display: block; }
  .emissor-box { font-family: system-ui, sans-serif; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 24px 0 8px; font-size: 13px; }
  .emissor-box .rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 700; margin-bottom: 6px; }
  .emissor-box .nome { font-weight: 700; color: #111; }
  .emissor-box .detalhe { color: #475569; margin-top: 2px; }
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
  cooperativaId?: string,
  periodoLabel?: string
): string {
  const coop = resolveCooperativa(data, cooperativaId);
  const nome = coop?.nome ?? PLATFORM_NAME;
  const cnpj = coop?.cnpj ? formatCnpj(coop.cnpj) : "";
  const endereco = coop?.endereco ?? "";
  const telefone = coop?.telefone ?? "";
  const email = coop?.email ?? "";
  const periodo = periodoLabel ?? formatMesReferencia(mesReferencia);
  return `
    <div class="header">
      <h1>${escapeHtml(nome)}</h1>
      <div class="meta">
        ${cnpj ? `CNPJ: ${escapeHtml(cnpj)}<br/>` : ""}
        ${endereco ? `${escapeHtml(endereco)}<br/>` : ""}
        ${telefone ? `Tel.: ${escapeHtml(telefone)}<br/>` : ""}
        ${email ? `${escapeHtml(email)}<br/>` : ""}
      </div>
      <div class="periodo">${escapeHtml(titulo)} · ${escapeHtml(periodo)}</div>
    </div>`;
}

function documentoShell(
  titulo: string,
  body: string,
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio,
  periodoLabel?: string
): string {
  const gerado = formatDate(new Date().toISOString().split("T")[0]);
  const emissorHtml = emissor ? blocoEmissorAssinatura(emissor) : "";
  const periodo = periodoLabel ?? formatMesReferencia(mesReferencia);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(titulo)} — ${escapeHtml(periodo)}</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
  ${cooperativaHeader(data, titulo, mesReferencia, cooperativaId, periodoLabel)}
  ${body}
  ${emissorHtml}
  <div class="footer">
    Documento gerado em ${gerado} · ${escapeHtml(PLATFORM_NAME)}<br/>
    Uso interno da cooperativa — conferir valores antes de arquivar ou encaminhar.
  </div>
  <script class="no-print">window.onload=function(){/* opcional: window.print() */}</script>
</body>
</html>`;
}

function blocoEmissorAssinatura(emissor: EmissorRelatorio): string {
  const dataEmissao = formatDate(emissor.emitidoEm.split("T")[0]);
  const hora = new Date(emissor.emitidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const assinaturaImg = emissor.assinaturaDataUrl
    ? `<img class="assinatura-img" src="${emissor.assinaturaDataUrl}" alt="Assinatura" />`
    : "";

  return `
    <div class="emissor-box">
      <div class="rotulo">Responsável emissor</div>
      <div class="nome">${escapeHtml(emissor.nome)}</div>
      <div class="detalhe">${escapeHtml(emissor.funcao)}</div>
      <div class="detalhe">Emitido em ${dataEmissao} às ${hora}</div>
    </div>
    <div class="assinatura">
      <div>
        ${assinaturaImg}
        <div class="assinatura-linha">${escapeHtml(emissor.nome)}<br/>${escapeHtml(emissor.funcao)}</div>
      </div>
      <div><div class="assinatura-linha">Visto / conferência</div></div>
    </div>`;
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
  fechamento?: FechamentoMensal,
  emissor?: EmissorRelatorio
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
    </table>`;

  return documentoShell("Fechamento mensal", body, data, mesReferencia, undefined, emissor);
}

function formatQuantidadeItem(quantidade: number, unidade: string): string {
  const q = quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return unidade ? `${q} ${unidade}` : q;
}

export function gerarRelatorioEntregasPorItensHtml(
  data: AppData,
  mesReferencia: string,
  instituicaoId: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
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
    </p>`;

  return documentoShell(
    `Entregas — ${rel.instituicaoNome}`,
    body,
    data,
    mesReferencia,
    cooperativaId,
    emissor
  );
}

export function gerarRelatorioFinanceiroHtml(
  data: AppData,
  mesReferencia: string,
  tituloRelatorio: string,
  emissor?: EmissorRelatorio
): string {
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

  return documentoShell(tituloRelatorio, body, data, mesReferencia, undefined, emissor);
}

function statusCooperadoSobrasLabel(s: string): string {
  const map: Record<string, string> = {
    pago: "Pago",
    pendente: "A pagar",
    aguardando_assinatura: "Aguardando assinatura",
    sem_entrega: "Sem entrega",
  };
  return map[s] ?? s;
}

function blocoEquacaoTransparencia(eq: RelatorioSobrasPerdas["equacao"]): string {
  return `
    <div class="box-equacao">
      <div class="titulo">Equação de transparência — apuração do mês</div>
      <div class="linha"><span>Valor bruto das entregas conferidas</span><span class="num">${formatCurrency(eq.valorBrutoEntregas)}</span></div>
      <div class="linha"><span>(−) Total de perdas e retenções</span><span class="num valor-perda">${formatCurrency(eq.totalPerdas)}</span></div>
      <div class="linha"><span>(+) Créditos avulsos na apuração</span><span class="num valor-positivo">${formatCurrency(eq.totalCreditos)}</span></div>
      <div class="linha"><span>(=) Valor líquido apurado</span><span class="num">${formatCurrency(eq.valorLiquidoApurado)}</span></div>
      <div class="linha"><span>(−) Pagamentos confirmados</span><span class="num valor-positivo">${formatCurrency(eq.totalPagoConfirmado)}</span></div>
      <div class="linha"><span>(=) Saldo a acertar (sobras)</span><span class="num valor-sobra">${formatCurrency(eq.totalSobrasAcertar)}</span></div>
    </div>`;
}

export function gerarRelatorioSobrasPerdasHtml(
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const rel = getRelatorioSobrasPerdas(mesReferencia, data, cooperativaId);
  const eq = rel.equacao;

  const linhasPerdas = rel.perdas
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(p.categoria)}</td>
          <td>${escapeHtml(p.descricao)}${p.quantidade != null ? ` <em>(${p.quantidade})</em>` : ""}</td>
          <td class="num valor-perda">${formatCurrency(p.valor)}</td>
        </tr>`
    )
    .join("");

  const linhasSobras = rel.sobras
    .map(
      (s) =>
        `<tr>
          <td>${escapeHtml(s.categoria)}</td>
          <td>${escapeHtml(s.descricao)}${s.quantidade != null ? ` <em>(${s.quantidade})</em>` : ""}</td>
          <td class="num valor-sobra">${formatCurrency(s.valor)}</td>
        </tr>`
    )
    .join("");

  const linhasCoop = rel.linhasCooperado
    .map((l) => {
      const perdasDet = l.detalhePerdas
        .filter((d) => d.valor !== 0)
        .map((d) => `${escapeHtml(d.motivo)}: ${formatCurrency(Math.abs(d.valor))}${d.valor < 0 ? " (crédito)" : ""}`)
        .join("; ");
      return `<tr>
        <td>${escapeHtml(l.cooperadoNome)}</td>
        <td class="num">${l.entregasConferidas}</td>
        <td class="num">${formatCurrency(l.valorBruto)}</td>
        <td class="num valor-perda">${formatCurrency(l.taxaCooperativa + l.outrasPerdas)}</td>
        <td class="num valor-positivo">${formatCurrency(l.creditosAvulsos)}</td>
        <td class="num">${formatCurrency(l.valorLiquido)}</td>
        <td class="num valor-positivo">${formatCurrency(l.valorPago)}</td>
        <td class="num valor-sobra">${formatCurrency(l.sobraAcertar)}</td>
        <td>${statusCooperadoSobrasLabel(l.statusPagamento)}</td>
        <td style="font-size:11px;color:#555;">${perdasDet || "—"}</td>
      </tr>`;
    })
    .join("");

  const observacoes = rel.observacoesTransparencia
    .map((o) => `<li>${escapeHtml(o)}</li>`)
    .join("");

  const body = `
    <p class="carta">
      Este relatório consolida <strong>perdas</strong> (retenções, taxas e descontos) e <strong>sobras</strong>
      (saldos pendentes de acerto) referentes ao mês de <strong>${escapeHtml(formatMesReferencia(mesReferencia))}</strong>.
      Destina-se à prestação de contas, conferência da diretoria e planejamento de acertos futuros com os cooperados.
    </p>

    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Entregas conferidas</div><div class="value">${rel.entregasConferidas}</div></div>
      <div class="resumo-card"><div class="label">Valor bruto</div><div class="value">${formatCurrency(eq.valorBrutoEntregas)}</div></div>
      <div class="resumo-card"><div class="label">Total perdas</div><div class="value valor-perda">${formatCurrency(eq.totalPerdas)}</div></div>
      <div class="resumo-card"><div class="label">Líquido apurado</div><div class="value">${formatCurrency(eq.valorLiquidoApurado)}</div></div>
      <div class="resumo-card"><div class="label">Pago confirmado</div><div class="value valor-positivo">${formatCurrency(eq.totalPagoConfirmado)}</div></div>
      <div class="resumo-card"><div class="label">Saldo a acertar</div><div class="value valor-sobra">${formatCurrency(eq.totalSobrasAcertar)}</div></div>
    </div>

    ${blocoEquacaoTransparencia(eq)}

    <div class="box-transparencia">
      <div class="titulo">Notas para transparência e acertos futuros</div>
      <ul>${observacoes}</ul>
    </div>

    <h2>Perdas — retenções e descontos do mês</h2>
    <table>
      <thead><tr><th>Categoria</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhasPerdas || `<tr><td colspan="3">Nenhuma perda registrada neste mês.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2"><strong>Total de perdas</strong></td><td class="num valor-perda"><strong>${formatCurrency(eq.totalPerdas)}</strong></td></tr></tfoot>
    </table>

    <h2>Sobras — saldos pendentes de acerto</h2>
    <table>
      <thead><tr><th>Categoria</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhasSobras || `<tr><td colspan="3">Nenhuma sobra pendente neste mês.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2"><strong>Saldo a acertar (cooperados)</strong></td><td class="num valor-sobra"><strong>${formatCurrency(eq.totalSobrasAcertar)}</strong></td></tr></tfoot>
    </table>

    <p style="font-family:system-ui,sans-serif;font-size:13px;color:#555;margin-top:8px;">
      ${rel.entregasAguardandoConferencia} entrega(s) aguardando conferência ·
      ${rel.entregasRejeitadas} rejeitada(s) ·
      ${formatCurrency(eq.totalAguardandoAssinatura)} aguardando assinatura de recibo
    </p>

    <h2>Detalhamento por cooperado</h2>
    <table>
      <thead><tr>
        <th>Cooperado</th><th class="num">Entregas</th><th class="num">Bruto</th>
        <th class="num">Perdas</th><th class="num">Créditos</th><th class="num">Líquido</th>
        <th class="num">Pago</th><th class="num">A acertar</th><th>Situação</th><th>Detalhe</th>
      </tr></thead>
      <tbody>${linhasCoop || `<tr><td colspan="10">Nenhum lançamento neste mês.</td></tr>`}</tbody>
    </table>

    <p class="carta" style="margin-top:28px;">
      Documento elaborado para garantir transparência na gestão da cooperativa. Recomenda-se arquivar junto ao
      fechamento mensal e utilizar os saldos «a acertar» como base para os pagamentos e conferências do período seguinte.
    </p>`;

  return documentoShell(
    "Relatório de Sobras e Perdas",
    body,
    data,
    mesReferencia,
    cooperativaId,
    emissor
  );
}

export function gerarRelatorioReclamacoesHtml(
  data: AppData,
  cooperativaId?: string,
  cooperadoId?: string,
  emissor?: EmissorRelatorio
): string {
  const rel = getRelatorioReclamacoes(data, cooperativaId, cooperadoId);
  const mesRef = getCurrentMesReferencia();

  const linhasHistorico = rel.historico
    .map(
      (r) =>
        `<tr>
          <td>${escapeHtml(formatDate(r.data))}</td>
          <td>${escapeHtml(r.cooperadoNome)}</td>
          <td>${escapeHtml(r.item)}</td>
          <td>${escapeHtml(r.descricao)}</td>
          <td>${escapeHtml(r.registradoPorNome ?? "—")}</td>
        </tr>`
    )
    .join("");

  const linhasDistribuicao = rel.porCooperado
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(p.cooperadoNome)}</td>
          <td class="num">${p.quantidade}</td>
          <td class="num">${p.percentual.toLocaleString("pt-BR")}%</td>
        </tr>`
    )
    .join("");

  const somaPct = rel.porCooperado.reduce((s, p) => s + p.percentual, 0);

  const body = `
    <p class="carta">
      Relatório consolidado do <strong>histórico de reclamações</strong> registradas pela diretoria/responsável.
      Inclui levantamento quantitativo e distribuição percentual por cooperado (base 100%).
    </p>

    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Total de reclamações</div><div class="value">${rel.total}</div></div>
      <div class="resumo-card"><div class="label">Cooperados com ocorrências</div><div class="value">${rel.porCooperado.length}</div></div>
      <div class="resumo-card"><div class="label">Soma dos percentuais</div><div class="value">${somaPct.toLocaleString("pt-BR")}%</div></div>
      <div class="resumo-card"><div class="label">Maior incidência</div><div class="value" style="font-size:1rem;">${
        rel.porCooperado[0]
          ? `${escapeHtml(rel.porCooperado[0].cooperadoNome)} (${rel.porCooperado[0].percentual.toLocaleString("pt-BR")}%)`
          : "—"
      }</div></div>
    </div>

    <h2>Distribuição por cooperado</h2>
    <table>
      <thead><tr><th>Cooperado</th><th class="num">Reclamações</th><th class="num">% do total</th></tr></thead>
      <tbody>${linhasDistribuicao || `<tr><td colspan="3">Nenhuma reclamação registrada.</td></tr>`}</tbody>
      ${
        rel.porCooperado.length > 0
          ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${rel.total}</strong></td><td class="num"><strong>100%</strong></td></tr></tfoot>`
          : ""
      }
    </table>

    <h2>Histórico completo</h2>
    <table>
      <thead><tr><th>Data</th><th>Cooperado</th><th>Item</th><th>Descrição</th><th>Registrado por</th></tr></thead>
      <tbody>${linhasHistorico || `<tr><td colspan="5">Nenhuma reclamação registrada.</td></tr>`}</tbody>
    </table>

    <p class="carta" style="margin-top:28px;">
      Documento para arquivo interno, assembleia ou prestação de contas. Os percentuais representam a participação
      de cada cooperado no total de reclamações levantadas.
    </p>`;

  return documentoShell(
    "Histórico de Reclamações",
    body,
    data,
    mesRef,
    cooperativaId,
    emissor,
    "Histórico completo"
  );
}

export function gerarRelatorioVotacoesHtml(
  data: AppData,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const rel = getRelatorioVotacoes(data, cooperativaId);
  const mesRef = getCurrentMesReferencia();

  const blocos = rel.pautas
    .map(({ pauta, resumo }) => {
      const linhasVotos = resumo.votos
        .map(
          (v) =>
            `<tr>
              <td>${escapeHtml(v.cooperadoNome)}</td>
              <td class="num">${v.voto === "sim" ? "SIM" : "NÃO"}</td>
              <td>${escapeHtml(formatDate(v.createdAt.split("T")[0]))}</td>
            </tr>`
        )
        .join("");

      return `
        <h2>${escapeHtml(pauta.texto)}</h2>
        <p class="carta" style="margin-top:0;">
          Período: ${escapeHtml(formatDate(pauta.inicioEm))} a ${escapeHtml(formatDate(pauta.fimEm))} ·
          Status: ${escapeHtml(pauta.status)} · Votos: ${resumo.totalVotos} de ${resumo.totalElegiveis}
        </p>
        <div class="resumo-grid">
          <div class="resumo-card"><div class="label">SIM</div><div class="value">${resumo.pctSim.toLocaleString("pt-BR")}%</div></div>
          <div class="resumo-card"><div class="label">NÃO</div><div class="value">${resumo.pctNao.toLocaleString("pt-BR")}%</div></div>
        </div>
        <table>
          <thead><tr><th>Cooperado</th><th class="num">Voto</th><th>Data</th></tr></thead>
          <tbody>${linhasVotos || `<tr><td colspan="3">Nenhum voto registrado.</td></tr>`}</tbody>
        </table>`;
    })
    .join("");

  const body = `
    <p class="carta">
      Registro histórico das <strong>pautas de votação</strong> da cooperativa, com voto nominal de cada cooperado
      e percentuais de SIM e NÃO (base 100% sobre os votos computados).
    </p>
    ${blocos || `<p class="carta">Nenhuma pauta de votação registrada.</p>`}`;

  return documentoShell(
    "Histórico de Votações",
    body,
    data,
    mesRef,
    cooperativaId,
    emissor,
    "Pautas assembleares"
  );
}

function rotuloStatusAtingimento(status: StatusAtingimentoItem): string {
  switch (status) {
    case "atingido":
      return "Atingido";
    case "parcial":
      return "Parcial";
    case "critico":
      return "Crítico";
    case "nao_entregue":
      return "Não entregue";
  }
}

function classeStatusAtingimento(status: StatusAtingimentoItem): string {
  switch (status) {
    case "atingido":
      return "status-aprovado";
    case "parcial":
      return "status-revisado";
    default:
      return "status-rascunho";
  }
}

export function gerarRelatorioAtingimentoCronogramaHtml(
  data: AppData,
  mesReferencia: string,
  instituicaoId: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const r = getRelatorioAtingimentoCronograma(data, instituicaoId, mesReferencia, cooperativaId);
  const pct = r.percentualAtingimentoValor;
  const pctClass = pct >= 100 ? "valor-positivo" : pct >= 70 ? "valor-sobra" : "valor-perda";

  const linhasItens = r.itens
    .map(
      (i) => `<tr>
        <td>${escapeHtml(i.produtoNome)}</td>
        <td class="num">${i.quantidadePrevista.toLocaleString("pt-BR")} ${escapeHtml(i.unidade)}</td>
        <td class="num">${i.quantidadeEntregue.toLocaleString("pt-BR")}</td>
        <td class="num">${i.quantidadeFaltante.toLocaleString("pt-BR")}</td>
        <td class="num">${formatCurrency(i.valorPrevisto)}</td>
        <td class="num">${formatCurrency(i.valorEntregue)}</td>
        <td class="num ${i.valorFaltante > 0 ? "valor-perda" : "valor-positivo"}">${formatCurrency(i.valorFaltante)}</td>
        <td class="num"><strong>${i.percentualValor.toLocaleString("pt-BR")}%</strong></td>
        <td><span class="status ${classeStatusAtingimento(i.status)}">${rotuloStatusAtingimento(i.status)}</span></td>
      </tr>`
    )
    .join("");

  const linhasCriticos =
    r.itensCriticos.length > 0
      ? `<ul>${r.itensCriticos
          .map(
            (i) =>
              `<li><strong>${escapeHtml(i.produtoNome)}</strong> — ${i.percentualValor.toLocaleString("pt-BR")}% do valor previsto (${formatCurrency(i.valorFaltante)} em aberto)</li>`
          )
          .join("")}</ul>`
      : "<p>Nenhum item crítico neste período.</p>";

  const linhasCoop = r.porCooperado
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.cooperadoNome)}</td>
        <td class="num">${c.entregas}</td>
        <td class="num">${formatCurrency(c.valorEntregue)}</td>
        <td class="num">${c.percentualDoContrato.toLocaleString("pt-BR")}%</td>
      </tr>`
    )
    .join("");

  const avisoCronograma = r.cronograma
    ? ""
    : `<div class="box-transparencia box-perdas" style="margin-bottom:20px">
        <div class="titulo">Cronograma não lançado</div>
        <p style="font-size:13px;color:#78350f;margin:0">Não há meta cadastrada para este mês. Lance o cronograma em Contratos → Cronogramas para habilitar a comparação.</p>
      </div>`;

  const body = `
    ${avisoCronograma}
    <div class="destinatario">
      <div class="rotulo">Contrato / Instituição contratante</div>
      <div class="nome">${escapeHtml(r.instituicaoNome)}</div>
      ${r.anotacaoMes ? `<div class="detalhe"><strong>Referência do mês:</strong> ${escapeHtml(r.anotacaoMes)}</div>` : ""}
    </div>

    <p class="carta">
      Relatório de desempenho da cooperativa frente ao cronograma mensual recebido da contratante.
      Compara o valor limite contratual com o total entregue por todos os cooperados no período,
      destacando itens com dificuldade de atingimento e saldos pendentes.
    </p>

    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Meta do contrato (limite)</div><div class="value">${formatCurrency(r.valorLimiteContrato)}</div></div>
      <div class="resumo-card"><div class="label">Total entregue</div><div class="value">${formatCurrency(r.valorEntregueTotal)}</div></div>
      <div class="resumo-card"><div class="label">Saldo a entregar</div><div class="value valor-perda">${formatCurrency(r.valorFaltante)}</div></div>
      <div class="resumo-card"><div class="label">Atingimento global</div><div class="value ${pctClass}">${pct.toLocaleString("pt-BR")}%</div></div>
    </div>

    <div class="box-equacao">
      <div class="titulo">Equação de atingimento</div>
      <div class="linha"><span>Valor entregue</span><span>${formatCurrency(r.valorEntregueTotal)}</span></div>
      <div class="linha"><span>Meta do cronograma</span><span>${formatCurrency(r.valorLimiteContrato)}</span></div>
      <div class="linha"><span>Atingimento</span><span class="${pctClass}">${pct.toLocaleString("pt-BR")}% · ${r.quantidadeEntregas} entrega(s) conferida(s)</span></div>
    </div>

    <h2>Itens — previsto × entregue</h2>
    <table>
      <thead><tr>
        <th>Item</th><th class="num">Previsto</th><th class="num">Entregue</th><th class="num">Falta (qtd)</th>
        <th class="num">Valor previsto</th><th class="num">Valor entregue</th><th class="num">Falta (R$)</th>
        <th class="num">%</th><th>Status</th>
      </tr></thead>
      <tbody>${linhasItens || `<tr><td colspan="9">Nenhum item no cronograma deste mês.</td></tr>`}</tbody>
      <tfoot><tr>
        <td colspan="4"><strong>Totais</strong></td>
        <td class="num">${formatCurrency(r.valorLimiteContrato)}</td>
        <td class="num">${formatCurrency(r.valorEntregueTotal)}</td>
        <td class="num">${formatCurrency(r.valorFaltante)}</td>
        <td class="num"><strong>${pct.toLocaleString("pt-BR")}%</strong></td>
        <td></td>
      </tr></tfoot>
    </table>

    <div class="box-transparencia box-perdas">
      <div class="titulo">Itens com maior dificuldade de atingimento</div>
      ${linhasCriticos}
    </div>

    <h2>Contribuição por cooperado</h2>
    <table>
      <thead><tr>
        <th>Cooperado</th><th class="num">Entregas</th><th class="num">Valor entregue</th><th class="num">% da meta</th>
      </tr></thead>
      <tbody>${linhasCoop || `<tr><td colspan="4">Nenhuma entrega conferida neste mês.</td></tr>`}</tbody>
    </table>

    <p class="carta" style="margin-top:28px;">
      Documento gerado para acompanhamento gerencial e prestação de contas à contratante.
      Recomenda-se revisar os itens críticos e ajustar a logística de entregas antes do fechamento do mês.
    </p>`;

  return documentoShell(
    "Relatório de Atingimento do Cronograma",
    body,
    data,
    mesReferencia,
    cooperativaId,
    emissor
  );
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
