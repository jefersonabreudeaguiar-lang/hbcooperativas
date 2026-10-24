import type { HbCreditPaymentReceipt } from "@/lib/hb-credit/hbCreditPaymentReceipt";
import { formatHbCreditReceiptShareText } from "@/lib/hb-credit/hbCreditPaymentReceipt";
import {
  HB_CREDIT_RECEIPT_SHARE_IMPL,
  buildHbCreditReceiptSvg,
  hbCreditReceiptSvgDimensions,
} from "@/lib/hb-credit/hbCreditReceiptSvg";
import {
  fetchOfficialClientRelease,
  requestManualCooperadoReleaseUpgrade,
} from "@/lib/pwa/fetchOfficialClientRelease";
import {
  alignClientRuntimeToRelease,
  collectLoadedDeploymentIdsFromDom,
  evaluateClientReleaseAlignment,
  getEmbeddedClientRelease,
  getPageEmbeddedReleaseFromDom,
  releaseFingerprint,
} from "@/lib/pwa/clientRelease";

const SCALE = 2;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível montar a imagem do comprovante."));
    img.src = url;
  });
}

async function rasterizeSvgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Comprovante em imagem só no navegador.");
  }
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png", 1);
    });
    if (!blob) throw new Error("Não foi possível gerar a imagem do comprovante.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Garante bundle atual antes de compartilhar (PWA com chunk antigo + html2canvas). */
export async function ensureHbCreditReceiptShareRuntime(): Promise<void> {
  if (typeof window === "undefined") return;
  const canonical = await fetchOfficialClientRelease({ bypassCache: true });
  if (!canonical) return;

  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();
  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });
  if (decision.action === "align") {
    await alignClientRuntimeToRelease(`hb_receipt_share:${decision.reason}`, canonical.deploymentId, {
      hard: true,
      urgentUpgrade: true,
      targetBuild: canonical.build,
      targetFingerprint: releaseFingerprint(canonical),
    });
  }

  const embedded = getEmbeddedClientRelease();
  if (embedded.build > 0 && embedded.build < canonical.build) {
    await alignClientRuntimeToRelease("hb_receipt_share:embedded_behind", canonical.deploymentId, {
      hard: true,
      urgentUpgrade: true,
      targetBuild: canonical.build,
      targetFingerprint: releaseFingerprint(canonical),
    });
  }
}

export function isHbCreditReceiptShareStaleError(message: string): boolean {
  return /oklab|oklch|html2canvas|unsupported color function/i.test(message);
}

/** Comprovante em PNG — SVG + rasterização (sem captura do DOM). */
export async function renderHbCreditReceiptPngBlob(receipt: HbCreditPaymentReceipt): Promise<Blob> {
  if (HB_CREDIT_RECEIPT_SHARE_IMPL < 4) {
    throw new Error("Atualize o app para compartilhar o comprovante.");
  }
  const svg = buildHbCreditReceiptSvg(receipt);
  const { width, height } = hbCreditReceiptSvgDimensions(receipt);
  return rasterizeSvgToPngBlob(svg, width, height);
}

export function hbCreditReceiptPngFileName(receiptCode: string): string {
  const safe = receiptCode.replace(/[^\w-]+/g, "").slice(0, 24) || "comprovante";
  return `hb-credit-${safe}.png`;
}

async function shareReceiptAsText(receipt: HbCreditPaymentReceipt): Promise<"shared"> {
  const text = formatHbCreditReceiptShareText(receipt);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    await navigator.share({ title: "Comprovante HB Créditos", text });
    return "shared";
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = hbCreditReceiptPngFileName(receipt.receiptCode).replace(/\.png$/, ".txt");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return "shared";
}

export async function shareHbCreditReceiptPng(
  blob: Blob,
  receiptCode: string,
  receipt?: HbCreditPaymentReceipt
): Promise<"shared" | "downloaded"> {
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
      if (receipt) {
        await shareReceiptAsText(receipt);
        return "shared";
      }
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

/** Compartilhar comprovante com recuperação de PWA desatualizado. */
export async function shareHbCreditPaymentReceipt(receipt: HbCreditPaymentReceipt): Promise<"shared" | "downloaded"> {
  await ensureHbCreditReceiptShareRuntime();
  try {
    const blob = await renderHbCreditReceiptPngBlob(receipt);
    return await shareHbCreditReceiptPng(blob, receipt.receiptCode, receipt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isHbCreditReceiptShareStaleError(msg)) {
      const upgraded = await requestManualCooperadoReleaseUpgrade();
      if (upgraded) throw new DOMException("Atualizando app…", "AbortError");
      return await shareReceiptAsText(receipt);
    }
    throw e;
  }
}
