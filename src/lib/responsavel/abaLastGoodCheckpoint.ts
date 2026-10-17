import type {
  AppData,
  ArquivoMensalCooperado,
  FichaCorrida,
  Instituicao,
  InstituicaoExcluida,
  LivroCaixaLancamento,
  PagamentoCooperadoRegistro,
  ProdutoInstituicao,
} from "@/types";

export type AbaLastGoodNome = "contratos" | "pagar";

export type ContratosLastGoodSlice = {
  instituicoes: Instituicao[];
  produtosInstituicao: ProdutoInstituicao[];
  instituicoesExcluidas: InstituicaoExcluida[];
};

export type PagarLastGoodSlice = {
  pagamentosCooperado: PagamentoCooperadoRegistro[];
  fichaCorrida: FichaCorrida[];
  livroCaixa: LivroCaixaLancamento[];
  arquivosMensais: ArquivoMensalCooperado[];
};

const STORAGE_PREFIX = "hb-aba-lkg-v1";
const AUTHORITATIVE_PUSH_TTL_MS = 60_000;
const authoritativeContratosPushAt = new Map<string, number>();

function storageKey(coopId: string, aba: AbaLastGoodNome): string {
  return `${STORAGE_PREFIX}:${aba}:${coopId}`;
}

function ts(iso?: string): number {
  const n = Date.parse(iso ?? "");
  return Number.isFinite(n) ? n : 0;
}

export function markContratosAuthoritativePush(coopId: string, at = Date.now()): void {
  if (!coopId) return;
  authoritativeContratosPushAt.set(coopId, at);
}

export function contratosAuthoritativePushRecente(
  coopId: string,
  now = Date.now(),
  windowMs = AUTHORITATIVE_PUSH_TTL_MS
): boolean {
  const marked = authoritativeContratosPushAt.get(coopId);
  return marked != null && now - marked < windowMs;
}

export function extractContratosSlice(data: AppData, coopId: string): ContratosLastGoodSlice {
  return {
    instituicoes: data.instituicoes.filter((i) => i.cooperativaId === coopId),
    produtosInstituicao: (data.produtosInstituicao ?? []).filter((p) => p.cooperativaId === coopId),
    instituicoesExcluidas: (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
  };
}

export function extractPagarSlice(data: AppData, coopId: string): PagarLastGoodSlice {
  return {
    pagamentosCooperado: (data.pagamentosCooperado ?? []).filter((p) => p.cooperativaId === coopId),
    fichaCorrida: (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === coopId),
    livroCaixa: (data.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId),
    arquivosMensais: (data.arquivosMensais ?? []).filter((a) => a.cooperativaId === coopId),
  };
}

export function contratosSliceValido(slice: ContratosLastGoodSlice): boolean {
  return slice.instituicoes.length > 0;
}

export function pagarSliceValido(slice: PagarLastGoodSlice): boolean {
  return slice.pagamentosCooperado.some((p) => p.status === "confirmado");
}

export function contarItensPublicadosSlice(slice: ContratosLastGoodSlice): number {
  return slice.produtosInstituicao.filter((p) => p.ativo && p.precoUnitario > 0).length;
}

export function idsPagamentosConfirmados(slice: PagarLastGoodSlice): string[] {
  return slice.pagamentosCooperado.filter((p) => p.status === "confirmado").map((p) => p.id);
}

export function contratosRegrediu(atual: ContratosLastGoodSlice, lastGood: ContratosLastGoodSlice): boolean {
  if (contarItensPublicadosSlice(atual) < contarItensPublicadosSlice(lastGood)) return true;
  const atuais = new Set(atual.instituicoes.map((i) => i.id));
  return lastGood.instituicoes.some((i) => !atuais.has(i.id));
}

export function pagarRegrediu(atual: PagarLastGoodSlice, lastGood: PagarLastGoodSlice): boolean {
  const atuais = new Set(idsPagamentosConfirmados(atual));
  return idsPagamentosConfirmados(lastGood).some((id) => !atuais.has(id));
}

function mergeById<T extends { id: string }>(current: T[], checkpoint: T[]): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of checkpoint) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTs = ts("updatedAt" in prev ? String((prev as { updatedAt?: string }).updatedAt) : undefined);
    const nextTs = ts("updatedAt" in item ? String((item as { updatedAt?: string }).updatedAt) : undefined);
    if (nextTs >= prevTs) map.set(item.id, item);
  }
  return [...map.values()];
}

