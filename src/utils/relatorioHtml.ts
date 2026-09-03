import type { AppData, EmissorRelatorio, FechamentoMensal, Cooperativa, Instituicao } from "@/types";
import { PLATFORM_NAME } from "@/utils/constants";
import { formatCnpj } from "@/utils/cooperativa";
import { round2 } from "@/utils/calculations";
import { formatCurrency, formatDate, formatDateTime, formatMesReferencia, formatCpfCnpj, getCurrentMesReferencia } from "@/utils/format";
import type { FechamentoCalculado, RelatorioEntregasPorItens, RelatorioEntregasPorItensEmAberto, RelatorioEntregasPorItensPeriodo, ResumoFinanceiroEmAberto, ResumoFinanceiroMes } from "@/services/relatorioService";
import {
  calcularFechamentoMensalLive,
  getCooperadoNomeSafe,
  getRelatorioEntregasInstituicaoLive,
  getRelatorioEntregasPorItensEmAberto,
  getRelatorioEntregasPorItensInstituicao,
  getRelatorioEntregasPorItensPeriodo,
  getRelatorioMensalidadesEmAbertoConsolidado,
  getRelatorioPagarCooperadoEmAberto,
  getRelatorioResumoFinanceiroEmAberto,
  getResumoFinanceiroMes,
  getTotalValoresAPagarEmAberto,
  flattenLinhasPagarCooperadoEmAberto,
} from "@/services/relatorioService";
import type { ConciliacaoMensalResult } from "@/services/conciliacaoMensalService";
import { getDemonstrativoPagamentosMes } from "@/services/conciliacaoMensalService";
import {
  getRelatorioNotasFiscaisCooperados,
  type LinhaNotaFiscalCooperado,
} from "@/services/contadorRelatorioService";
import { getRelatorioSobrasPerdas, type RelatorioSobrasPerdas } from "@/services/sobrasPerdasService";
import { getRelatorioReclamacoes } from "@/services/reclamacaoService";
import { getRelatorioVotacoes, labelVoto } from "@/services/votacaoService";
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
  .recibo-nf-cooperado {
    page-break-inside: avoid;
    break-inside: avoid-page;
    -webkit-column-break-inside: avoid;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 20px 22px;
    margin: 28px 0;
    background: #fff;
  }
  .recibo-nf-cooperado h2.coop-nome {
    font-family: system-ui, sans-serif;
    font-size: 1.05rem;
    color: #14532d;
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #bbf7d0;
  }
  .dados-cooperado-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 4px 12px;
    font-family: system-ui, sans-serif;
    font-size: 12px;
    margin: 12px 0 16px;
    color: #374151;
  }
  .dados-cooperado-grid .rotulo { font-weight: 600; color: #6b7280; }
  .resumo-financeiro-nf {
    font-family: system-ui, sans-serif;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px 16px;
    margin-top: 14px;
  }
  .resumo-financeiro-nf .linha {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 13px;
    border-bottom: 1px dashed #e5e7eb;
  }
  .resumo-financeiro-nf .linha:last-child {
    border-bottom: none;
    font-weight: 700;
    font-size: 14px;
    color: #14532d;
    padding-top: 8px;
    margin-top: 4px;
  }
  .nf-aviso {
    font-family: system-ui, sans-serif;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 14px 16px;
    margin: 0 0 20px;
    font-size: 13px;
    color: #1e3a8a;
    line-height: 1.55;
  }
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

function blocoEmissorSimples(emissor: EmissorRelatorio): string {
  const dataEmissao = formatDate(emissor.emitidoEm.split("T")[0]);
  const hora = new Date(emissor.emitidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `
    <div class="emissor-box">
      <div class="rotulo">Responsável pela emissão</div>
      <div class="nome">${escapeHtml(emissor.nome)}</div>
      <div class="detalhe">Emitido em ${dataEmissao} às ${hora}</div>
    </div>`;
}

function blocoEmissorAssinatura(emissor: EmissorRelatorio): string {
  if (emissor.modo === "simples") {
    return blocoEmissorSimples(emissor);
  }

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

function blocoDestinatarioInstituicao(
  inst: Pick<Instituicao, "nome" | "cnpj" | "endereco" | "localEntrega" | "responsavel"> | null | undefined
): string {
  if (!inst) return "";
  const localEntrega = inst.localEntrega?.trim() || inst.endereco?.trim() || "";
  const responsavelInst = inst.responsavel?.trim() || "";
  return `
    <div class="destinatario">
      <div class="rotulo">Destinatário — instituição do contrato</div>
      <div class="nome">${escapeHtml(inst.nome)}</div>
      ${localEntrega ? `<div class="detalhe">${escapeHtml(localEntrega)}</div>` : ""}
      ${responsavelInst ? `<div class="detalhe">A/C ${escapeHtml(responsavelInst)}</div>` : ""}
      ${inst.cnpj ? `<div class="detalhe">CNPJ: ${escapeHtml(formatCnpj(inst.cnpj))}</div>` : ""}
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

export function gerarRelatorioEntregasPorItensPeriodoHtml(
  data: AppData,
  instituicaoId: string,
  mesesReferencia: string[],
  cooperativaId?: string,
  emissor?: EmissorRelatorio,
  opcoes?: { apenasPendente?: boolean; incluirDetalheCooperado?: boolean }
): string {
  const rel = getRelatorioEntregasPorItensPeriodo(instituicaoId, mesesReferencia, data, cooperativaId, {
    apenasPendente: opcoes?.apenasPendente,
  });
  const titulo = opcoes?.apenasPendente ? "Entregas por item — pendente" : "Entregas por item";
  return gerarEntregasPorItensDocumento(
    data,
    rel,
    rel.mesesLabel,
    cooperativaId,
    emissor,
    titulo,
    opcoes?.incluirDetalheCooperado ?? false
  );
}

/** @deprecated Use gerarRelatorioEntregasPorItensPeriodoHtml */
export function gerarRelatorioEntregasPorItensHtml(
  data: AppData,
  mesReferencia: string,
  instituicaoId: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  return gerarRelatorioEntregasPorItensPeriodoHtml(data, instituicaoId, [mesReferencia], cooperativaId, emissor);
}

/** @deprecated Use gerarRelatorioEntregasPorItensPeriodoHtml */
export function gerarRelatorioEntregasPorItensAbertoHtml(
  data: AppData,
  instituicaoId: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const rel = getRelatorioEntregasPorItensEmAberto(instituicaoId, data, cooperativaId);
  return gerarRelatorioEntregasPorItensPeriodoHtml(
    data,
    instituicaoId,
    rel.meses,
    cooperativaId,
    emissor,
    { apenasPendente: true }
  );
}

function gerarEntregasPorItensDocumento(
  data: AppData,
  rel: RelatorioEntregasPorItens | RelatorioEntregasPorItensEmAberto | RelatorioEntregasPorItensPeriodo,
  periodoLabel: string,
  cooperativaId: string | undefined,
  emissor: EmissorRelatorio | undefined,
  tituloDoc: string,
  incluirDetalheCooperado = false
): string {
  const inst = rel.instituicao;

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

  const linhasCooperado = rel.porCooperado
    .flatMap((coop) =>
      coop.itens.map(
        (item) =>
          `<tr>
            <td>${escapeHtml(coop.cooperadoNome)}</td>
            <td>${escapeHtml(item.produtoNome)}</td>
            <td class="num">${item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${escapeHtml(item.unidade)}</td>
            <td class="num">${formatCurrency(item.valorTotal)}</td>
          </tr>`
      )
    )
    .join("");

  const pendente = "apenasPendente" in rel && rel.apenasPendente === true;
  const rotuloTotal = pendente ? "Total em aberto (entregas pendentes)" : "Total geral (bruto)";

  const body = `
    ${blocoDestinatarioInstituicao(inst)}

    <p class="carta">
      Período: <strong>${escapeHtml(periodoLabel)}</strong> · ${rel.quantidadeEntregas} entrega(s) · ${rel.itens.length} item(ns) · ${pendente ? "Total em aberto" : "Total"}: <strong>${formatCurrency(rel.totalBruto)}</strong>
    </p>

    <h2>Consolidado por item</h2>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Item / Produto</th>
          <th>Unidade</th>
          <th class="num">Quantidade</th>
          <th class="num">Preço médio</th>
          <th class="num">Valor total</th>
        </tr>
      </thead>
      <tbody>
        ${linhasItens || `<tr><td colspan="6">Nenhum item no período.</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5"><strong>${rotuloTotal}</strong></td>
          <td class="num"><strong>${formatCurrency(rel.totalBruto)}</strong></td>
        </tr>
      </tfoot>
    </table>

    ${
      incluirDetalheCooperado && rel.porCooperado.length > 0
        ? `<h2>Detalhamento por cooperado</h2>
    <table>
      <thead><tr><th>Cooperado</th><th>Item</th><th class="num">Quantidade</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhasCooperado}</tbody>
    </table>`
        : ""
    }`;

  const mesRef =
    rel.mesReferencia === "consolidado" ? getCurrentMesReferencia() : rel.mesReferencia;

  return documentoShell(
    `${tituloDoc} — ${rel.instituicaoNome}`,
    body,
    data,
    mesRef,
    cooperativaId,
    emissor,
    periodoLabel
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

export function gerarRelatorioResumoFinanceiroAbertoHtml(
  data: AppData,
  cooperativaId: string | undefined,
  emissor?: EmissorRelatorio
): string {
  const r = getRelatorioResumoFinanceiroEmAberto(data, cooperativaId);
  const linhasPagar = getRelatorioPagarCooperadoEmAberto(data, cooperativaId);
  const totalConferido = getTotalValoresAPagarEmAberto(data, cooperativaId);
  const linhasPagarHtml = linhasPagar
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.cooperado)}</td><td>${escapeHtml(l.mesesLabel)}</td><td class="num">${l.entregas}</td><td class="num">${formatCurrency(l.total)}</td></tr>`
    )
    .join("");

  const body = `
    <p class="carta">Consolidado de todos os meses com débito pendente: <strong>${escapeHtml(r.mesesLabel)}</strong></p>
    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Cooperados com débito</div><div class="value">${r.cooperadosComDebito}</div></div>
      <div class="resumo-card"><div class="label">Entregas (período)</div><div class="value">${r.totalEntregas}</div></div>
      <div class="resumo-card"><div class="label">Vendas (bruto)</div><div class="value">${formatCurrency(r.totalVendasBruto)}</div></div>
      <div class="resumo-card"><div class="label">Total a pagar</div><div class="value">${formatCurrency(totalConferido)}</div></div>
    </div>
    <p class="carta" style="font-size:12px;color:#6b7280;">
      Total sincronizado com o relatório <em>Pagamento por cooperado (em aberto)</em> (${linhasPagar.length} cooperado(s)).
    </p>
    <h2>Valores a pagar por cooperado</h2>
    <table>
      <thead><tr><th>Cooperado</th><th>Meses em aberto</th><th class="num">Entregas</th><th class="num">Total</th></tr></thead>
      <tbody>${linhasPagarHtml || `<tr><td colspan="4">Nenhum débito pendente.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3"><strong>Total geral</strong></td><td class="num"><strong>${formatCurrency(totalConferido)}</strong></td></tr></tfoot>
    </table>`;

  return documentoShell(
    "Resumo Financeiro — Total em Aberto",
    body,
    data,
    getCurrentMesReferencia(),
    cooperativaId,
    emissor
  );
}

function labelStatusNota(status: string): string {
  const map: Record<string, string> = {
    rascunho: "Rascunho",
    entregue: "Entregue",
    aguardando_conferencia: "Em análise",
    conferida: "Conferida",
    rejeitada: "Rejeitada",
    pago: "Pago",
    cancelado: "Cancelado",
  };
  return map[status] ?? status;
}

function labelStatusMensalidade(status: string): string {
  const map: Record<string, string> = {
    pendente: "Pendente",
    em_aberto: "Em aberto",
    atrasada: "Atrasada",
    parcelada: "Parcelada",
    parcial: "Parcial",
    paga: "Paga",
  };
  return map[status] ?? status;
}

export function gerarRelatorioEntregasInstituicaoHtml(
  data: AppData,
  mesReferencia: string,
  instituicaoId: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const r = getRelatorioEntregasInstituicaoLive(mesReferencia, instituicaoId, data);
  const inst = r.instituicao;
  const localEntrega = inst?.localEntrega?.trim() || inst?.endereco?.trim() || "";
  const responsavelInst = inst?.responsavel?.trim() || "";

  const linhas = r.entregas
    .map(
      (n) =>
        `<tr>
          <td>${formatDate(n.dataEntrega)}</td>
          <td>${escapeHtml(getCooperadoNomeSafe(data, n.cooperadoId))}</td>
          <td>${escapeHtml(n.numeroNota ?? "—")}</td>
          <td class="num">${formatCurrency(n.valorBruto)}</td>
          <td class="num">${formatCurrency(n.valorLiquido)}</td>
          <td>${escapeHtml(labelStatusNota(n.status))}</td>
        </tr>`
    )
    .join("");

  const body = `
    <div class="destinatario">
      <div class="rotulo">Instituição / contrato</div>
      <div class="nome">${escapeHtml(inst?.nome ?? "Instituição")}</div>
      ${localEntrega ? `<div class="detalhe">${escapeHtml(localEntrega)}</div>` : ""}
      ${responsavelInst ? `<div class="detalhe">A/C ${escapeHtml(responsavelInst)}</div>` : ""}
      ${inst?.cnpj ? `<div class="detalhe">CNPJ: ${escapeHtml(formatCnpj(inst.cnpj))}</div>` : ""}
    </div>

    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Entregas conferidas</div><div class="value">${r.entregas.length}</div></div>
      <div class="resumo-card"><div class="label">Total bruto</div><div class="value">${formatCurrency(r.totalBruto)}</div></div>
      <div class="resumo-card"><div class="label">Total líquido</div><div class="value">${formatCurrency(r.totalLiquido)}</div></div>
    </div>

    <h2>Entregas do período</h2>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Cooperado</th>
          <th>Nota</th>
          <th class="num">Bruto</th>
          <th class="num">Líquido</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${linhas || `<tr><td colspan="6">Nenhuma entrega conferida neste mês.</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <td colspan="3"><strong>Totais</strong></td>
          <td class="num"><strong>${formatCurrency(r.totalBruto)}</strong></td>
          <td class="num"><strong>${formatCurrency(r.totalLiquido)}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;

  return documentoShell(
    `Entregas por instituição — ${inst?.nome ?? "Instituição"}`,
    body,
    data,
    mesReferencia,
    cooperativaId,
    emissor
  );
}

export function gerarRelatorioMensalidadesAbertasTotalHtml(
  data: AppData,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const { linhas, total } = getRelatorioMensalidadesEmAbertoConsolidado(data, cooperativaId);
  const mesesUnicos = [...new Set(linhas.map((l) => l.mesReferencia))].sort();
  const cooperadosUnicos = new Set(linhas.map((l) => l.cooperadoId)).size;

  const rows = linhas
    .map(
      (m) =>
        `<tr>
          <td>${escapeHtml(m.cooperadoNome)}</td>
          <td>${escapeHtml(formatMesReferencia(m.mesReferencia))}</td>
          <td class="num">${formatCurrency(m.valor)}</td>
          <td>${formatDate(m.vencimento)}</td>
          <td>${escapeHtml(labelStatusMensalidade(m.status))}</td>
        </tr>`
    )
    .join("");

  const body = `
    <p class="carta">
      Consolidado de todas as mensalidades não pagas${mesesUnicos.length ? `: <strong>${mesesUnicos.map((m) => formatMesReferencia(m)).join(", ")}</strong>` : ""}.
    </p>
    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Cooperados</div><div class="value">${cooperadosUnicos}</div></div>
      <div class="resumo-card"><div class="label">Parcelas em aberto</div><div class="value">${linhas.length}</div></div>
      <div class="resumo-card"><div class="label">Total em aberto</div><div class="value">${formatCurrency(total)}</div></div>
    </div>
    <h2>Detalhamento</h2>
    <table>
      <thead>
        <tr>
          <th>Cooperado</th>
          <th>Mês ref.</th>
          <th class="num">Valor</th>
          <th>Vencimento</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5">Nenhuma mensalidade em aberto.</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total geral</strong></td>
          <td class="num"><strong>${formatCurrency(total)}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>`;

  return documentoShell(
    "Mensalidades em Aberto — Total",
    body,
    data,
    getCurrentMesReferencia(),
    cooperativaId,
    emissor
  );
}

export function gerarRelatorioMensalidadesAbertasMesHtml(
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string,
  emissor?: EmissorRelatorio
): string {
  const linhas = data.mensalidades
    .filter((m) => {
      if (m.status === "paga" || m.mesReferencia !== mesReferencia) return false;
      if (!cooperativaId) return true;
      const coop = data.cooperados.find((c) => c.id === m.cooperadoId);
      return coop?.cooperativaId === cooperativaId;
    })
    .map((m) => ({
      cooperadoNome: getCooperadoNomeSafe(data, m.cooperadoId),
      valor: m.valor,
      vencimento: m.vencimento,
      status: m.status,
    }))
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  const total = round2(linhas.reduce((s, l) => s + l.valor, 0));

  const rows = linhas
    .map(
      (m) =>
        `<tr>
          <td>${escapeHtml(m.cooperadoNome)}</td>
          <td class="num">${formatCurrency(m.valor)}</td>
          <td>${formatDate(m.vencimento)}</td>
          <td>${escapeHtml(labelStatusMensalidade(m.status))}</td>
        </tr>`
    )
    .join("");

  const body = `
    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Cooperados</div><div class="value">${new Set(linhas.map((l) => l.cooperadoNome)).size}</div></div>
      <div class="resumo-card"><div class="label">Total em aberto</div><div class="value">${formatCurrency(total)}</div></div>
    </div>
    <h2>Mensalidades pendentes</h2>
    <table>
      <thead><tr><th>Cooperado</th><th class="num">Valor</th><th>Vencimento</th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">Nenhuma mensalidade em aberto neste mês.</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <td><strong>Total</strong></td>
          <td class="num"><strong>${formatCurrency(total)}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>`;

  return documentoShell(
    "Mensalidades em Aberto",
    body,
    data,
    mesReferencia,
    cooperativaId,
    emissor
  );
}

export function gerarRelatorioPagarCooperadoAbertoHtml(
  data: AppData,
  cooperativaId: string | undefined,
  cooperadoId: string | undefined,
  emissor?: EmissorRelatorio,
  instituicaoId?: string
): string {
  const inst = instituicaoId ? data.instituicoes.find((i) => i.id === instituicaoId) : undefined;
  const linhas = getRelatorioPagarCooperadoEmAberto(data, cooperativaId, cooperadoId);
  const total = cooperadoId
    ? round2(linhas.reduce((s, l) => s + l.total, 0))
    : getTotalValoresAPagarEmAberto(data, cooperativaId);
  const detalharPorMes = linhas.some((r) => r.porMes.length > 1);
  const linhasTabela = flattenLinhasPagarCooperadoEmAberto(linhas);
  const rows = linhasTabela
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.cooperado)}</td><td>${escapeHtml(l.mesesLabel)}</td><td class="num">${l.entregas}</td><td class="num">${formatCurrency(l.total)}</td></tr>`
    )
    .join("");

  const body = `
    ${blocoDestinatarioInstituicao(inst)}

    <p class="carta">
      Relação dos valores pendentes de pagamento aos cooperados, consolidados dos meses em aberto,
      para fins de acompanhamento do contrato e transparência financeira.
    </p>

    <h2>Valores a pagar — geral em aberto</h2>
    <table>
      <thead><tr><th>Cooperado</th><th>${detalharPorMes ? "Mês" : "Meses em aberto"}</th><th class="num">Entregas</th><th class="num">Valor a pagar</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">Nenhum valor pendente.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3"><strong>Total geral</strong></td><td class="num"><strong>${formatCurrency(total)}</strong></td></tr></tfoot>
    </table>`;

  const periodoLabel = linhas.length
    ? [...new Set(linhas.flatMap((l) => l.meses))].sort().map((m) => formatMesReferencia(m)).join(" · ")
    : formatMesReferencia(getCurrentMesReferencia());

  return documentoShell(
    "Pagamento por Cooperado — Em Aberto",
    body,
    data,
    getCurrentMesReferencia(),
    cooperativaId,
    emissor,
    periodoLabel
  );
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
              <td class="num">${escapeHtml(labelVoto(v.voto))}</td>
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
          <div class="resumo-card"><div class="label">Abstenção</div><div class="value">${resumo.pctAbstencao.toLocaleString("pt-BR")}%</div></div>
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
      e percentuais de SIM, NÃO e ABSTENÇÃO (base 100% sobre os votos computados).
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

export async function baixarDocumento(
  html: string,
  nomeArquivo: string,
  opts?: { pagebreakAvoid?: string }
): Promise<void> {
  await baixarHtmlComoPdf(html, nomeArquivo, opts);
}

function blocoDadosCooperadoFiscal(linha: LinhaNotaFiscalCooperado): string {
  const c = linha.cooperado;
  const pares: [string, string][] = [
    ["Nome completo", c.nomeCompleto],
    ["CPF/CNPJ", formatCpfCnpj(c.cpfCnpj)],
    ["Telefone", c.telefone ?? ""],
    ["Endereço", c.endereco ?? ""],
    ["Comunidade", c.comunidade ?? ""],
    ["CAF / DAP", c.cafDap ?? ""],
    ["Chave PIX", c.chavePix ?? ""],
  ];
  if (c.banco?.trim()) {
    pares.push(["Dados bancários", `${c.banco} · Ag. ${c.agencia ?? "—"} · Cc ${c.conta ?? "—"}`]);
  }
  pares.push(["Período", linha.mesesLabel]);
  pares.push(["Entregas no período", String(linha.entregas)]);

  const grid = pares
    .filter(([, v]) => v.trim())
    .map(
      ([rotulo, valor]) =>
        `<div class="rotulo">${escapeHtml(rotulo)}</div><div>${escapeHtml(valor)}</div>`
    )
    .join("");

  return `<div class="dados-cooperado-grid">${grid}</div>`;
}

function blocoItensCooperadoFiscal(linha: LinhaNotaFiscalCooperado): string {
  const rows = linha.itens
    .map(
      (i) =>
        `<tr>
          <td>${escapeHtml(i.produtoNome)}</td>
          <td class="num">${i.quantidade.toLocaleString("pt-BR")} ${escapeHtml(i.unidade)}</td>
          <td class="num">${formatCurrency(i.precoUnitario)}</td>
          <td class="num">${formatCurrency(i.valorBruto)}</td>
        </tr>`
    )
    .join("");

  return `
    <h2 style="font-size:0.85rem;margin:16px 0 8px">Produtos vendidos</h2>
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th class="num">Quantidade</th>
          <th class="num">Preço unit.</th>
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">Sem itens no período selecionado.</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <td colspan="3"><strong>Total bruto dos itens</strong></td>
          <td class="num"><strong>${formatCurrency(linha.itens.reduce((s, i) => s + i.valorBruto, 0) || linha.valorBruto)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}

function blocoResumoFinanceiroFiscal(linha: LinhaNotaFiscalCooperado, descontoPct: number): string {
  const extras = linha.descontosExtras
    .map((d) => {
      const credito = d.tipo === "credito_avulso";
      const sinal = credito ? "+ " : "− ";
      return `<div class="linha"><span>${escapeHtml(d.motivo)}</span><span>${sinal}${formatCurrency(d.valor)}</span></div>`;
    })
    .join("");

  return `
    <div class="resumo-financeiro-nf">
      <div class="linha"><span>Total entregas (bruto)</span><span>${formatCurrency(linha.valorBruto)}</span></div>
      <div class="linha"><span>Desconto cooperativa${descontoPct > 0 ? ` (${descontoPct}%)` : ""}</span><span>− ${formatCurrency(linha.descontoCooperativa)}</span></div>
      <div class="linha"><span>Entregas líquidas</span><span>${formatCurrency(linha.valorEntregas)}</span></div>
      ${extras}
      <div class="linha"><span>Valor líquido apurado (base NF)</span><span>${formatCurrency(linha.valorLiquido)}</span></div>
    </div>`;
}

function blocoReciboCooperadoFiscal(linha: LinhaNotaFiscalCooperado, descontoPct: number): string {
  return `
    <section class="recibo-nf-cooperado">
      <h2 class="coop-nome">${escapeHtml(linha.cooperado.nomeCompleto)}</h2>
      ${blocoDadosCooperadoFiscal(linha)}
      ${blocoItensCooperadoFiscal(linha)}
      <h2 style="font-size:0.85rem;margin:16px 0 8px">Resumo financeiro</h2>
      ${blocoResumoFinanceiroFiscal(linha, descontoPct)}
    </section>`;
}

/** Documento estilo recibo — um bloco por cooperado, para emissão de NF pelo contador. */
export function gerarRelatorioNotasFiscaisCooperadosHtml(
  data: AppData,
  mesesReferencia: string[],
  cooperativaId: string | undefined,
  cooperadoId: string | undefined,
  emissor?: EmissorRelatorio
): string {
  const rel = getRelatorioNotasFiscaisCooperados(data, mesesReferencia, cooperativaId, cooperadoId);
  const descontoPct = data.config?.descontoPadraoCooperativa ?? 5;
  const blocos = rel.linhas.map((l) => blocoReciboCooperadoFiscal(l, descontoPct)).join("");

  const body = `
    <div class="nf-aviso">
      <strong>Documento para emissão de nota fiscal</strong> — consolida as vendas pendentes de pagamento
      (${escapeHtml(rel.mesesLabel)}). Cada bloco abaixo corresponde a um cooperado. Utilize os dados cadastrais,
      itens e valores apurados para lançamento contábil e emissão de NF-e/NFS-e conforme orientação do contador.
    </div>

    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Cooperados</div><div class="value">${rel.totalCooperados}</div></div>
      <div class="resumo-card"><div class="label">Total bruto</div><div class="value">${formatCurrency(rel.totalBruto)}</div></div>
      <div class="resumo-card"><div class="label">Total líquido apurado</div><div class="value">${formatCurrency(rel.totalLiquido)}</div></div>
    </div>

    ${blocos || `<p>Nenhum cooperado com vendas pendentes nos meses selecionados.</p>`}`;

  return documentoShell(
    "Vendas por Cooperado — Emissão de NF",
    body,
    data,
    mesesReferencia[mesesReferencia.length - 1] ?? getCurrentMesReferencia(),
    cooperativaId,
    emissor,
    rel.mesesLabel
  );
}

export async function baixarDocumentoNotasFiscais(html: string, nomeArquivo: string): Promise<void> {
  await baixarHtmlComoPdf(html, nomeArquivo, { pagebreakAvoid: ".recibo-nf-cooperado" });
}

export function gerarRelatorioConciliacaoHtml(
  data: AppData,
  conciliacao: ConciliacaoMensalResult,
  coop: Cooperativa | undefined,
  emissor?: EmissorRelatorio
): string {
  const linhasHtml = conciliacao.linhas
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.label)}<br/><span style="font-size:11px;color:#666">${escapeHtml(l.descricao)}</span></td>
        <td class="num">${formatCurrency(l.valorA)}<br/><span style="font-size:11px;color:#666">${escapeHtml(l.labelA)}</span></td>
        <td class="num">${formatCurrency(l.valorB)}<br/><span style="font-size:11px;color:#666">${escapeHtml(l.labelB)}</span></td>
        <td class="num">${formatCurrency(l.diferenca)}</td>
        <td>${escapeHtml(l.status === "ok" ? "Conciliado" : l.status === "divergencia" ? "Divergência" : l.status === "parcial" ? "Parcial" : "Sem dados")}</td>
      </tr>`
    )
    .join("");

  const alertasHtml =
    conciliacao.alertas.length === 0
      ? "<p>Nenhum alerta para este mês.</p>"
      : `<ul>${conciliacao.alertas
          .map((a) => `<li><strong>${escapeHtml(a.titulo)}</strong> — ${escapeHtml(a.descricao)}</li>`)
          .join("")}</ul>`;

  const body = `
    <h2>R4 — Conciliação mensal</h2>
    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Índice de conciliação</div><div class="value">${conciliacao.resumo.percentualOk}%</div></div>
      <div class="resumo-card"><div class="label">Divergências</div><div class="value">${conciliacao.resumo.divergencias}</div></div>
      <div class="resumo-card"><div class="label">Linhas OK</div><div class="value">${conciliacao.resumo.conciliadas}</div></div>
      <div class="resumo-card"><div class="label">Fechamento</div><div class="value">${escapeHtml(conciliacao.kpis.fechamentoStatus ?? "Não iniciado")}</div></div>
    </div>
    <h2>Matriz de verificação</h2>
    <table>
      <thead><tr><th>Verificação</th><th class="num">Fonte A</th><th class="num">Fonte B</th><th class="num">Diferença</th><th>Status</th></tr></thead>
      <tbody>${linhasHtml}</tbody>
    </table>
    <h2>Alertas de auditoria</h2>
    ${alertasHtml}
  `;

  return documentoShell(
    "Conciliação mensal (R4)",
    body,
    data,
    conciliacao.mesReferencia,
    coop?.id,
    emissor
  );
}

export function gerarRelatorioDemonstrativoPagamentosHtml(
  data: AppData,
  mesReferencia: string,
  linhas: ReturnType<typeof getDemonstrativoPagamentosMes>,
  emissor?: EmissorRelatorio
): string {
  const rows = linhas
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.cooperadoNome)}</td>
        <td class="num">${formatCurrency(p.valorBruto)}</td>
        <td class="num">${formatCurrency(p.descontoCooperativa)}</td>
        <td class="num">${formatCurrency(p.valorLiquido)}</td>
        <td>${escapeHtml(p.status === "confirmado" ? "Confirmado" : "Aguardando assinatura")}</td>
        <td>${p.assinado ? "Sim" : "Não"}</td>
        <td>${escapeHtml(p.pagoPor)}</td>
        <td>${formatDate(p.pagoEm.split("T")[0])}</td>
      </tr>`
    )
    .join("");

  const totalLiquido = linhas.reduce((s, p) => s + p.valorLiquido, 0);

  const body = `
    <h2>R2 — Demonstrativo de pagamentos</h2>
    <p class="carta">Relação de pagamentos registrados aos cooperados no mês, com status de assinatura do recibo.</p>
    <table>
      <thead><tr>
        <th>Cooperado</th><th class="num">Bruto</th><th class="num">Desc. coop.</th><th class="num">Líquido</th>
        <th>Status</th><th>Assinado</th><th>Registrado por</th><th>Data</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Total líquido pago</td><td class="num">${formatCurrency(totalLiquido)}</td><td colspan="4"></td></tr></tfoot>
    </table>
  `;

  return documentoShell("Demonstrativo de pagamentos (R2)", body, data, mesReferencia, undefined, emissor);
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

export function gerarRelatorioRazaoAnaliticoHtml(
  data: AppData,
  razoes: import("@/services/contadorRelatorioService").RazaoAnaliticoCooperado[],
  mesReferencia: string,
  emissor?: EmissorRelatorio
): string {
  const blocos = razoes
    .map((r) => {
      const rows = r.linhas
        .map(
          (l) =>
            `<tr><td>${formatDate(l.data)}</td><td>${escapeHtml(l.tipo)}</td><td>${escapeHtml(l.descricao)}</td><td class="num">${formatCurrency(l.valor)}</td><td class="num">${formatCurrency(l.saldo)}</td></tr>`
        )
        .join("");
      return `<div class="coop-bloco"><h3>${escapeHtml(r.cooperadoNome)}</h3>
        <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3">Saldo final</td><td class="num" colspan="2">${formatCurrency(r.saldoFinal)}</td></tr></tfoot></table></div>`;
    })
    .join("");

  return documentoShell(
    "R1 — Razão analítico por cooperado",
    `<h2>R1 — Razão analítico</h2><p class="carta">Extrato mensal item a item: créditos de entrega, descontos e pagamentos.</p>${blocos || "<p>Sem movimentação no período.</p>"}`,
    data,
    mesReferencia,
    undefined,
    emissor
  );
}

export function gerarRelatorioMapaReceitasHtml(
  data: AppData,
  mapa: import("@/services/contadorRelatorioService").MapaReceitasContrato,
  emissor?: EmissorRelatorio
): string {
  const rows = mapa.linhas
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.instituicaoNome)}</td><td class="num">${l.qtdEntregas}</td><td class="num">${formatCurrency(l.valorBruto)}</td><td class="num">${formatCurrency(l.valorLiquido)}</td></tr>`
    )
    .join("");
  const body = `
    <h2>R3 — Mapa de receitas por contrato</h2>
    <table>
      <thead><tr><th>Instituição / contrato</th><th class="num">Entregas</th><th class="num">Bruto</th><th class="num">Líquido</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num">${formatCurrency(mapa.totalBruto)}</td><td class="num">${formatCurrency(mapa.totalLiquido)}</td></tr></tfoot>
    </table>`;
  return documentoShell("Mapa receitas por contrato (R3)", body, data, mapa.mesReferencia, undefined, emissor);
}

export function gerarRelatorioExtratoContaCoopHtml(
  data: AppData,
  extrato: import("@/services/contadorRelatorioService").ExtratoContaCoopMes,
  emissor?: EmissorRelatorio
): string {
  const rows = extrato.linhas
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.cooperadoNome)}</td><td>${escapeHtml(l.motivo)}</td><td class="num">${formatCurrency(l.valor)}</td></tr>`
    )
    .join("");
  const body = `
    <h2>R5 — Extrato Conta Coop</h2>
    <p class="carta">Compras registradas na ficha como desconto Conta Coop no mês.</p>
    <table>
      <thead><tr><th>Cooperado</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=\"3\">Sem compras Conta Coop no mês.</td></tr>"}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="num">${formatCurrency(extrato.total)}</td></tr></tfoot>
    </table>`;
  return documentoShell("Extrato Conta Coop (R5)", body, data, extrato.mesReferencia, undefined, emissor);
}

