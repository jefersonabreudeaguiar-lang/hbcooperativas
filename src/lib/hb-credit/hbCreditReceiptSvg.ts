import type { HbCreditPaymentReceipt } from "@/lib/hb-credit/hbCreditPaymentReceipt";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";

export const HB_CREDIT_RECEIPT_CARD_W = 360;
export const HB_CREDIT_RECEIPT_SHARE_IMPL = 4;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapSvgLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (test.length <= maxChars) line = test;
    else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

/** SVG do comprovante — só cores hex (sem CSS do Tailwind). */
export function buildHbCreditReceiptSvg(receipt: HbCreditPaymentReceipt): string {
  const paidLabel = new Date(receipt.paidAt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const valor = formatCentsBRL(receipt.amountCents);

  type Row = { label: string; value: string; mono?: boolean; highlight?: boolean };
  const rows: Row[] = [
    { label: "Beneficiário", value: receipt.parceiroNome },
    { label: "Pagador", value: receipt.cooperadoNome },
    { label: "Forma", value: "HB Crédito" },
    { label: "Data e hora", value: paidLabel },
    { label: "Comprovante", value: receipt.receiptCode, mono: true },
    { label: "Transação", value: receipt.transacaoId, mono: true },
  ];
  if (typeof receipt.saldoAposCents === "number") {
    rows.push({
      label: "Saldo HB após",
      value: formatCentsBRL(receipt.saldoAposCents),
      highlight: true,
    });
  }

  const pad = 22;
  const headerH = 128;
  const footerH = 44;
  let bodyH = 0;
  for (const row of rows) {
    const lines = wrapSvgLines(row.value, row.mono ? 28 : 32);
    bodyH += 14 + lines.length * (row.mono ? 15 : 17) + 10;
  }
  const cardH = headerH + bodyH + footerH;
  const w = HB_CREDIT_RECEIPT_CARD_W;

  let y = headerH + 8;
  const rowParts: string[] = [];
  for (const row of rows) {
    const lines = wrapSvgLines(row.value, row.mono ? 28 : 32);
    const valueColor = row.highlight ? "#047857" : "#111827";
    const fontSize = row.mono ? 11 : 13;
    const fontWeight = row.mono ? 600 : 600;
    const fontFamily = row.mono
      ? "ui-monospace, Menlo, Consolas, monospace"
      : "system-ui, -apple-system, Segoe UI, sans-serif";

    rowParts.push(
      `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#f3f4f6" />`
    );
    const labelY = y + 22;
    rowParts.push(
      `<text x="${pad}" y="${labelY}" fill="#6b7280" font-size="13" font-family="system-ui, sans-serif">${escapeXml(row.label)}</text>`
    );
    let vy = labelY;
    for (const line of lines) {
      rowParts.push(
        `<text x="${w - pad}" y="${vy}" text-anchor="end" fill="${valueColor}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="${fontFamily}">${escapeXml(line)}</text>`
      );
      vy += row.mono ? 15 : 17;
    }
    y += Math.max(44, 14 + lines.length * (row.mono ? 15 : 17) + 10);
  }

  rowParts.push(
    `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#f3f4f6" />`
  );
  const foot = "O mercado foi notificado. Guarde este comprovante.";
  rowParts.push(
    `<text x="${w / 2}" y="${y + 28}" text-anchor="middle" fill="#6b7280" font-size="11" font-family="system-ui, sans-serif">${escapeXml(foot)}</text>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${cardH}" viewBox="0 0 ${w} ${cardH}">
  <rect width="${w}" height="${cardH}" fill="#ecfdf5"/>
  <rect width="${w}" height="${cardH}" rx="24" ry="24" fill="#ffffff"/>
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="${w}" y2="${headerH}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#047857"/>
      <stop offset="0.5" stop-color="#15803d"/>
      <stop offset="1" stop-color="#065f46"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${headerH}" fill="url(#hdr)"/>
  <text x="${pad}" y="28" fill="#d1fae5" font-size="10" font-weight="600" letter-spacing="2" font-family="system-ui, sans-serif">HB CRÉDITOS</text>
  <text x="${pad}" y="54" fill="#ffffff" font-size="18" font-weight="600" font-family="system-ui, sans-serif">Pagamento realizado</text>
  <text x="${pad}" y="98" fill="#ffffff" font-size="34" font-weight="700" font-family="system-ui, sans-serif">${escapeXml(valor)}</text>
  ${rowParts.join("\n  ")}
  <rect x="1" y="1" width="${w - 2}" height="${cardH - 2}" rx="24" ry="24" fill="none" stroke="#a7f3d0" stroke-width="2"/>
</svg>`;
}

export function hbCreditReceiptSvgDimensions(receipt: HbCreditPaymentReceipt): { width: number; height: number } {
  const svg = buildHbCreditReceiptSvg(receipt);
  const m = svg.match(/height="(\d+)"/);
  const height = m ? Number(m[1]) : 400;
  return { width: HB_CREDIT_RECEIPT_CARD_W, height };
}
