import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

/** Reduz tamanho da foto para caber no armazenamento e enviar à nuvem. */
export async function compressFotoFile(
  file: File,
  maxWidth = 960,
  quality = 0.62
): Promise<string> {
  if (typeof document === "undefined") {
    const raw = await readFileAsDataUrl(file);
    return compressDataUrl(raw, maxWidth, quality);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await compressImageFromUrl(objectUrl, maxWidth, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Miniatura para listas no aparelho do cooperado (poucos KB). */
export async function makeFotoThumbnail(
  dataUrl: string,
  maxWidth = 280,
  quality = 0.45
): Promise<string> {
  return compressDataUrl(dataUrl, maxWidth, quality);
}

function compressImageFromUrl(src: string, maxWidth: number, quality: number): Promise<string> {
  if (typeof document === "undefined") return Promise.resolve(src);

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
        img.src = "";
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL("image/jpeg", quality);
      canvas.width = 0;
      canvas.height = 0;
      img.src = "";
      resolve(out);
    };
    img.onerror = () => {
      img.src = "";
      resolve(src);
    };
    img.src = src;
  });
}

export async function compressDataUrl(
  dataUrl: string,
  maxWidth: number,
  quality: number
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  return compressImageFromUrl(dataUrl, maxWidth, quality);
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
export function getChaveGrupoConferencia(
  nota: NotaPedido,
  data: AppData,
  cooperativaId?: string
): string {
  const coopId = cooperativaId ?? nota.cooperativaId;
  const snapshot = nota.cooperadoNomeSnapshot?.trim();

  if (snapshot && coopId) {
    const nomeKey = normalizeNomeGrupo(snapshot);
    const byName = data.cooperados.find(
      (c) =>
        c.cooperativaId === coopId &&
        normalizeNomeGrupo(c.nomeCompleto) === nomeKey
    );
    if (byName) return `id:${byName.id}`;
    return `nome:${nomeKey}`;
  }

  const local = data.cooperados.find(
    (c) => c.id === nota.cooperadoId && (!coopId || c.cooperativaId === coopId)
  );
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
    const chave = getChaveGrupoConferencia(nota, data, cooperativaId);
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

/** Resolve a aba ativa da fila (evita grid vazio por chave desatualizada). */
export function resolverAbaConferenciaAtiva(
  grupos: GrupoConferenciaEntrega[],
  abaConferenciaKey: string,
  filtroCooperadoId?: string
): { chave: string; grupo: GrupoConferenciaEntrega | undefined } {
  if (grupos.length === 0) {
    return { chave: abaConferenciaKey, grupo: undefined };
  }
  if (abaConferenciaKey) {
    const direta = grupos.find((g) => g.chave === abaConferenciaKey);
    if (direta) return { chave: direta.chave, grupo: direta };
  }
  if (filtroCooperadoId) {
    const porId = grupos.find((g) => g.cooperadoId === filtroCooperadoId);
    if (porId) return { chave: porId.chave, grupo: porId };
  }
  return { chave: grupos[0].chave, grupo: grupos[0] };
}

export function notaPertenceGrupoConferencia(
  nota: NotaPedido,
  data: AppData,
  chave: string,
  cooperativaId?: string
): boolean {
  return getChaveGrupoConferencia(nota, data, cooperativaId) === chave;
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

/** Libera espaço no localStorage antes de gravar (comprovantes, fotos grandes, auditoria). */
export function liberarEspacoArmazenamento(data: AppData, nivel: 1 | 2 = 1): AppData {
  let next = compactarFotosNoArmazenamento(data);

  next = {
    ...next,
    mensalidades: next.mensalidades.map((m) =>
      m.comprovante && (m.status === "paga" || m.status === "aguardando_confirmacao")
        ? { ...m, comprovante: undefined }
        : m
    ),
    comunicados: next.comunicados.map((c) =>
      c.audioDataUrl ? { ...c, audioDataUrl: undefined } : c
    ),
  };

  if (nivel >= 2) {
    next = {
      ...next,
      auditLog: next.auditLog.slice(0, 40),
      notasPedido: next.notasPedido.map((n) => ({
        ...n,
        fotoPedido: undefined,
        fotosPedido: undefined,
      })),
    };
  }

  return next;
}

export function parametrosCompressaoFoto(qtdNaSessao: number): { maxWidth: number; quality: number } {
  if (qtdNaSessao >= 25) return { maxWidth: 420, quality: 0.38 };
  if (qtdNaSessao >= 20) return { maxWidth: 460, quality: 0.4 };
  if (qtdNaSessao >= 15) return { maxWidth: 500, quality: 0.42 };
  if (qtdNaSessao >= 10) return { maxWidth: 540, quality: 0.44 };
  if (qtdNaSessao >= 6) return { maxWidth: 600, quality: 0.46 };
  if (qtdNaSessao >= 3) return { maxWidth: 680, quality: 0.5 };
  return { maxWidth: 760, quality: 0.55 };
}

/** Comprime todas as fotos da sessão antes do envio (libera memória dos originais maiores). */
export async function recomprimirFotosSessao(fotos: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const { maxWidth, quality } = parametrosCompressaoFoto(fotos.length);
    out.push(await compressDataUrl(fotos[i], maxWidth, quality));
  }
  return out;
}

/** Gera miniaturas uma a uma — evita pico de memória no celular. */
export async function gerarMiniaturasSequencial(fotos: string[]): Promise<string[]> {
  const miniaturas: string[] = [];
  for (const foto of fotos) {
    miniaturas.push(await makeFotoThumbnail(foto, 240, 0.42));
  }
  return miniaturas;
}

/** Tamanho de cada lote legado (upload monolítico — preferir streaming). */
export const FOTOS_UPLOAD_LOTE = 2;

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

/** Quantidade de fotos enviadas em uma nota (várias fotos = 1 entrega). */
export function contarFotosEnviadasNota(nota: NotaPedido): number {
  const fotos = getFotosExibicaoNota(nota);
  if (fotos.length > 0) return fotos.length;
  if (nota.fotosPedido?.length) return nota.fotosPedido.length;
  if (nota.fotosEnviadasCount && nota.fotosEnviadasCount > 0) return nota.fotosEnviadasCount;
  if (nota.fotoNaNuvem || nota.fotoPedido || nota.fotoPedidoMiniatura || nota.fotoEnviadaEm) return 1;
  return 0;
}

export function contarFotosEnviadasNotas(notas: NotaPedido[]): number {
  return notas.reduce((total, nota) => total + contarFotosEnviadasNota(nota), 0);
}

/** Une metadados mais recentes com o conjunto de fotos mais completo (tabela vs storage). */
export function mergeNotaComFotos(a: NotaPedido, b: NotaPedido): NotaPedido {
  const aTime = new Date(a.updatedAt).getTime();
  const bTime = new Date(b.updatedAt).getTime();
  const meta = aTime >= bTime ? a : b;
  const other = meta === a ? b : a;

  const metaFotos = getFotosExibicaoNota(meta);
  const otherFotos = getFotosExibicaoNota(other);
  const rich = metaFotos.length >= otherFotos.length ? meta : other;
  const richFotos = getFotosExibicaoNota(rich);

  const fotosPedido =
    rich.fotosPedido?.length ? rich.fotosPedido : other.fotosPedido?.length ? other.fotosPedido : meta.fotosPedido;
  const fotosPedidoMiniaturas =
    rich.fotosPedidoMiniaturas?.length
      ? rich.fotosPedidoMiniaturas
      : other.fotosPedidoMiniaturas?.length
        ? other.fotosPedidoMiniaturas
        : meta.fotosPedidoMiniaturas;

  const countEsperado = Math.max(
    a.fotosEnviadasCount ?? metaFotos.length,
    b.fotosEnviadasCount ?? otherFotos.length,
    richFotos.length
  );

  return {
    ...meta,
    fotoPedido: rich.fotoPedido ?? fotosPedido?.[0] ?? meta.fotoPedido,
    fotosPedido,
    fotosPedidoMiniaturas,
    fotoPedidoMiniatura: rich.fotoPedidoMiniatura ?? fotosPedidoMiniaturas?.[0] ?? meta.fotoPedidoMiniatura,
    fotoNaNuvem: meta.fotoNaNuvem ?? rich.fotoNaNuvem ?? richFotos.length > 0,
    fotosEnviadasCount: countEsperado > 0 ? countEsperado : undefined,
  };
}