export function gerarRelatorioTrilhaAuditoriaHtml(
  data: AppData,
  entries: import("@/types").AuditEntry[],
  mesReferencia: string,
  emissor?: EmissorRelatorio
): string {
  const rows = entries
    .slice(0, 200)
    .map(
      (e) =>
        `<tr><td>${formatDateTime(e.timestamp)}</td><td>${escapeHtml(e.userName)}</td><td>${escapeHtml(e.action)}</td><td>${escapeHtml(e.entityType)}</td><td>${escapeHtml(e.changes ?? "")}</td></tr>`
    )
    .join("");
  const body = `
    <h2>R6 — Trilha de auditoria</h2>
    <table>
      <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Resumo</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=\"5\">Nenhum evento.</td></tr>"}</tbody>
    </table>`;
  return documentoShell("Trilha de auditoria (R6)", body, data, mesReferencia, undefined, emissor);
}

export function gerarRelatorioParecerContabilHtml(
  data: AppData,
  parecer: import("@/types").ParecerContabilMensal,
  emissor?: EmissorRelatorio
): string {
  const assinatura = parecer.assinaturaDataUrl
    ? `<img class="assinatura-img" src="${parecer.assinaturaDataUrl}" alt="Assinatura contador" />`
    : "";
  const body = `
    <h2>R9 — Parecer contábil mensal</h2>
    <div class="destinatario">
      <div class="rotulo">Contador responsável</div>
      <div class="nome">${escapeHtml(parecer.contadorNome)}</div>
      <div class="detalhe">${escapeHtml(parecer.contadorFuncao)} · ${formatDateTime(parecer.emitidoEm)}</div>
    </div>
    <div class="carta" style="white-space:pre-wrap">${escapeHtml(parecer.texto)}</div>
    ${assinatura}
    <div class="assinatura-linha">${escapeHtml(parecer.contadorNome)}<br/>${escapeHtml(parecer.contadorFuncao)}</div>`;
  return documentoShell(
    "Parecer contábil (R9)",
    body,
    data,
    parecer.mesReferencia,
    parecer.cooperativaId,
    emissor
  );
}

