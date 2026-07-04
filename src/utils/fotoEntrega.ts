import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { isInlineDataUrl } from "@/utils/mediaHelpers";

/** Referência leve para foto no IndexedDB — não vai no JSON pesado. */
export const LOCAL_MEDIA_REF_PREFIX = "idb:";

export function isLocalMediaRef(value?: string): boolean {
  return typeof value === "string" && value.startsWith(LOCAL_MEDIA_REF_PREFIX);
}

export function buildLocalMediaRef(notaId: string, index: number): string {
  return `${LOCAL_MEDIA_REF_PREFIX}${notaId}#${index}`;
}

export function parseLocalMediaRef(ref: string): { notaId: string; index: number } | null {
  if (!isLocalMediaRef(ref)) return null;
  const body = ref.slice(LOCAL_MEDIA_REF_PREFIX.length);
  const hash = body.lastIndexOf("#");
  if (hash <= 0) return null;
  const notaId = body.slice(0, hash);
  const index = Number(body.slice(hash + 1));
  if (!notaId || Number.isNaN(index)) return null;
  return { notaId, index };
}

/** Reduz tamanho da foto para caber no armazenamento e enviar à nuvem. */
export async function compressFotoFile(
  file: File,
  maxWidth = 640,
  quality = 0.48
): Promise<string> {
  const blob = await compressFotoFileToBlob(file, maxWidth, quality);
  return blobToDataUrl(blob);
}

