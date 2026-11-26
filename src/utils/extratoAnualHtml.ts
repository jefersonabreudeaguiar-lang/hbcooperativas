import { resumoExtratoAnual, type ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";

const escapar = (v: string) => v.replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c
));
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const status: Record<string, string> = {
  pago: "Paga", conferida: "Conferida", entregue: "Entregue",
  aguardando_conferencia: "Em análise", rejeitada: "Rejeitada",
};

export function extratosAnuaisHtml(extratos: readonly ExtratoAnualCooperado[], nomeCooperativa: string, imprimir = false): string {
  const body = extratos.map(e => {
    const resumo = resumoExtratoAnual(e);
    return `<section class="extrato"><header><p>${escapar(nomeCooperativa)}</p>
      <h1>Extrato anual por cooperado</h1><h2>${escapar(e.nome)}</h2>
      <p>01/01/${e.ano} a ${escapar(formatDate(e.ate))} · Entregas registradas no app</p></header>
      <div class="totais"><span>Bruto <strong>${formatCurrency(resumo.bruto)}</strong></span>
      <span>Descontos das entregas <strong>${formatCurrency(resumo.descontos)}</strong></span>
      <span>Líquido das entregas <strong>${formatCurrency(resumo.liquido)}</strong></span></div>
      <p class="nota">O resumo soma entregas conferidas, pagas e entregues. O líquido das entregas não representa o total de PIX recebidos.</p>
      ${resumo.itens.length ? `<h2>Resumo por produto</h2><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor</th></tr></thead>
        <tbody>${resumo.itens.map(i => `<tr><td>${escapar(i.nome)}</td><td>${qtd.format(i.quantidade)} ${escapar(labelUnidade(i.unidade))}</td><td>${formatCurrency(i.centavos / 100)}</td></tr>`).join("")}</tbody></table>` : ""}
      <h2>Entregas do período</h2>
      ${e.entregas.length ? e.entregas.map(n => `<article>
        <h3>${escapar(n.dataEntrega ? formatDate(n.dataEntrega) : formatMesReferencia(n.mesReferencia))} · Nota ${escapar(n.numeroNota || "sem número")} · ${escapar(status[n.status] ?? n.status)}</h3>
        <p>${[n.contrato, n.localEntrega].filter(Boolean).map(escapar).join(" · ")}</p>
        ${n.itens?.length ? `<table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Valor do item</th></tr></thead>
          <tbody>${n.itens.map(i => `<tr><td>${escapar(i.produtoNome)}</td><td>${qtd.format(i.quantidade)} ${escapar(labelUnidade(i.unidade))}</td>
          <td>${formatCurrency(i.precoUnitario)}</td><td>${formatCurrency(i.valorBruto)}</td></tr>`).join("")}</tbody></table>` : "<p>Sem itens registrados.</p>"}
        <p class="total-entrega">Bruto ${formatCurrency(n.valorBruto)} · Descontos ${formatCurrency(n.valorDesconto)} · Líquido ${formatCurrency(n.valorLiquido)}</p>
      </article>`).join("") : "<p>Nenhuma entrega registrada neste período.</p>"}</section>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Extrato anual por cooperado</title>
    <style>
    @page{size:A4;margin:12mm}body{font:11pt Arial,sans-serif;color:#18342c;margin:0}
    .extrato + .extrato{break-before:page}header{border-bottom:2px solid #205b49;margin-bottom:16px;padding-bottom:8px}header p{margin:5px 0}
    h1{margin:6px 0;font-size:21pt}h2{margin:14px 0 4px;font-size:14pt}h3{margin:14px 0 4px;font-size:11pt;break-after:avoid}
    .totais{display:flex;gap:24px;flex-wrap:wrap}.totais strong{display:block;margin-top:5px}.nota{font-size:9pt;color:#405950}
    table{width:100%;border-collapse:collapse;font-size:10pt}th,td{border:1px solid #cddad2;padding:5px;text-align:left}
    thead{display:table-header-group;background:#e7efe9}tr,.total-entrega{break-inside:avoid}.total-entrega{font-weight:bold}
    @media screen{body{margin:24px auto;max-width:880px}.extrato{padding:16px}}
    </style></head><body>${body}${imprimir ? "<script>window.addEventListener('load', () => window.print());</script>" : ""}</body></html>`;
}
