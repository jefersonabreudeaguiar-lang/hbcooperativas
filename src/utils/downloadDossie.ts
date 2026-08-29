import JSZip from "jszip";

export interface DossieArquivo {
  path: string;
  content: string;
}

export async function baixarDossieZip(arquivos: DossieArquivo[], nomeZip: string): Promise<void> {
  if (typeof window === "undefined") return;

  const zip = new JSZip();
  for (const arquivo of arquivos) {
    zip.file(arquivo.path, arquivo.content);
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeZip.endsWith(".zip") ? nomeZip : `${nomeZip}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