/** Comprime para Blob JPEG — evita base64 na memória (≈33% menor no celular). */
export async function compressFotoFileToBlob(
  file: File,
  maxWidth = 640,
  quality = 0.48
): Promise<Blob> {
  if (file.size > 24 * 1024 * 1024) {
    throw new Error("Arquivo muito grande. Use a câmera do app ou uma foto menor.");
  }
  if (typeof document === "undefined") {
    const raw = await readFileAsDataUrl(file);
    const dataUrl = await compressDataUrl(raw, maxWidth, quality);
    return dataUrlToBlob(dataUrl);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await compressImageUrlToBlob(objectUrl, maxWidth, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler foto comprimida."));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

/** Hash leve do arquivo original — sem carregar a imagem inteira na RAM. */
export async function fingerprintFotoFile(file: File): Promise<string> {
  const head = file.slice(0, 4096);
  const tail = file.size > 8192 ? file.slice(file.size - 4096) : file.slice(0);
  const [headBuf, tailBuf] = await Promise.all([head.arrayBuffer(), tail.arrayBuffer()]);
  let h = 2166136261;
  const mix = (buf: ArrayBuffer) => {
    const arr = new Uint8Array(buf);
    for (let i = 0; i < arr.length; i++) {
      h ^= arr[i];
      h = Math.imul(h, 16777619);
    }
  };
  mix(headBuf);
  mix(tailBuf);
  return `${file.size}-${file.lastModified}-${(h >>> 0).toString(36)}`;
}

function compressImageUrlToBlob(src: string, maxWidth: number, quality: number): Promise<Blob> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Canvas indisponível."));
  }

  return new Promise((resolve, reject) => {
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
        reject(new Error("Canvas indisponível."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      img.src = "";
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (blob) resolve(blob);
          else reject(new Error("Memória insuficiente para comprimir a foto."));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      img.src = "";
      reject(new Error("Falha ao ler a imagem."));
    };
    img.src = src;
  });
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
  const meta = nota.fotosMeta?.find((f) => f.url || f.thumbnailUrl);
  return meta?.url ?? meta?.thumbnailUrl;
}

export function getFotosExibicaoNota(nota: NotaPedido): string[] {
  const fromMeta = (nota.fotosMeta ?? [])
    .filter((f) => f.url || f.thumbnailUrl)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((f) => f.url ?? f.thumbnailUrl!)
    .filter(Boolean);
  if (fromMeta.length > 0) return fromMeta;

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
    const naNuvem = Boolean(n.fotoNaNuvem && (n.fotosEnviadasCount ?? 0) > 0);

    if (arquivada && (n.fotoPedido || n.fotosPedido?.length || n.fotosPedidoMiniaturas?.length)) {
      changed = true;
      return {
        ...n,
        fotoPedido: undefined,
        fotosPedido: undefined,
        fotoPedidoMiniatura: undefined,
        fotosPedidoMiniaturas: undefined,
        fotosMeta: n.fotosMeta?.map((f) => ({ ...f, url: undefined, thumbnailUrl: undefined })),
      };
    }
    if (naNuvem && (n.fotoPedido || n.fotosPedido?.length || n.fotosPedidoMiniaturas?.length)) {
      changed = true;
      return {
        ...n,
        fotoPedido: undefined,
        fotosPedido: undefined,
        fotoPedidoMiniatura: undefined,
        fotosPedidoMiniaturas: undefined,
        fotosMeta: n.fotosMeta?.map((f) => ({ ...f, url: undefined, thumbnailUrl: undefined })),
      };
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

/**
 * Remove binários pesados antes de gravar no localStorage.
 * Mantém fotos pendentes de envio (refs idb: ou base64); remove o que já está na nuvem.
 */
export function stripBinaryForPersist(data: AppData): AppData {
  let next = compactarFotosNoArmazenamento(data);

  const notasPedido = next.notasPedido.map((n) => {
    const uploaded = Boolean(n.fotoNaNuvem && (n.fotosEnviadasCount ?? 0) > 0);
    const archived = n.status === "conferida" || n.status === "pago" || n.status === "rejeitada";
    const hasCloudMeta = n.fotosMeta?.some(
      (f) => Boolean(f.storagePath) && f.status !== "local_pending"
    );

    if (uploaded || archived || hasCloudMeta) {
      return {
        ...n,
        fotoPedido: undefined,
        fotosPedido: undefined,
        fotoPedidoMiniatura: undefined,
        fotosPedidoMiniaturas: undefined,
        fotosMeta: n.fotosMeta?.map((f) => ({
          ...f,
          url: isInlineDataUrl(f.url) ? undefined : f.url,
          thumbnailUrl: isInlineDataUrl(f.thumbnailUrl) ? undefined : f.thumbnailUrl,
        })),
      };
    }

    const keepRef = (v?: string) => (v && isLocalMediaRef(v) ? v : undefined);

    const fotosPedido = n.fotosPedido
      ?.map((f) => (isLocalMediaRef(f) ? f : undefined))
      .filter((f): f is string => !!f);

    if (fotosPedido?.length || keepRef(n.fotoPedido)) {
      return {
        ...n,
        fotoPedido: keepRef(n.fotoPedido) ?? fotosPedido?.[0],
        fotosPedido: fotosPedido?.length ? fotosPedido : undefined,
        fotoPedidoMiniatura: undefined,
        fotosPedidoMiniaturas: undefined,
        fotosMeta: n.fotosMeta?.map((f) => ({
          ...f,
          thumbnailUrl: isInlineDataUrl(f.thumbnailUrl) ? undefined : f.thumbnailUrl,
        })),
      };
    }

    if (n.fotoPedidoMiniatura || n.fotosPedidoMiniaturas?.length) {
      return {
        ...n,
        fotoPedidoMiniatura: undefined,
        fotosPedidoMiniaturas: undefined,
        fotosMeta: n.fotosMeta?.map((f) => ({
          ...f,
          thumbnailUrl: isInlineDataUrl(f.thumbnailUrl) ? undefined : f.thumbnailUrl,
        })),
      };
    }

    return n;
  });

  return {
    ...next,
    notasPedido,
    mensalidades: next.mensalidades.map((m) =>
      m.comprovante && (m.status === "paga" || m.status === "aguardando_confirmacao")
        ? { ...m, comprovante: undefined }
        : m
    ),
    comunicados: next.comunicados.map((c) =>
      c.audioDataUrl ? { ...c, audioDataUrl: undefined } : c
    ),
  };
}

export function parametrosCompressaoFoto(_qtdNaSessao: number): { maxWidth: number; quality: number } {
  /** Mesma compressão sempre — sem limite de quantidade; leve para celular. */
  return { maxWidth: 640, quality: 0.48 };
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

/** Máximo de fotos por entrega antes de enviar ao responsável (evita falhas no celular). */
export const MAX_FOTOS_POR_SESSAO_ENTREGA = 8;

/** A partir desta quantidade, avisa que o limite da sessão está próximo. */
export const AVISO_FOTOS_SESSAO_EM = 6;

export function fotosSessaoAtingiuLimite(count: number): boolean {
  return count >= MAX_FOTOS_POR_SESSAO_ENTREGA;
}

export function fotosRestantesNaSessao(count: number): number {
  return Math.max(0, MAX_FOTOS_POR_SESSAO_ENTREGA - count);
}

export function mensagemLimiteFotosSessao(): string {
  return `Limite de ${MAX_FOTOS_POR_SESSAO_ENTREGA} fotos por entrega. Envie ao responsável e depois inicie outra entrega para tirar mais fotos.`;
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

/** Quantidade de fotos enviadas em uma nota (várias fotos = 1 entrega). */
export function contarFotosEnviadasNota(nota: NotaPedido): number {
  const declarado = nota.fotosEnviadasCount ?? 0;
  const exibidas = getFotosExibicaoNota(nota).length;
  const noArray = nota.fotosPedido?.length ?? 0;
  const total = Math.max(declarado, exibidas, noArray);
  if (total > 0) return total;
  if (nota.fotoNaNuvem || nota.fotoPedido || nota.fotoPedidoMiniatura || nota.fotoEnviadaEm) return 1;
  return 0;
}

export function contarFotosEnviadasNotas(notas: NotaPedido[]): number {
  return notas.reduce((total, nota) => total + contarFotosEnviadasNota(nota), 0);
}

const NOTA_STATUS_RANK: Record<NotaPedido["status"], number> = {
  rascunho: 0,
  aguardando_conferencia: 1,
  rejeitada: 1,
  entregue: 2,
  conferida: 2,
  pago: 3,
  cancelado: 3,
};

/** Status publicado na nuvem nunca perde para rascunho (upload de foto atualiza JSON antes do Enviar). */
function mergeNotaStatus(a: NotaPedido, b: NotaPedido): NotaPedido["status"] {
  const aRank = NOTA_STATUS_RANK[a.status] ?? 0;
  const bRank = NOTA_STATUS_RANK[b.status] ?? 0;
  if (aRank > bRank) return a.status;
  if (bRank > aRank) return b.status;
  return new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a.status : b.status;
}

/** Une metadados mais recentes com o conjunto de fotos mais completo (tabela vs storage). */
export function mergeNotaComFotos(a: NotaPedido, b: NotaPedido): NotaPedido {
  const aTime = new Date(a.updatedAt).getTime();
  const bTime = new Date(b.updatedAt).getTime();
  const meta = aTime >= bTime ? a : b;
  const other = meta === a ? b : a;
  const status = mergeNotaStatus(a, b);

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
    status,
    fotoPedido: rich.fotoPedido ?? fotosPedido?.[0] ?? meta.fotoPedido,
    fotosPedido,
    fotosPedidoMiniaturas,
    fotoPedidoMiniatura: rich.fotoPedidoMiniatura ?? fotosPedidoMiniaturas?.[0] ?? meta.fotoPedidoMiniatura,
    fotoNaNuvem: meta.fotoNaNuvem ?? rich.fotoNaNuvem ?? richFotos.length > 0,
    fotosEnviadasCount: countEsperado > 0 ? countEsperado : undefined,
  };
}
