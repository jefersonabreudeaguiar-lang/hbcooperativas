import type { AppData, LivroCaixaLancamento, LivroCaixaOrigem } from "@/types";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import {
  buildPlanilhaLinhas,
  lancamentosLivroCaixaPeriodo,
  saldoLivroCaixaAntesData,
  saldoLivroCaixaAntesMes,
} from "@/services/livroCaixaPlanilha";
import {
  formatNumeroSequenciaExibicao,
  isOrigemRetencaoContabil,
  lancamentosLivroCaixa,
  lancamentosLivroCaixaPorData,
  resumoLivroCaixa,
} from "@/services/livroCaixaService";
import { getRelatorioSobrasPerdas } from "@/services/sobrasPerdasService";
import { listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";

const ORIGEM_LABELS: Record<LivroCaixaOrigem, string> = {
  manual: "Manual",
  mensalidade: "Mensalidade (PIX)",
  mensalidade_ficha: "Mensalidade na ficha",
  taxa_cooperativa: "Taxa cooperativa (5%)",
  desconto_ficha: "Desconto retido na ficha",
  pagamento_cooperado: "Pagamento cooperado / ficha",
  credito_avulso: "Crédito avulso",
  debito_avulso: "Débito avulso",
  pnae: "PNAE / contrato",
  prestacao_contas: "Prestação de contas",
  hb_app_repasse: "Repasse HB Créditos",
  outro: "Outro",
};

const REPORT_STYLES = `
  body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:1100px;margin:0 auto}
  h1{font-size:1.35rem;margin:0 0 8px}
  h2{font-size:1rem;margin:24px 0 8px}
  .meta{color:#444;font-size:14px;margin-bottom:16px}
  .resumo{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0 24px}
  .resumo div{padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;min-width:140px}
  .resumo strong{display:block;font-size:1.1rem;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
  th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left}
  th{background:#f3f4f6;font-weight:600}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  tr.saldo-ant td{font-style:italic;background:#f9fafb}
  .credito{color:#047857}
  .debito{color:#b91c1c}
`;

function linhaPlanilhaHtml(
  credito: number | null,
  debito: number | null,
  saldoCorrido: number,
  l: LivroCaixaLancamento
): string {
  const ret = isOrigemRetencaoContabil(l.origem) ? " · retenção" : "";
  return `<tr>
    <td>${formatNumeroSequenciaExibicao(l.numeroSequencia)}</td>
    <td>${formatDate(l.data)}</td>
    <td>${escapeHtml(l.historico)}<br/><small style="color:#6b7280">${ORIGEM_LABELS[l.origem]}${ret}</small></td>
    <td class="num credito">${credito != null ? formatCurrency(credito) : ""}</td>
    <td class="num debito">${debito != null ? formatCurrency(debito) : ""}</td>
    <td class="num"><strong>${formatCurrency(saldoCorrido)}</strong></td>
  </tr>`;
}

function tabelaPlanilhaHtml(lancamentos: LivroCaixaLancamento[], saldoInicial: number): string {
  const linhas = buildPlanilhaLinhas(lancamentos, saldoInicial);
  const saldoAnt =
    Math.abs(saldoInicial) > 0.0001
      ? `<tr class="saldo-ant"><td colspan="3">Saldo anterior</td><td></td><td></td><td class="num"><strong>${formatCurrency(saldoInicial)}</strong></td></tr>`
      : "";
  if (linhas.length === 0 && !saldoAnt) {
    return "<p><em>Nenhum lançamento no período selecionado.</em></p>";
  }
  return `<table>
    <thead><tr>
      <th>Nº</th><th>Data</th><th>Histórico</th>
      <th class="num">Crédito</th><th class="num">Débito</th><th class="num">Saldo</th>
    </tr></thead>
    <tbody>${saldoAnt}${linhas.map((row) => linhaPlanilhaHtml(row.credito, row.debito, row.saldoCorrido, row.lancamento)).join("")}</tbody>
  </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extratoFichaDoDia(data: AppData, cooperativaId: string, dataIso: string): string {
  const pagamentos = data.pagamentosCooperado.filter(
    (p) => p.cooperativaId === cooperativaId && p.pagoEm.startsWith(dataIso)
  );
  if (pagamentos.length === 0) {
    return "<p><em>Nenhum pagamento a cooperado registrado nesta data.</em></p>";
  }
  const rows: string[] = [];
  for (const p of pagamentos) {
    const coop = data.cooperados.find((c) => c.id === p.cooperadoId);
    const nome = coop?.nomeCompleto ?? "Cooperado";
    rows.push(
      `<tr><td colspan="5"><strong>${escapeHtml(nome)}</strong> · ${p.mesReferencia} · líquido ${formatCurrency(p.valorLiquido)}</td></tr>`
    );
    const fichas = (data.fichaCorrida ?? []).filter(
      (f) => f.cooperativaId === cooperativaId && p.fichaIds.includes(f.id)
    );
    for (const f of fichas) {
      rows.push(
        `<tr>
          <td></td>
          <td>${formatDate(f.dataLancamento)}</td>
          <td>Ficha</td>
          <td>${escapeHtml(f.descricao)}</td>
          <td style="text-align:right">${formatCurrency(f.valorLiquido)}</td>
        </tr>`
      );
    }
  }
  return `<table><thead><tr><th>Nº</th><th>Data</th><th>Origem</th><th>Histórico</th><th>Valor</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function secaoValoresEmAbertoHtml(data: AppData, cooperativaId: string): string {
  const cooperados = listCooperadosDaCooperativa(data, cooperativaId);
  const linhas: string[] = [];
  for (const c of cooperados) {
    const meses = new Set<string>();
    for (const f of data.fichaCorrida ?? []) {
      if (f.cooperadoId === c.id && f.cooperativaId === cooperativaId) {
        meses.add(f.mesReferencia);
      }
    }
    meses.add(getCurrentMesReferencia());
    for (const mes of [...meses].sort()) {
      const valor = getTotalAPagarCooperado(data, c.id, mes, cooperativaId);
      if (valor > 0) {
        linhas.push(
          `<tr><td>${escapeHtml(c.nomeCompleto)}</td><td>${formatMesReferencia(mes)}</td><td class="num">${formatCurrency(valor)}</td></tr>`
        );
      }
    }
  }
  if (linhas.length === 0) {
    return "<p><em>Nenhum valor pendente de pagamento a cooperados.</em></p>";
  }
  return `<table><thead><tr><th>Cooperado</th><th>Referência</th><th class="num">A pagar</th></tr></thead><tbody>${linhas.join("")}</tbody></table>`;
}

function secaoSobrasPerdasHtml(data: AppData, cooperativaId: string, mesReferencia: string): string {
  const rel = getRelatorioSobrasPerdas(mesReferencia, data, cooperativaId);
  const perdas = rel.perdas
    .map((p) => `<tr><td>${escapeHtml(p.categoria)}</td><td>${escapeHtml(p.descricao)}</td><td class="num">${formatCurrency(p.valor)}</td></tr>`)
    .join("");
  const sobras = rel.sobras
    .map((s) => `<tr><td>${escapeHtml(s.categoria)}</td><td>${escapeHtml(s.descricao)}</td><td class="num">${formatCurrency(s.valor)}</td></tr>`)
    .join("");
  return `
    <h2>Sobras e perdas · ${formatMesReferencia(mesReferencia)}</h2>
    <h3>Perdas / retenções</h3>
    <table><thead><tr><th>Categoria</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>${perdas || "<tr><td colspan='3'><em>—</em></td></tr>"}</tbody></table>
    <h3>Sobras / a acertar</h3>
    <table><thead><tr><th>Categoria</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>${sobras || "<tr><td colspan='3'><em>—</em></td></tr>"}</tbody></table>`;
}

export type LivroCaixaRelatorioPlanilhaOpts = {
  modo: "dia" | "mes" | "periodo";
  dataIso?: string;
  mesReferencia?: string;
  dataDe?: string;
  dataAte?: string;
  somenteMesEmAberto?: boolean;
  incluirExtratoFicha?: boolean;
  incluirSobrasPerdas?: boolean;
  mesSobrasPerdas?: string;
  incluirValoresEmAberto?: boolean;
};

export function gerarRelatorioLivroCaixaPlanilhaHtml(
  data: AppData,
  cooperativaId: string,
  cooperativaNome: string,
  opts: LivroCaixaRelatorioPlanilhaOpts
): string {
  const mesAberto = getCurrentMesReferencia();
  let tituloPeriodo = "";
  let lancamentos: LivroCaixaLancamento[] = [];
  let saldoInicial = 0;

  if (opts.modo === "dia" && opts.dataIso) {
    tituloPeriodo = `Dia ${formatDate(opts.dataIso)}`;
    lancamentos = lancamentosLivroCaixaPorData(data, cooperativaId, opts.dataIso);
    saldoInicial = saldoLivroCaixaAntesData(data, cooperativaId, opts.dataIso);
  } else if (opts.modo === "mes" && opts.mesReferencia) {
    tituloPeriodo = `Mês ${formatMesReferencia(opts.mesReferencia)}`;
    lancamentos = lancamentosLivroCaixa(data, cooperativaId, opts.mesReferencia);
    saldoInicial = saldoLivroCaixaAntesMes(data, cooperativaId, opts.mesReferencia);
    if (opts.somenteMesEmAberto) {
      lancamentos = lancamentos.filter((l) => l.mesReferencia === mesAberto);
      tituloPeriodo += " (somente mês em aberto)";
    }
  } else if (opts.modo === "periodo" && opts.dataDe && opts.dataAte) {
    tituloPeriodo = `${formatDate(opts.dataDe)} a ${formatDate(opts.dataAte)}`;
    lancamentos = lancamentosLivroCaixaPeriodo(data, cooperativaId, opts.dataDe, opts.dataAte);
    saldoInicial = saldoLivroCaixaAntesData(data, cooperativaId, opts.dataDe);
  }

  const resumo = resumoLivroCaixa(data, cooperativaId);
  const planilha = tabelaPlanilhaHtml(lancamentos, saldoInicial);
  const ficha =
    opts.modo === "dia" && opts.incluirExtratoFicha && opts.dataIso
      ? `<h2>Extrato ficha corrida (pagamentos do dia)</h2>${extratoFichaDoDia(data, cooperativaId, opts.dataIso)}`
      : "";
  const sobras =
    opts.incluirSobrasPerdas && (opts.mesSobrasPerdas ?? opts.mesReferencia ?? mesAberto)
      ? secaoSobrasPerdasHtml(data, cooperativaId, opts.mesSobrasPerdas ?? opts.mesReferencia ?? mesAberto)
      : "";
  const abertos = opts.incluirValoresEmAberto
    ? `<h2>Valores em aberto (a pagar cooperados)</h2><p class="meta">Independente do mês — saldos pendentes de PIX pelo responsável.</p>${secaoValoresEmAbertoHtml(data, cooperativaId)}`
    : "";

  const creditosPeriodo = lancamentos.filter((l) => l.tipo === "credito").reduce((s, l) => s + l.valor, 0);
  const debitosPeriodo = lancamentos.filter((l) => l.tipo === "debito").reduce((s, l) => s + l.valor, 0);
  const linhasPlan = buildPlanilhaLinhas(lancamentos, saldoInicial);
  const saldoFinal = linhasPlan.length ? linhasPlan[linhasPlan.length - 1].saldoCorrido : saldoInicial;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
    <title>Livro caixa · ${escapeHtml(cooperativaNome)}</title>
    <style>${REPORT_STYLES}</style></head><body>
    <h1>Livro caixa — ${escapeHtml(cooperativaNome)}</h1>
    <p class="meta">Período: <strong>${tituloPeriodo}</strong> · Saldo geral cooperativa: <strong>${formatCurrency(resumo.saldo)}</strong></p>
    <div class="resumo">
      <div>Créditos no período<strong class="credito">${formatCurrency(creditosPeriodo)}</strong></div>
      <div>Débitos no período<strong class="debito">${formatCurrency(debitosPeriodo)}</strong></div>
      <div>Saldo ao final<strong>${formatCurrency(saldoFinal)}</strong></div>
    </div>
    <h2>Planilha</h2>
    ${planilha}
    ${ficha}
    ${sobras}
    ${abertos}
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;
}

export function gerarRelatorioLivroCaixaDiaHtml(
  data: AppData,
  cooperativaId: string,
  cooperativaNome: string,
  dataIso: string,
  opts?: { incluirExtratoFicha?: boolean }
): string {
  return gerarRelatorioLivroCaixaPlanilhaHtml(data, cooperativaId, cooperativaNome, {
    modo: "dia",
    dataIso,
    incluirExtratoFicha: opts?.incluirExtratoFicha,
  });
}
