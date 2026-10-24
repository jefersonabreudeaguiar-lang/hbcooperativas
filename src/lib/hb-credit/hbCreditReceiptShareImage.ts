/** Gera PNG do comprovante HB para compartilhar (Canvas — evita oklab/oklch do Tailwind no html2canvas). */

import type { HbCreditPaymentReceipt } from "@/lib/hb-credit/hbCreditPaymentReceipt";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";

const CARD_W = 360;
const PAD = 22;
const SCALE = 2;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Comprovante em PNG — cores só hex/rgb (compatível com qualquer share). */
export async function renderHbCreditReceiptPngBlob(receipt: HbCreditPaymentReceipt): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Comprovante em imagem só no navegador.");
  }

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

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas indisponível.");
  measure.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
  const valueMaxW = CARD_W - PAD * 2 - 110;
  let bodyH = 0;
  for (const row of rows) {
    measure.font = row.mono
      ? "11px ui-monospace, SFMono-Regular, Menlo, monospace"
      : "13px system-ui, -apple-system, Segoe UI, sans-serif";
    const lines = wrapText(measure, row.value, valueMaxW);
    bodyH += 14 + lines.length * (row.mono ? 15 : 17) + 10;
  }
  const headerH = 128;
  const footerH = 44;
  const cardH = headerH + bodyH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = cardH * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ecfdf5";
  ctx.fillRect(0, 0, CARD_W, cardH);

  roundRect(ctx, 0, 0, CARD_W, cardH, 24);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_W, cardH);

  const grd = ctx.createLinearGradient(0, 0, CARD_W, headerH);
  grd.addColorStop(0, "#047857");
  grd.addColorStop(0.5, "#15803d");
  grd.addColorStop(1, "#065f46");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, CARD_W, headerH);

  ctx.fillStyle = "rgba(209, 250, 229, 0.95)";
  ctx.font = "600 10px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("HB CRÉDITOS", PAD, 28);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("Pagamento realizado", PAD, 54);

  ctx.font = "700 34px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(valor, PAD, 98);

  let y = headerH + 8;
  for (const row of rows) {
    ctx.strokeStyle = "#f3f4f6";
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(CARD_W - PAD, y);
    ctx.stroke();

    ctx.fillStyle = "#6b7280";
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(row.label, PAD, y + 22);

    ctx.fillStyle = row.highlight ? "#047857" : "#111827";
    ctx.font = row.mono
      ? "600 11px ui-monospace, SFMono-Regular, Menlo, monospace"
      : "600 13px system-ui, -apple-system, Segoe UI, sans-serif";
    const lines = wrapText(ctx, row.value, valueMaxW);
    let vy = y + 22;
    for (const line of lines) {
      ctx.fillText(line, CARD_W - PAD - ctx.measureText(line).width, vy);
      vy += row.mono ? 15 : 17;
    }
    y += Math.max(44, 14 + lines.length * (row.mono ? 15 : 17) + 10);
  }

  ctx.strokeStyle = "#f3f4f6";
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(CARD_W - PAD, y);
  ctx.stroke();

  ctx.fillStyle = "#6b7280";
  ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
  const foot = "O mercado foi notificado. Guarde este comprovante.";
  ctx.fillText(foot, (CARD_W - ctx.measureText(foot).width) / 2, y + 28);

  ctx.restore();
  ctx.strokeStyle = "#a7f3d0";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, CARD_W - 2, cardH - 2, 24);
  ctx.stroke();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 1);
  });
  if (!blob) throw new Error("Não foi possível gerar a imagem do comprovante.");
  return blob;
}

export function hbCreditReceiptPngFileName(receiptCode: string): string {
  const safe = receiptCode.replace(/[^\w-]+/g, "").slice(0, 24) || "comprovante";
  return `hb-credit-${safe}.png`;
}

export async function shareHbCreditReceiptPng(blob: Blob, receiptCode: string): Promise<"shared" | "downloaded"> {
  const fileName = hbCreditReceiptPngFileName(receiptCode);
  const file = new File([blob], fileName, { type: "image/png" });

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const payload: ShareData = { title: "Comprovante HB Créditos", files: [file] };
    if (typeof navigator.canShare === "function" && navigator.canShare(payload)) {
      await navigator.share(payload);
      return "shared";
    }
    try {
      await navigator.share({ title: "Comprovante HB Créditos", files: [file] });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
