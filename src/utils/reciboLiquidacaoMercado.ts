import type { ContaCoopCooperadoLiquidacao, ContaCoopLiquidacaoPreview } from "@/modules/hb-credit/types";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatDate, formatMesReferencia } from "@/utils/format";

export function gerarRelatorioLiquidacaoMercadoHtml(params: {
  cooperativaNome: string;
  preview: ContaCoopLiquidacaoPreview;
  responsavelNome: string;
  comprovanteMemo?: string;
  pagoEm?: string;
}): string {
  const { cooperativaNome, preview, responsavelNome, comprovanteMemo, pagoEm } = params;
  const cooperadosHtml = preview.cooperados
    .map((coop) => renderCooperadoBlock(coop))
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Liquidação ${preview.partnerNome} — ${formatMesReferencia(preview.mesReferencia)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
    .box { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .total { font-size: 22px; font-weight: bold; color: #166534; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    th { background: #f9fafb; }
    .coop-title { font-weight: bold; margin: 16px 0 8px; color: #14532d; }
    .assinatura { margin-top: 32px; }
  </style>
</head>
<body>
  <h1>Relatório de liquidação — HB Créditos</h1>
  <p class="meta">${cooperativaNome} · Mercado ${preview.partnerNome} · ${formatMesReferencia(preview.mesReferencia)}</p>
  <div class="box">
    <div>Total pago ao mercado</div>
    <div class="total">${formatCentsBRL(preview.totalCents)}</div>
    <p class="meta">${preview.transacoesCount} transação(ões) · PIX: ${preview.pixKey ?? "—"} · Titular: ${preview.pixHolderName ?? "—"}</p>
    <p class="meta">Registrado por ${responsavelNome}${pagoEm ? ` em ${formatDate(pagoEm.split("T")[0])}` : ""}</p>
    ${comprovanteMemo ? `<p class="meta">Observação: ${comprovanteMemo}</p>` : ""}
  </div>
  ${cooperadosHtml}
  <div class="assinatura">
    <p><strong>Assinatura do responsável do mercado</strong></p>
    <p class="meta">Confirme no aplicativo após conferir todas as transações.</p>
    <div id="assinatura-mercado"></div>
  </div>
</body>
</html>`;
}

function renderCooperadoBlock(coop: ContaCoopCooperadoLiquidacao): string {
  const rows = coop.transacoes
    .map((tx) => {
      const label = tx.tipo === "REFUND" ? "Estorno" : "Compra";
      const valor = tx.tipo === "REFUND" ? `- ${formatCentsBRL(tx.amountCents)}` : formatCentsBRL(tx.amountCents);
      return `<tr>
        <td>${new Date(tx.createdAt).toLocaleString("pt-BR")}</td>
        <td>${label}</td>
        <td>${tx.descricao ?? "—"}</td>
        <td>${tx.receiptCode ?? "—"}</td>
        <td style="text-align:right">${valor}</td>
      </tr>`;
    })
    .join("");

  return `<div class="box">
    <div class="coop-title">Cooperado ${coop.cooperadoId}</div>
    <table>
      <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Comprovante</th><th>Valor</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;font-weight:bold;margin-top:8px">Subtotal: ${formatCentsBRL(coop.saldoCents)}</p>
  </div>`;
}

export function injetarAssinaturaMercadoNoRelatorio(html: string, assinaturaDataUrl: string, confirmadoEm: string): string {
  const img = `<img src="${assinaturaDataUrl}" alt="Assinatura do mercado" style="max-width:320px;height:80px;object-fit:contain;border-bottom:2px solid #111;display:block" />
    <p class="meta">Assinado em ${formatDate(confirmadoEm.split("T")[0])}</p>`;
  return html.replace('<div id="assinatura-mercado"></div>', img);
}
