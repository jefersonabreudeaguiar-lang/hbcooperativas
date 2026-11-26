import type { AppData, LivroCaixaLancamento, LivroCaixaOrigem } from "@/types";
import {
  filtrarLancamentosPorPasta,
  pastaKeyDeLancamento,
  nomePastaLivroCaixa,
  rotuloOrigemLancamento,
  type LivroCaixaPastaKey,
} from "@/lib/livro-caixa/livroCaixaOrigemPastas";
import { dataIsoCooperativa, formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { formatCnpj } from "@/utils/cooperativa";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import {
  buildPlanilhaLinhas,
  lancamentosLivroCaixaPeriodo,
  saldoCorridoFinalPlanilha,
  saldoLivroCaixaAntesData,
  saldoLivroCaixaAntesMes,
} from "@/services/livroCaixaPlanilha";
import {
  formatNumeroSequenciaExibicao,
  isOrigemRetencaoContabil,
  lancamentosLivroCaixa,
  lancamentosLivroCaixaPorData,
  resumoLivroCaixa,
  resolverDataIsoLancamentoLivroCaixa,
} from "@/services/livroCaixaService";
import { getRelatorioSobrasPerdas } from "@/services/sobrasPerdasService";
import { calcularResumoLiquidoLivroCaixa } from "@/services/livroCaixaResumoCooperado";
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
  origem_cadastrada: "Origem cadastrada",
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
  l: LivroCaixaLancamento,
  data: AppData
): string {
  const ret = isOrigemRetencaoContabil(l.origem) ? " · retenção" : "";
  return `<tr>
    <td>${formatNumeroSequenciaExibicao(l.numeroSequencia)}</td>
    <td>${formatDate(resolverDataIsoLancamentoLivroCaixa(l, data))}</td>
    <td>${escapeHtml(l.historico)}<br/><small style="color:#6b7280">${escapeHtml(rotuloOrigemLancamento(l, data.livroCaixaOrigensCadastro ?? []))}${ret}</small></td>
    <td class="num credito">${credito != null ? formatCurrency(credito) : ""}</td>
    <td class="num debito">${debito != null ? formatCurrency(debito) : ""}</td>
    <td class="num"><strong>${formatCurrency(saldoCorrido)}</strong></td>
  </tr>`;
}

