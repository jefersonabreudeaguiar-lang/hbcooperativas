import { resumoExtratoAnual, type ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { formatCurrency, formatDate } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";

const escapar = (v: string) => v.replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c
));
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export function extratosAnuaisHtml(extratos: readonly ExtratoAnualCooperado[], nomeCooperativa: string, imprimir = false): string {
  const body = extratos.map(e => {
    const resumo = resumoExtratoAnual(e);
    return `<section class="extrato"><header><p>${escapar(nomeCooperativa)}</p>
      <h1>Extrato anual por cooperado</h1><h2>${escapar(e.nome)}</h2>
      <p>01/01/${e.ano} a ${escapar(formatDate(e.ate))} · Entregas registradas no app</p></header>
      <div class="totais"><span>Bruto das entregas <strong>${formatCurrency(resumo.bruto)}</strong></span>
      <span>Total recebido <strong>${e.financeiro ? formatCurrency(e.financeiro.recebido) : "Não apurado nesta edição"}</strong></span>
      <span>Descontos efetivados <strong>${e.financeiro ? formatCurrency(e.financeiro.descontosEfetivados) : "Não apurado nesta edição"}</strong></span></div>
      <p class="nota">Os produtos somam entregas conferidas, pagas e entregues. Recebimentos e descontos usam a data dos pagamentos confirmados no app.</p>
      ${resumo.itens.length ? `<h2>Resumo por produto</h2><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor</th></tr></thead>
        <tbody>${resumo.itens.map(i => `<tr><td>${escapar(i.nome)}</td><td>${qtd.format(i.quantidade)} ${escapar(labelUnidade(i.unidade))}</td><td>${formatCurrency(i.centavos / 100)}</td></tr>`).join("")}</tbody></table>` : "<p>Nenhum produto de entrega aprovada registrado neste período.</p>"}</section>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Extrato anual por cooperado</title>
    <style>
    @page{size:A4;margin:12mm}body{font:11pt Arial,sans-serif;color:#18342c;margin:0}
    .extrato + .extrato{break-before:page}header{border-bottom:2px solid #205b49;margin-bottom:16px;padding-bottom:8px}header p{margin:5px 0}
    h1{margin:6px 0;font-size:21pt}h2{margin:14px 0 4px;font-size:14pt}
    .totais{display:flex;gap:24px;flex-wrap:wrap}.totais strong{display:block;margin-top:5px}.nota{font-size:9pt;color:#405950}
    table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #cddad2;padding:3px 5px;text-align:left}
    th:last-child,td:last-child{text-align:right}
    thead{display:table-header-group;background:#e7efe9}tr{break-inside:avoid}
    @media screen{body{margin:24px auto;max-width:880px}.extrato{padding:16px}}
    </style></head><body>${body}${imprimir ? "<script>window.addEventListener('load', () => window.print());</script>" : ""}</body></html>`;
}
