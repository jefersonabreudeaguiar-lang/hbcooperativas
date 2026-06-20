import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

/** Reduz tamanho da foto para caber no armazenamento e enviar à nuvem. */
export async function compressFotoFile(
  file: File,
  maxWidth = 960,
  quality = 0.62
): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  return compressDataUrl(raw, maxWidth, quality);
}

/** Miniatura para listas no aparelho do cooperado (poucos KB). */
export async function makeFotoThumbnail(dataUrl: string): Promise<string> {
  return compressDataUrl(dataUrl, 320, 0.5);
}

export async function compressDataUrl(
  dataUrl: string,
  maxWidth: number,
  quality: number
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler a foto."));
    reader.readAsDataURL(file);
  });
}

export function getFotoExibicaoNota(nota: NotaPedido): string | undefined {
  return nota.fotoPedido ?? nota.fotoPedidoMiniatura;
}

export function getNotaCooperativaCnpj(data: AppData, nota: NotaPedido): string | undefined {
  if (nota.cooperativaCnpj) {
    const d = normalizeCnpj(nota.cooperativaCnpj);
    return d.length === 14 ? d : undefined;
  }
  const coop = data.cooperativas.find((c) => c.id === nota.cooperativaId);
  const d = normalizeCnpj(coop?.cnpj ?? "");
  return d.length === 14 ? d : undefined;
}

export function notaPertenceCooperativa(data: AppData, nota: NotaPedido, coopId?: string): boolean {
  if (!coopId) return true;
  if (nota.cooperativaId === coopId) return true;
  const cnpjLocal = data.cooperativas.find((c) => c.id === coopId)?.cnpj;
  if (!cnpjLocal) return false;
  const notaCnpj = getNotaCooperativaCnpj(data, nota);
  return Boolean(notaCnpj && normalizeCnpj(notaCnpj) === normalizeCnpj(cnpjLocal));
}

/** Remove fotos grandes já enviadas ou arquivadas — libera espaço no navegador. */
export function compactarFotosNoArmazenamento(data: AppData): AppData {
  let changed = false;
  const notasPedido = data.notasPedido.map((n) => {
    const arquivada = n.status === "conferida" || n.status === "pago" || n.status === "rejeitada";
    if (arquivada && n.fotoPedido) {
      changed = true;
      return { ...n, fotoPedido: undefined };
    }
    if (n.fotoNaNuvem && n.fotoPedido) {
      changed = true;
      return { ...n, fotoPedido: undefined };
    }
    return n;
  });
  return changed ? { ...data, notasPedido } : data;
}

/** Comparação exata do conteúdo da imagem (base64). */
export function isFotoDuplicada(
  dataUrl: string,
  fotosSessao: string[],
  notasCooperado: NotaPedido[] = []
): boolean {
  if (fotosSessao.includes(dataUrl)) return true;
  return notasCooperado.some((n) => {
    const ref = getFotoExibicaoNota(n) ?? n.fotoPedido;
    return ref === dataUrl;
  });
}

export function contarFotosUnicas(notas: NotaPedido[], cooperadoId: string, mesReferencia: string): number {
  return notas.filter(
    (n) =>
      n.cooperadoId === cooperadoId &&
      n.mesReferencia === mesReferencia &&
      (n.fotoPedido || n.fotoPedidoMiniatura || n.fotoNaNuvem) &&
      n.status !== "cancelado"
  ).length;
}
