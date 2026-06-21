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
  if (nota.fotoPedido) return nota.fotoPedido;
  if (nota.fotosPedido?.length) return nota.fotosPedido[0];
  if (nota.fotoPedidoMiniatura) return nota.fotoPedidoMiniatura;
  if (nota.fotosPedidoMiniaturas?.length) return nota.fotosPedidoMiniaturas[0];
  return undefined;
}

export function getFotosExibicaoNota(nota: NotaPedido): string[] {
  if (nota.fotosPedido?.length) {
    return nota.fotosPedido
      .map((f, i) => f ?? nota.fotosPedidoMiniaturas?.[i])
      .filter((f): f is string => !!f);
  }
  if (nota.fotosPedidoMiniaturas?.length) return nota.fotosPedidoMiniaturas;
  const single = getFotoExibicaoNota(nota);
  return single ? [single] : [];
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

export interface GrupoConferenciaEntrega {
  chave: string;
  cooperadoId: string;
  nome: string;
  notas: NotaPedido[];
}

function normalizeNomeGrupo(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Agrupa entregas pendentes pelo cooperado (nome salvo na nuvem ou cadastro local). */
export function getChaveGrupoConferencia(nota: NotaPedido, data: AppData): string {
  const snapshot = nota.cooperadoNomeSnapshot?.trim();
  if (snapshot) return `nome:${normalizeNomeGrupo(snapshot)}`;

  const local = data.cooperados.find((c) => c.id === nota.cooperadoId);
  if (local) return `id:${local.id}`;

  return `id:${nota.cooperadoId}`;
}

export function getNomeGrupoConferencia(notas: NotaPedido[], data: AppData): string {
  const first = notas[0];
  if (!first) return "Cooperado";
  const snapshot = first.cooperadoNomeSnapshot?.trim();
  if (snapshot) return snapshot;
  const nome = data.cooperados.find((c) => c.id === first.cooperadoId)?.nomeCompleto;
  return nome ?? "Cooperado";
}

export function resolverCooperadoIdDoGrupo(
  notas: NotaPedido[],
  data: AppData,
  cooperativaId?: string
): string {
  for (const nota of notas) {
    const c = data.cooperados.find(
      (x) => x.id === nota.cooperadoId && (!cooperativaId || x.cooperativaId === cooperativaId)
    );
    if (c) return c.id;
  }
  const snapshot = notas[0]?.cooperadoNomeSnapshot?.trim().toLowerCase();
  if (snapshot && cooperativaId) {
    const c = data.cooperados.find(
      (x) =>
        x.cooperativaId === cooperativaId &&
        x.nomeCompleto.trim().toLowerCase() === snapshot
    );
    if (c) return c.id;
  }
  return notas[0]?.cooperadoId ?? "";
}

export function agruparPendentesPorCooperado(
  data: AppData,
  pendentes: NotaPedido[],
  cooperativaId?: string
): GrupoConferenciaEntrega[] {
  const map = new Map<string, NotaPedido[]>();
  for (const nota of pendentes) {
    const chave = getChaveGrupoConferencia(nota, data);
    const lista = map.get(chave) ?? [];
    lista.push(nota);
    map.set(chave, lista);
  }
  return [...map.entries()]
    .map(([chave, notas]) => ({
      chave,
      cooperadoId: resolverCooperadoIdDoGrupo(notas, data, cooperativaId),
      nome: getNomeGrupoConferencia(notas, data),
      notas,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function notaPertenceGrupoConferencia(
  nota: NotaPedido,
  data: AppData,
  chave: string
): boolean {
  return getChaveGrupoConferencia(nota, data) === chave;
}

/** Remove fotos grandes já enviadas ou arquivadas — libera espaço no navegador. */
export function compactarFotosNoArmazenamento(data: AppData): AppData {
  let changed = false;
  const notasPedido = data.notasPedido.map((n) => {
    const arquivada = n.status === "conferida" || n.status === "pago" || n.status === "rejeitada";
    if (arquivada && (n.fotoPedido || n.fotosPedido?.length)) {
      changed = true;
      return { ...n, fotoPedido: undefined, fotosPedido: undefined };
    }
    if (n.fotoNaNuvem && (n.fotoPedido || n.fotosPedido?.length)) {
      changed = true;
      return { ...n, fotoPedido: undefined, fotosPedido: undefined };
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
    return getFotosExibicaoNota(n).includes(dataUrl);
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