export function applyContratosSlice(data: AppData, coopId: string, slice: ContratosLastGoodSlice): AppData {
  return {
    ...data,
    instituicoes: [
      ...data.instituicoes.filter((i) => i.cooperativaId !== coopId),
      ...mergeById(
        data.instituicoes.filter((i) => i.cooperativaId === coopId),
        slice.instituicoes
      ),
    ],
    produtosInstituicao: [
      ...(data.produtosInstituicao ?? []).filter((p) => p.cooperativaId !== coopId),
      ...mergeById(
        (data.produtosInstituicao ?? []).filter((p) => p.cooperativaId === coopId),
        slice.produtosInstituicao
      ).map((p) => {
        const saved = slice.produtosInstituicao.find((s) => s.id === p.id);
        if (saved?.ativo && saved.precoUnitario > 0 && !p.ativo) return saved;
        return p;
      }),
    ],
    instituicoesExcluidas: [
      ...(data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId !== coopId),
      ...mergeById(
        (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
        slice.instituicoesExcluidas
      ),
    ],
  };
}

export function applyPagarSlice(data: AppData, coopId: string, slice: PagarLastGoodSlice): AppData {
  const pagamentos = mergeById(
    (data.pagamentosCooperado ?? []).filter((p) => p.cooperativaId === coopId),
    slice.pagamentosCooperado
  ).map((p) => {
    const saved = slice.pagamentosCooperado.find((s) => s.id === p.id);
    if (saved?.status === "confirmado" && p.status !== "confirmado") return saved;
    return p;
  });
  const fichas = mergeById(
    (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === coopId),
    slice.fichaCorrida
  ).map((f) => {
    const saved = slice.fichaCorrida.find((s) => s.id === f.id);
    if (saved?.status === "pago" && f.status !== "pago") return saved;
    return f;
  });
  return {
    ...data,
    pagamentosCooperado: [
      ...(data.pagamentosCooperado ?? []).filter((p) => p.cooperativaId !== coopId),
      ...pagamentos,
    ],
    fichaCorrida: [
      ...(data.fichaCorrida ?? []).filter((f) => f.cooperativaId !== coopId),
      ...fichas,
    ],
    livroCaixa: [
      ...(data.livroCaixa ?? []).filter((l) => l.cooperativaId !== coopId),
      ...mergeById(
        (data.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId),
        slice.livroCaixa
      ),
    ],
    arquivosMensais: [
      ...(data.arquivosMensais ?? []).filter((a) => a.cooperativaId !== coopId),
      ...mergeById(
        (data.arquivosMensais ?? []).filter((a) => a.cooperativaId === coopId),
        slice.arquivosMensais
      ),
    ],
  };
}

export function restoreAbaLastGood(
  data: AppData,
  coopId: string,
  aba: AbaLastGoodNome,
  sliceOverride?: ContratosLastGoodSlice | PagarLastGoodSlice | null
): AppData | null {
  if (aba === "contratos") {
    const slice = (sliceOverride as ContratosLastGoodSlice | undefined) ?? readContratosSlice(coopId);
    if (!slice || !contratosSliceValido(slice)) return null;
    if (!contratosRegrediu(extractContratosSlice(data, coopId), slice) && !sliceOverride) {
      return applyContratosSlice(data, coopId, slice);
    }
    return applyContratosSlice(data, coopId, slice);
  }
  const slice = (sliceOverride as PagarLastGoodSlice | undefined) ?? readPagarSlice(coopId);
  if (!slice || !pagarSliceValido(slice)) return null;
  return applyPagarSlice(data, coopId, slice);
}

export function reaplicarAbaLastGoodSeRegrediu(
  data: AppData,
  coopId: string,
  aba: AbaLastGoodNome,
  lastGoodOverride?: ContratosLastGoodSlice | PagarLastGoodSlice | null
): AppData {
  if (aba === "contratos") {
    const lastGood = (lastGoodOverride as ContratosLastGoodSlice | undefined) ?? readContratosSlice(coopId);
    if (!lastGood || !contratosSliceValido(lastGood)) return data;
    if (!contratosRegrediu(extractContratosSlice(data, coopId), lastGood)) return data;
    return applyContratosSlice(data, coopId, lastGood);
  }
  const lastGood = (lastGoodOverride as PagarLastGoodSlice | undefined) ?? readPagarSlice(coopId);
  if (!lastGood || !pagarSliceValido(lastGood)) return data;
  if (!pagarRegrediu(extractPagarSlice(data, coopId), lastGood)) return data;
  return applyPagarSlice(data, coopId, lastGood);
}

export function saveAbaLastGoodFromData(data: AppData, coopId: string, aba: AbaLastGoodNome): boolean {
  if (!coopId) return false;
  if (aba === "contratos") {
    const slice = extractContratosSlice(data, coopId);
    if (!contratosSliceValido(slice)) return false;
    return writeSlice(coopId, aba, slice);
  }
  const slice = extractPagarSlice(data, coopId);
  if (!pagarSliceValido(slice)) return false;
  return writeSlice(coopId, aba, slice);
}

export function hasAbaLastGood(coopId: string, aba: AbaLastGoodNome): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(storageKey(coopId, aba)));
  } catch {
    return false;
  }
}

export function inferCoopIdComCheckpoint(data: AppData, aba: AbaLastGoodNome): string | undefined {
  for (const coop of data.cooperativas ?? []) {
    if (hasAbaLastGood(coop.id, aba)) return coop.id;
  }
  return undefined;
}

function readContratosSlice(coopId: string): ContratosLastGoodSlice | null {
  return readSlice<ContratosLastGoodSlice>(coopId, "contratos");
}

function readPagarSlice(coopId: string): PagarLastGoodSlice | null {
  return readSlice<PagarLastGoodSlice>(coopId, "pagar");
}

function readSlice<T>(coopId: string, aba: AbaLastGoodNome): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(coopId, aba));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSlice(coopId: string, aba: AbaLastGoodNome, slice: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey(coopId, aba), JSON.stringify(slice));
    return true;
  } catch {
    return false;
  }
}
