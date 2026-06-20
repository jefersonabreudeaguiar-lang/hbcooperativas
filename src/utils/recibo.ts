import type { Cooperado, PagamentoCooperadoRegistro } from "@/types";
import type { ItemResumoFichaMes } from "@/services/notaPedidoService";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";

export interface ReciboResumoInput {
  itens: ItemResumoFichaMes[];
  entregas: number;
  valorBruto: number;
  descontoCooperativa: number;
  valorEntregas: number;
  descontosExtras: PagamentoCooperadoRegistro["descontosExtras"];
  valorLiquido: number;
}

export function resumoReciboFromPagamento(
  pagamento: PagamentoCooperadoRegistro,
  itensMes: { itens: ItemResumoFichaMes[]; entregas: number; valorBruto: number }
): ReciboResumoInput {
  const valorEntregas = Math.max(0, pagamento.valorBruto - pagamento.descontoCooperativa);
  return {
    itens: itensMes.itens,
    entregas: itensMes.entregas,
    valorBruto: pagamento.valorBruto,
    descontoCooperativa: pagamento.descontoCooperativa,
    valorEntregas,
    descontosExtras: pagamento.descontosExtras,
    valorLiquido: pagamento.valorLiquido,
  };
}

export function gerarReciboHtml(
  pagamento: PagamentoCooperadoRegistro,
  cooperado: Cooperado,
  cooperativaNome: string,
  resumo: ReciboResumoInput,
  descontoPadraoPct = 0
): string {
  const linhasItens = resumo.itens
    .map(
      (i) =>
        `<tr><td>${i.produtoNome}</td><td style="text-align:right">${i.quantidade} ${i.unidade}</td><td style="text-align:right">${formatCurrency(i.valorBruto)}</td></tr>`
    )
    .join("");

  const descontosExtrasHtml = resumo.descontosExtras
    .map(
      (d) =>
        `<div><span>${d.motivo}</span><span style="color:#dc2626">- ${formatCurrency(d.valor)}</span></div>`
    )
    .join("");

  const assinatura = pagamento.assinaturaCooperado
    ? `<img src="${pagamento.assinaturaCooperado}" alt="Assinatura do cooperado" style="max-width:320px;height:80px;object-fit:contain;border-bottom:2px solid #111;display:block" />`
    : "<p style='border-bottom:2px solid #111;width:280px;height:60px'></p>";

  const assinadoEm = pagamento.assinadoEm
    ? `<p class="meta">Assinado em ${formatDate(pagamento.assinadoEm.split("T")[0])}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Recibo — ${cooperado.nomeCompleto}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 24px auto; color: #111; padding: 0 16px; }
    h1 { font-size: 1.35rem; margin-bottom: 4px; color: #15803d; }
    h2 { font-size: 1rem; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #15803d; color: #fff; }
    tr.resumo td { border: none; padding: 4px 8px; }
    .resumo-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .resumo-box div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .total { font-size: 1.35rem; font-weight: bold; color: #15803d; border-top: 2px solid #e5e7eb; padding-top: 8px; margin-top: 8px; }
    .meta { color: #555; font-size: 13px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Recibo de recebimento</h1>
  <p class="meta">${cooperativaNome} · ${formatMesReferencia(pagamento.mesReferencia)}</p>
  <p><strong>Cooperado:</strong> ${cooperado.nomeCompleto}<br/>
  <strong>Pago por:</strong> ${pagamento.pagoPor}<br/>
  <strong>Data do pagamento:</strong> ${formatDate(pagamento.pagoEm.split("T")[0])}</p>

  <h2>Resumo das entregas</h2>
  <p class="meta">${resumo.entregas} entrega${resumo.entregas !== 1 ? "s" : ""} no mês · totais consolidados por item</p>
  <table>
    <thead><tr><th>Item</th><th style="text-align:right;width:120px">Quantidade</th><th style="text-align:right;width:120px">Valor</th></tr></thead>
    <tbody>${linhasItens || `<tr><td colspan="3">Entregas do período</td></tr>`}</tbody>
    <tfoot>
      <tr><td colspan="2"><strong>Total bruto dos itens</strong></td><td style="text-align:right"><strong>${formatCurrency(resumo.itens.reduce((s, i) => s + i.valorBruto, 0) || resumo.valorBruto)}</strong></td></tr>
    </tfoot>
  </table>

  <h2>Resumo financeiro</h2>
  <div class="resumo-box">
    <div><span>Total entregas (bruto)</span><span>${formatCurrency(resumo.valorBruto)}</span></div>
    <div><span>Desconto cooperativa${descontoPadraoPct > 0 ? ` (${descontoPadraoPct}%)` : ""}</span><span style="color:#b45309">- ${formatCurrency(resumo.descontoCooperativa)}</span></div>
    <div><span>Entregas líquidas</span><span>${formatCurrency(resumo.valorEntregas)}</span></div>
    ${descontosExtrasHtml}
    <div class="total"><span>Total recebido</span><span>${formatCurrency(resumo.valorLiquido)}</span></div>
  </div>

  <h2>Assinatura do cooperado</h2>
  ${assinatura}
  ${assinadoEm}
  <p class="meta" style="margin-top:24px">Documento gerado em ${formatDate(new Date().toISOString().split("T")[0])}</p>
</body>
</html>`;
}

export function baixarReciboHtml(html: string, nomeArquivo: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".html") ? nomeArquivo : `${nomeArquivo}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function nomeArquivoRecibo(mesReferencia: string, cooperadoNome: string): string {
  const slug = cooperadoNome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `recibo-${mesReferencia}-${slug || "cooperado"}.html`;
}
