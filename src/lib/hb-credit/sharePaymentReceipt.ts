type ReceiptShareDependencies = {
  share?: (data: { title: string; text: string }) => Promise<void>;
  copy?: (text: string) => Promise<void>;
  download: (text: string, filename: string) => void;
};

function downloadReceipt(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/** A falta de compartilhamento nativo ou permissão para copiar ainda permite obter o comprovante. */
export async function sharePaymentReceipt(text: string, receiptCode: string, dependencies?: ReceiptShareDependencies): Promise<"shared" | "copied" | "downloaded" | "cancelled"> {
  const deps = dependencies ?? {
    share: typeof navigator.share === "function" ? (data: { title: string; text: string }) => navigator.share(data) : undefined,
    copy: navigator.clipboard ? (value: string) => navigator.clipboard.writeText(value) : undefined,
    download: downloadReceipt,
  };
  if (deps.share) {
    try { await deps.share({ title: "Comprovante HB Créditos", text }); return "shared"; }
    catch (error) { if (error instanceof Error && error.name === "AbortError") return "cancelled"; }
  }
  if (deps.copy) {
    try { await deps.copy(text); return "copied"; } catch { /* Navegador pode negar acesso à área de transferência. */ }
  }
  const code = receiptCode.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "pagamento";
  deps.download(text, `comprovante-hb-${code}.txt`);
  return "downloaded";
}