function tabelaPlanilhaHtml(data: AppData, lancamentos: LivroCaixaLancamento[], saldoInicial: number, cronologica = false): string {
  const linhas = buildPlanilhaLinhas(lancamentos, saldoInicial);
  if (cronologica) linhas.reverse();
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
    <tbody>${saldoAnt}${linhas.map((row) => linhaPlanilhaHtml(row.credito, row.debito, row.saldoCorrido, row.lancamento, data)).join("")}</tbody>
  </table>`;
}

export function gerarVolumeLivroCaixaHtml(
  data: AppData,
  cooperativaId: string,
  cooperativaNome: string,
): string {
  const lancamentos = lancamentosLivroCaixa(data, cooperativaId);
  const hoje = dataIsoCooperativa();
  const datas = lancamentos.map((l) => l.data).filter(Boolean).sort();
  const periodo = `${formatDate(datas[0] ?? hoje)} a ${formatDate(datas.at(-1) ?? hoje)}`;
  const saldoLiquido = calcularResumoLiquidoLivroCaixa(data.pagamentosCooperado, lancamentos, datas[0] ?? hoje, datas.at(-1) ?? hoje);
  const nome = escapeHtml(cooperativaNome);
  const cnpj = data.cooperativas.find((c) => c.id === cooperativaId)?.cnpj;
  const identificacao = `${nome}${cnpj ? ` · CNPJ ${escapeHtml(formatCnpj(cnpj))}` : ""}`;
  const porOrigem = new Map<LivroCaixaPastaKey, LivroCaixaLancamento[]>();
  for (const l of lancamentos) {
    const chave = pastaKeyDeLancamento(l);
    const pasta = porOrigem.get(chave);
    if (pasta) pasta.push(l);
    else porOrigem.set(chave, [l]);
  }
  const anexos = [...porOrigem].map(([chave, linhas]) => ({
    titulo: nomePastaLivroCaixa(data, cooperativaId, chave),
    linhas,
  })).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  const secoes = [{ titulo: "Livro Caixa completo", linhas: lancamentos }, ...anexos];
  const indice = secoes.map(({ titulo }, i) =>
    `<li><a href="#parte-${i}">${i ? `Anexo ${i} · ` : ""}${escapeHtml(titulo)}</a><span data-index="${i}"></span></li>`);
  const paginasIndice: string[] = [];
  for (let i = 0; i < indice.length; i += 22) {
    paginasIndice.push(`<section class="folha"><header><p>${nome}</p><h1>Índice</h1><p>${periodo}</p></header>
      <p>Os anexos detalham os mesmos lançamentos do Livro Caixa completo. Seus valores já estão incluídos no livro.</p>
      <ol class="indice">${indice.slice(i, i + 22).join("")}</ol><footer>Índice <span class="pagina"></span></footer></section>`);
  }
  const conteudo = secoes.map(({ titulo, linhas }, i) => {
    const entradas = linhas.filter((l) => l.tipo === "credito").reduce((s, l) => s + l.valor, 0);
    const saidas = linhas.filter((l) => l.tipo === "debito").reduce((s, l) => s + l.valor, 0);
    return `<section class="folha secao" id="parte-${i}"><header><p>${identificacao}</p>
      <h1>${escapeHtml(titulo)}</h1><p>${i ? `Anexo ${i} · ` : ""}${periodo}</p></header>
      ${tabelaPlanilhaHtml(data, linhas, 0, true)}
      <aside class="fechamento"><span>Entradas <strong>${formatCurrency(entradas)}</strong></span>
        <span>Saídas <strong>${formatCurrency(saidas)}</strong></span>
        <span>${i ? "Resultado da origem" : "Saldo contábil final"} <strong>${formatCurrency(entradas - saidas)}</strong></span>
        ${i ? "" : `<span>Saldo líquido para conferência bancária <strong>${formatCurrency(saldoLiquido.saldo)}</strong>
          ${saldoLiquido.pagamentosSemLiquido ? "<small>Inclui débitos registrados sem líquido vinculado.</small>" : ""}</span>`}</aside>
      <footer>${escapeHtml(titulo)} · ${periodo}<span class="pagina"></span></footer></section>`;
  }).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Livro Caixa · ${nome}</title>
    <style>
      ${REPORT_STYLES}
      @page{size:A4;margin:11mm 12mm}
      *{box-sizing:border-box}
      body{margin:0;padding:0;max-width:none;font:11pt Arial,sans-serif;color:#17252b}
      .folha{width:186mm;min-height:274mm;position:relative;margin:0 auto;padding:6mm 0 12mm}
      .folha:not(:last-of-type){break-after:page}
      header{text-align:center;border-bottom:1px solid #27554b;padding-bottom:3mm;margin-bottom:4mm;overflow-wrap:anywhere}
      header p{margin:2mm 0;font-size:9pt}
      h1{color:#17453a;font-size:18pt;margin:3mm 0}
      .capa{padding-top:72mm;text-align:center}
      .capa h1{font-size:28pt;margin:6mm 0}
      .indice{list-style:none;padding:0;margin:0}
      .indice li{display:flex;align-items:baseline;justify-content:space-between;gap:8mm;border-bottom:1px solid #dde3e2;padding:2mm 0}
      .indice a{color:inherit;text-decoration:none;overflow-wrap:anywhere}
      table{table-layout:fixed;font-size:9pt;margin:0}
      th:nth-child(1){width:10mm}th:nth-child(2){width:24mm}th:nth-child(n+4){width:28mm}
      th,td{padding:1.3mm;overflow-wrap:anywhere}td.num,th.num{text-align:right;white-space:nowrap}
      td:nth-child(3){white-space:pre-line}
      thead{display:table-header-group}tr{break-inside:avoid}
      .fechamento{display:flex;justify-content:space-between;gap:5mm;padding:3mm 0;border-top:1px solid #27554b;margin-top:4mm;font-size:9pt;break-inside:avoid}
      .fechamento strong{display:block;margin-top:1mm}
      footer{position:absolute;bottom:3mm;left:0;right:0;display:flex;justify-content:space-between;gap:4mm;border-top:1px solid #dde3e2;padding-top:1.5mm;font-size:8pt}
      .pagina{white-space:nowrap;margin-left:auto}
      @media screen{body{background:#edf1f0}.folha{background:white;margin:8mm auto;padding-left:4mm;padding-right:4mm;width:194mm}.folha footer{left:4mm;right:4mm}}
      @media print{.folha{margin:0}}
    </style></head><body>
    <section class="folha capa"><p>${identificacao}</p><h1>Livro Caixa</h1><p>Livro completo e anexos por origem</p>
      <p>${periodo}</p><p>Emitido em ${formatDate(hoje)}</p><footer><span class="pagina"></span></footer></section>
    ${paginasIndice.join("")}
    ${conteudo}
    <script>
      function paginarVolume() {
        for (const secao of Array.from(document.querySelectorAll(".secao"))) {
          const tabela = secao.querySelector("table");
          if (!tabela) continue;
          const linhas = Array.from(tabela.tBodies[0].rows);
          const fechamento = secao.querySelector(".fechamento");
          fechamento.remove();
          tabela.tBodies[0].replaceChildren();
          let folha = secao;
          let corpo = tabela.tBodies[0];
          const cabe = () => folha.getBoundingClientRect().height <= 274 * 96 / 25.4 + 1;
          const continuar = (comTabela) => {
            const nova = secao.cloneNode(false);
            nova.removeAttribute("id");
            nova.append(secao.querySelector("header").cloneNode(true));
            if (comTabela) {
              const novaTabela = tabela.cloneNode(false);
              novaTabela.append(tabela.tHead.cloneNode(true));
              corpo = novaTabela.createTBody();
              nova.append(novaTabela);
            }
            nova.append(secao.querySelector("footer").cloneNode(true));
            folha.after(nova);
            folha = nova;
          };
          for (const linha of linhas) {
            corpo.append(linha);
            if (!cabe() && corpo.rows.length > 1) {
              continuar(true);
              corpo.append(linha);
            }
          }
          folha.append(fechamento);
          if (!cabe()) {
            continuar(false);
            folha.append(fechamento);
          }
        }
        const folhas = Array.from(document.querySelectorAll(".folha"));
        folhas.forEach((folha, i) => {
          folha.querySelector(".pagina").textContent = "Página " + (i + 1) + " de " + folhas.length;
          if (folha.id) document.querySelector('[data-index="' + folha.id.slice(6) + '"]').textContent = i + 1;
        });
      }
      window.addEventListener("load", () => { paginarVolume(); window.print(); });
    </script></body></html>`;
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
  /** Relatório só da pasta/origem. */
  pastaOrigem?: LivroCaixaPastaKey;
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

  if (opts.pastaOrigem) {
    lancamentos = filtrarLancamentosPorPasta(lancamentos, opts.pastaOrigem);
    saldoInicial = 0;
    tituloPeriodo += ` · pasta ${nomePastaLivroCaixa(data, cooperativaId, opts.pastaOrigem)}`;
  }

  const resumo = resumoLivroCaixa(data, cooperativaId);
  const planilha = tabelaPlanilhaHtml(data, lancamentos, saldoInicial);
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
  const saldoFinal = saldoCorridoFinalPlanilha(linhasPlan, saldoInicial);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
    <title>Livro caixa · ${escapeHtml(cooperativaNome)}</title>
    <style>${REPORT_STYLES}</style></head><body>
    <h1>Livro caixa — ${escapeHtml(cooperativaNome)}</h1>
    <p class="meta">Período: <strong>${tituloPeriodo}</strong> · Saldo geral cooperativa: <strong>${formatCurrency(resumo.saldo)}</strong></p>
    <div class="resumo">
      <div>Créditos no período<strong class="credito">${formatCurrency(creditosPeriodo)}</strong></div>
      <div>Débitos no período<strong class="debito">${formatCurrency(debitosPeriodo)}</strong></div>
      <div>${opts.pastaOrigem ? "Resultado da pasta no período" : "Saldo ao final"}<strong>${formatCurrency(saldoFinal)}</strong></div>
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