export function gerarRelatorioIndiceDossieHtml(
  data: AppData,
  mesReferencia: string,
  cooperativaId: string,
  meta: { temParecer: boolean; temSnapshot: boolean; qtdRelatorios: number },
  emissor?: EmissorRelatorio
): string {
  const itens = [
    "01-fechamento.html — Fechamento mensal",
    "02-conciliacao-r4.html — Conciliação (R4)",
    "03-demonstrativo-pagamentos-r2.html — Demonstrativo de pagamentos (R2)",
    "04-mapa-receitas-r3.html — Mapa de receitas por contrato (R3)",
    "05-extrato-conta-coop-r5.html — Extrato Conta Coop (R5)",
    "06-razao-analitico-r1.html — Razão analítico por cooperado (R1)",
    "07-trilha-auditoria-r6.csv — Trilha de auditoria (R6)",
    "08-relatorio-assembleia-r10.html — Relatório para assembleia (R10)",
  ];
  if (meta.temParecer) itens.push("09-parecer-contabil-r9.html — Parecer contábil assinado (R9)");
  if (meta.temSnapshot) itens.push("snapshot-fechamento.json — Snapshot imutável do fechamento aprovado");

  const lista = itens.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  const body = `
    <h2>Dossiê contábil mensal</h2>
    <p class="carta">Pacote gerado pela Central do Contador · ${meta.qtdRelatorios} documento(s) principal(is).</p>
    <div class="destinatario">
      <div class="rotulo">Conteúdo do arquivo ZIP</div>
      <ul style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;margin:8px 0 0;padding-left:20px">${lista}</ul>
    </div>
    <p class="carta">Abra os arquivos HTML no navegador para imprimir ou salvar em PDF. O CSV da trilha pode ser importado em planilhas.</p>`;
  return documentoShell("Índice do dossiê contábil", body, data, mesReferencia, cooperativaId, emissor);
}

