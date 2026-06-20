import type { AppData, Cooperado, PagamentoCooperadoRegistro } from "@/types";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";

export function gerarReciboHtml(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro,
  cooperado: Cooperado,
  cooperativaNome: string
): string {
  const fichas = data.fichaCorrida.filter((f) => pagamento.fichaIds.includes(f.id));
  const linhasItens = fichas
    .flatMap((f) =>
      (f.itens ?? []).map(
        (i) =>
          `<tr><td>${f.descricao}</td><td>${i.produtoNome}</td><td>${i.quantidade} ${i.unidade}</td><td>${formatCurrency(i.precoUnitario)}</td><td>${formatCurrency(i.valorBruto)}</td></tr>`
      )
    )
    .join("");

  const descontosHtml = [
    pagamento.descontoCooperativa > 0
      ? `<tr><td colspan="4">Desconto cooperativa</td><td>- ${formatCurrency(pagamento.descontoCooperativa)}</td></tr>`
      : "",
    ...pagamento.descontosExtras.map(
      (d) => `<tr><td colspan="4">${d.motivo}</td><td>- ${formatCurrency(d.valor)}</td></tr>`
    ),
  ].join("");

  const assinatura = pagamento.assinaturaCooperado
    ? `<img src="${pagamento.assinaturaCooperado}" alt="Assinatura" style="max-width:280px;border-bottom:1px solid #ccc" />`
    : "<p>___________________________</p>";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Recibo — ${cooperado.nomeCompleto}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 24px auto; color: #111; }
    h1 { font-size: 1.25rem; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f3f4f6; }
    .total { font-size: 1.25rem; font-weight: bold; color: #15803d; }
    .meta { color: #555; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Comprovante de recebimento</h1>
  <p class="meta">${cooperativaNome} · ${formatMesReferencia(pagamento.mesReferencia)}</p>
  <p><strong>Cooperado:</strong> ${cooperado.nomeCompleto}<br/>
  <strong>Data pagamento:</strong> ${formatDate(pagamento.pagoEm.split("T")[0])}</p>
  <table>
    <thead><tr><th>Entrega</th><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
    <tbody>${linhasItens || `<tr><td colspan="5">Entregas do período</td></tr>`}</tbody>
    <tfoot>
      <tr><td colspan="4"><strong>Valor bruto</strong></td><td>${formatCurrency(pagamento.valorBruto)}</td></tr>
      ${descontosHtml}
      <tr><td colspan="4"><strong>Total recebido</strong></td><td class="total">${formatCurrency(pagamento.valorLiquido)}</td></tr>
    </tfoot>
  </table>
  <p><strong>Assinatura do cooperado:</strong></p>
  ${assinatura}
  <p class="meta">Documento gerado em ${formatDate(new Date().toISOString().split("T")[0])}</p>
</body>
</html>`;
}

export function baixarReciboHtml(html: string, nomeArquivo: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function getCooperativaNome(data: AppData, cooperativaId: string): string {
  return data.cooperativas.find((c) => c.id === cooperativaId)?.nome ?? "Cooperativa";
}
