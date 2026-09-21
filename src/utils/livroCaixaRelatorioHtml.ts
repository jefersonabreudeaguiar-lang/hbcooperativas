import type { AppData, LivroCaixaLancamento, LivroCaixaOrigem } from "@/types";
import { formatCurrency, formatDate } from "@/utils/format";
import {
  formatNumeroSequenciaExibicao,
  isOrigemRetencaoContabil,
  lancamentosLivroCaixaPorData,
} from "@/services/livroCaixaService";

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

function linhaTabela(l: LivroCaixaLancamento): string {
  const sinal = l.tipo === "credito" ? "+" : "−";
  const ret = isOrigemRetencaoContabil(l.origem) ? " (retenção)" : "";
  return `<tr>
    <td>${formatNumeroSequenciaExibicao(l.numeroSequencia)}</td>
    <td>${formatDate(l.data)}</td>
    <td>${ORIGEM_LABELS[l.origem]}${ret}</td>
    <td>${escapeHtml(l.historico)}</td>
    <td style="text-align:right">${sinal} ${formatCurrency(l.valor)}</td>
  </tr>`;
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

export function gerarRelatorioLivroCaixaDiaHtml(
  data: AppData,
  cooperativaId: string,
  cooperativaNome: string,
  dataIso: string,
  opts?: { incluirExtratoFicha?: boolean }
): string {
  const lancamentos = lancamentosLivroCaixaPorData(data, cooperativaId, dataIso);
  const corpoLivro =
    lancamentos.length === 0
      ? "<p><em>Nenhum lançamento no livro caixa nesta data.</em></p>"
      : `<table>
      <thead><tr><th>Nº</th><th>Data</th><th>Origem</th><th>Histórico</th><th>Valor</th></tr></thead>
      <tbody>${lancamentos.map(linhaTabela).join("")}</tbody>
    </table>`;

  const ficha =
    opts?.incluirExtratoFicha === true
      ? `<h2>Extrato ficha corrida (pagamentos do dia)</h2>${extratoFichaDoDia(data, cooperativaId, dataIso)}`
      : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
    <title>Livro caixa · ${dataIso}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:1.25rem;margin:0 0 8px}
      h2{font-size:1rem;margin:24px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f3f4f6}
    </style></head><body>
    <h1>Livro caixa — ${escapeHtml(cooperativaNome)}</h1>
    <p>Data: <strong>${formatDate(dataIso)}</strong></p>
    <h2>Lançamentos do dia</h2>
    ${corpoLivro}
    ${ficha}
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;
}
