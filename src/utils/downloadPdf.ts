function garantirNomePdf(nomeArquivo: string): string {
  const base = nomeArquivo.replace(/\.html$/i, "").replace(/\.pdf$/i, "");
  return `${base}.pdf`;
}

function aguardarImagens(doc: Document): Promise<void> {
  const imgs = [...doc.images];
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  ).then(() => undefined);
}

/** Converte HTML (recibos, relatórios) em PDF e dispara o download no navegador. */
export async function baixarHtmlComoPdf(html: string, nomeArquivo: string): Promise<void> {
  if (typeof window === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Não foi possível preparar o documento para PDF.");
  }

  doc.open();
  doc.write(html);
  doc.close();

  await aguardarImagens(doc);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const nomePdf = garantirNomePdf(nomeArquivo);

  try {
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: nomePdf,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(doc.body)
      .save();
  } finally {
    document.body.removeChild(iframe);
  }
}
