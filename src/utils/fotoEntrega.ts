import type { NotaPedido } from "@/types";

/** Comparação exata do conteúdo da imagem (base64). */
export function isFotoDuplicada(
  dataUrl: string,
  fotosSessao: string[],
  notasCooperado: NotaPedido[] = []
): boolean {
  if (fotosSessao.includes(dataUrl)) return true;
  return notasCooperado.some((n) => n.fotoPedido === dataUrl);
}

export function contarFotosUnicas(notas: NotaPedido[], cooperadoId: string, mesReferencia: string): number {
  return notas.filter(
    (n) =>
      n.cooperadoId === cooperadoId &&
      n.mesReferencia === mesReferencia &&
      n.fotoPedido &&
      n.status !== "cancelado"
  ).length;
}
