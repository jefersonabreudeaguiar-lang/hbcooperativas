import JSZip from "jszip";
import type { LivroCaixaPacoteContabil } from "@/services/livroCaixaExportContabil";

export async function downloadLivroCaixaPacoteContabilZip(
  pacote: LivroCaixaPacoteContabil,
  zipFileName: string
): Promise<void> {
  const zip = new JSZip();
  for (const file of pacote.files) {
    zip.file(file.name, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName.endsWith(".zip") ? zipFileName : `${zipFileName}.zip`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