export function gerarRelatorioAssembleiaHtml(
  data: AppData,
  mesReferencia: string,
  cooperativaId: string,
  conciliacao: ConciliacaoMensalResult,
  fechamento: FechamentoMensal | undefined,
  parecer: import("@/types").ParecerContabilMensal | undefined,
  snapshot: import("@/types").FechamentoSnapshot | undefined,
  emissor?: EmissorRelatorio
): string {
  const calc = calcularFechamentoMensalLive(mesReferencia, data);
  const parecerResumo = parecer
    ? `<p class="carta" style="white-space:pre-wrap">${escapeHtml(parecer.texto.slice(0, 800))}${parecer.texto.length > 800 ? "…" : ""}</p>
       <p class="carta"><strong>Contador:</strong> ${escapeHtml(parecer.contadorNome)} · ${parecer.assinaturaDataUrl ? "Assinado" : "Sem assinatura digital"}</p>`
    : `<p class="carta">Parecer contábil (R9) ainda não registrado para este mês.</p>`;

  const snapshotInfo = snapshot
    ? `<p class="carta">Snapshot imutável capturado em ${formatDateTime(snapshot.capturedAt)} por ${escapeHtml(snapshot.capturedByName)} · hash <code>${snapshot.contentHash}</code></p>`
    : `<p class="carta">Snapshot de fechamento ainda não gerado (aprove o fechamento mensal para congelar os dados).</p>`;

  const body = `
    <h2>R10 — Relatório para assembleia</h2>
    <p class="carta">Síntese executiva para prestação de contas em assembleia, consolidando fechamento, conciliação e parecer do contador.</p>
    <div class="resumo-grid">
      <div class="resumo-card"><div class="label">Total vendas</div><div class="value">${formatCurrency(calc.totalVendas)}</div></div>
      <div class="resumo-card"><div class="label">Pagamentos cooperados</div><div class="value">${formatCurrency(calc.totalPagamentos)}</div></div>
      <div class="resumo-card"><div class="label">Conciliação OK</div><div class="value">${conciliacao.resumo.percentualOk}%</div></div>
      <div class="resumo-card"><div class="label">Status fechamento</div><div class="value">${escapeHtml(fechamento?.status ?? "Não iniciado")}</div></div>
    </div>
    <h2>Indicadores operacionais</h2>
    <table>
      <thead><tr><th>Indicador</th><th class="num">Valor</th></tr></thead>
      <tbody>
        <tr><td>Entregas conferidas</td><td class="num">${conciliacao.kpis.totalEntregasConferidas}</td></tr>
        <tr><td>Total a pagar cooperados</td><td class="num">${formatCurrency(conciliacao.kpis.totalAPagarCooperados)}</td></tr>
        <tr><td>Total pago confirmado</td><td class="num">${formatCurrency(conciliacao.kpis.totalPagoCooperados)}</td></tr>
        <tr><td>Divergências na conciliação</td><td class="num">${conciliacao.resumo.divergencias}</td></tr>
        <tr><td>Saldo cooperativa (fechamento)</td><td class="num">${formatCurrency(calc.saldoCooperativa)}</td></tr>
      </tbody>
    </table>
    <h2>Parecer do contador</h2>
    ${parecerResumo}
    <h2>Registro imutável</h2>
    ${snapshotInfo}
    ${fechamento?.aprovadoPor ? `<p class="carta">Fechamento aprovado por <strong>${escapeHtml(fechamento.aprovadoPor)}</strong> em ${formatDate(fechamento.dataAprovacao ?? "")}.</p>` : ""}
  `;
  return documentoShell("Relatório assembleia (R10)", body, data, mesReferencia, cooperativaId, emissor);
}

export type { ResumoFinanceiroMes, FechamentoCalculado };
