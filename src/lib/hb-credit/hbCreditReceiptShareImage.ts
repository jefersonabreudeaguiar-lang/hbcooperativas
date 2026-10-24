/** Gera PNG do comprovante HB para compartilhar como imagem (WhatsApp, etc.). */

export async function captureElementAsPngBlob(element: HTMLElement, scale = 2): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 1);
  });
  if (!blob) {
    throw new Error("Não foi possível gerar a imagem do comprovante.");
  }
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
