/**
 * O responsável nunca pode persistir um snapshot pior que o lastro já visto
 * (cache limpo / pull operacional / pós-processar).
 * Lastro é por CNPJ — uma cooperativa não herda o painel de outra no mesmo aparelho.
 */
import type { AppData } from "@/types";
import { stripBinaryForPersist } from "@/utils/fotoEntrega";
import { normalizeCnpj } from "@/utils/cooperativa";

export type StaffGestaoRiqueza = {
  cooperados: number;
  notas: number;
  fichas: number;
  pix: number;
  livro: number;
  pixLivro: number;
};

const lastGoodByCnpj = new Map<string, AppData>();

const STAFF_GESTAO_LKG_SESSION_KEY = "hb-staff-gestao-lkg-v1";
const STAFF_GESTAO_LKG_MAX_CHARS = 4_500_000;
let persistLkgTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideBound = false;

function staffLkgSessionKey(cnpj: string): string {
  return `${STAFF_GESTAO_LKG_SESSION_KEY}:${cnpj}`;
}

function readStaffSessionHint(): { role?: string; cnpj: string; cooperativaId?: string } {
  if (typeof window === "undefined") return { cnpj: "" };
  try {
    const raw = localStorage.getItem("coopeagriplla_session");
    if (!raw) return { cnpj: "" };
    const parsed = JSON.parse(raw) as {
      role?: string;
      cooperativaCnpj?: string;
      cooperativaId?: string;
    };
    return {
      role: parsed.role,
      cnpj: normalizeCnpj(parsed.cooperativaCnpj ?? ""),
      cooperativaId: parsed.cooperativaId,
    };
  } catch {
    return { cnpj: "" };
  }
}

function sessionLooksStaffGestao(role?: string): boolean {
  return role === "responsavel" || role === "tesoureiro" || role === "admin";
}

export function primaryStaffGestaoCnpjFromData(data: AppData | null | undefined): string {
  if (!data) return "";
  const ranked = (data.cooperativas ?? [])
    .map((c) => {
      const digits = normalizeCnpj(String(c.cnpj ?? ""));
      if (digits.length !== 14) return null;
      const notas = (data.notasPedido ?? []).filter((n) => n.cooperativaId === c.id).length;
      const fichas = (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === c.id).length;
      return { digits, score: notas + fichas };
    })
    .filter((x): x is { digits: string; score: number } => Boolean(x));
  if (ranked.length === 0) return "";
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].digits;
}

function resolveStaffGestaoCnpj(data?: AppData | null, explicit?: string): string {
  const fromArg = normalizeCnpj(explicit ?? "");
  if (fromArg.length === 14) return fromArg;
  const session = readStaffSessionHint();
  if (session.cnpj.length === 14) return session.cnpj;
  const fromData = primaryStaffGestaoCnpjFromData(data ?? null);
  if (fromData.length === 14) return fromData;
  return "";
}

function persistLastGoodToSessionNow(cnpj: string, data: AppData): void {
  if (typeof window === "undefined" || cnpj.length !== 14) return;
  try {
    const slim = stripBinaryForPersist(data, { role: "responsavel" });
    const json = JSON.stringify(slim);
    if (json.length > STAFF_GESTAO_LKG_MAX_CHARS) return;
    const key = staffLkgSessionKey(cnpj);
    sessionStorage.setItem(key, json);
    try {
      localStorage.setItem(key, json);
    } catch {
      /* quota / private — session ainda vale nesta aba */
    }
  } catch {
    /* quota / private */
  }
}

function persistLastGoodToSession(cnpj: string, data: AppData): void {
  if (typeof window === "undefined" || cnpj.length !== 14) return;
  bindStaffGestaoLkgPagehide();
  if (persistLkgTimer) clearTimeout(persistLkgTimer);
  persistLkgTimer = setTimeout(() => {
    persistLkgTimer = null;
    persistLastGoodToSessionNow(cnpj, data);
  }, 80);
}

function bindStaffGestaoLkgPagehide(): void {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  const flush = () => {
    if (persistLkgTimer) {
      clearTimeout(persistLkgTimer);
      persistLkgTimer = null;
    }
    for (const [cnpj, data] of lastGoodByCnpj) {
      persistLastGoodToSessionNow(cnpj, data);
    }
  };
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}

function parseStaffLastGoodJson(raw: string | null, cnpj: string): AppData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || typeof parsed !== "object") return null;
    if (staffGestaoRiquezaTotal(medirRiquezaStaffGestao(parsed)) <= 0) return null;
    const owner = primaryStaffGestaoCnpjFromData(parsed);
    if (owner && owner !== cnpj) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readLastGoodFromSession(cnpj: string): AppData | null {
  if (typeof window === "undefined" || cnpj.length !== 14) return null;
  const key = staffLkgSessionKey(cnpj);
  const fromSession = parseStaffLastGoodJson(sessionStorage.getItem(key), cnpj);
  if (fromSession) return fromSession;
  try {
    const fromLocal = parseStaffLastGoodJson(localStorage.getItem(key), cnpj);
    if (fromLocal) {
      try {
        sessionStorage.setItem(key, JSON.stringify(fromLocal));
      } catch {
        /* quota */
      }
      return fromLocal;
    }
  } catch {
    /* private */
  }
  return migrateLegacyLastGoodIfMatches(cnpj);
}

/** Lastro antigo (sem CNPJ) só vale se for da cooperativa da sessão. */
function adoptLegacyLastGoodFromStore(store: Storage, cnpj: string): AppData | null {
  try {
    const raw = store.getItem(STAFF_GESTAO_LKG_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || typeof parsed !== "object") return null;
    const owner = primaryStaffGestaoCnpjFromData(parsed);
    if (owner && owner !== cnpj) return null;
    if (!owner && staffGestaoRiquezaTotal(medirRiquezaStaffGestao(parsed)) > 0) {
      /* lastro sem cadastro de CNPJ — não aplicar em tenant novo */
      return null;
    }
    if (staffGestaoRiquezaTotal(medirRiquezaStaffGestao(parsed)) <= 0) return null;
    persistLastGoodToSessionNow(cnpj, parsed);
    store.removeItem(STAFF_GESTAO_LKG_SESSION_KEY);
    return parsed;
  } catch {
    return null;
  }
}

function migrateLegacyLastGoodIfMatches(cnpj: string): AppData | null {
  if (typeof window === "undefined" || cnpj.length !== 14) return null;
  const fromSession = adoptLegacyLastGoodFromStore(sessionStorage, cnpj);
  if (fromSession) return fromSession;
  try {
    return adoptLegacyLastGoodFromStore(localStorage, cnpj);
  } catch {
    return null;
  }
}

function pertenceCoop<T extends { cooperativaId?: string }>(item: T, coopId?: string): boolean {
  return !coopId || item.cooperativaId === coopId;
}

export function medirRiquezaStaffGestao(
  data: AppData | null | undefined,
  coopId?: string
): StaffGestaoRiqueza {
  if (!data) return { cooperados: 0, notas: 0, fichas: 0, pix: 0, livro: 0, pixLivro: 0 };
  const pixIds = new Set(
    (data.pagamentosCooperado ?? [])
      .filter((p) => pertenceCoop(p, coopId) && p.status === "confirmado")
      .map((p) => p.id)
  );
  const livroCoop = (data.livroCaixa ?? []).filter((l) => pertenceCoop(l, coopId));
  return {
    cooperados: (data.cooperados ?? []).filter((c) => pertenceCoop(c, coopId)).length,
    notas: (data.notasPedido ?? []).filter((n) => pertenceCoop(n, coopId)).length,
    fichas: (data.fichaCorrida ?? []).filter((f) => pertenceCoop(f, coopId)).length,
    pix: (data.pagamentosCooperado ?? []).filter(
      (p) =>
        pertenceCoop(p, coopId) &&
        (p.status === "confirmado" || p.status === "aguardando_confirmacao")
    ).length,
    livro: livroCoop.length,
    pixLivro: livroCoop.filter((l) => {
      const origem = l.origemId ?? "";
      return origem.startsWith("pg_caixa_") && pixIds.has(origem.slice("pg_caixa_".length));
    }).length,
  };
}

export function staffGestaoRiquezaTotal(r: StaffGestaoRiqueza): number {
  return r.cooperados + r.notas + r.fichas + r.pix + r.livro;
}

/** Próximo estado apaga cadastro, notas, fichas, PIX ou livro que já existiam. */
export function staffGestaoSnapshotPoorer(
  next: StaffGestaoRiqueza,
  prev: StaffGestaoRiqueza
): boolean {
  if (prev.cooperados > 0 && next.cooperados === 0) return true;
  if (prev.notas > 0 && next.notas === 0) return true;
  if (prev.fichas > 0 && next.fichas === 0) return true;
  if (prev.pix > 0 && next.pix === 0) return true;
  if (prev.livro > 0 && next.livro < prev.livro) return true;
  if (prev.pixLivro > 0 && next.pixLivro < prev.pixLivro && next.pix <= prev.pix) return true;
  if (prev.fichas >= 10 && next.fichas < Math.floor(prev.fichas / 2) && next.pix <= prev.pix) {
    return true;
  }
  if (prev.notas >= 10 && next.notas < Math.floor(prev.notas / 2)) return true;
  return false;
}

function coopIdForCnpj(data: AppData | null | undefined, cnpj: string): string | undefined {
  if (!data || cnpj.length !== 14) return undefined;
  return data.cooperativas.find((c) => normalizeCnpj(String(c.cnpj ?? "")) === cnpj)?.id;
}

export function noteStaffGestaoLastGood(data: AppData | null | undefined, cnpjHint?: string): void {
  if (!data) return;
  const session = readStaffSessionHint();
  if (session.role && !sessionLooksStaffGestao(session.role)) return;
  const cnpj = resolveStaffGestaoCnpj(data, cnpjHint);
  if (cnpj.length !== 14) {
    /* sem CNPJ não grava lastro global — evita vazar para outra cooperativa */
    return;
  }
  const coopId = coopIdForCnpj(data, cnpj);
  const next = medirRiquezaStaffGestao(data, coopId);
  if (staffGestaoRiquezaTotal(next) <= 0) return;
  const prev = lastGoodByCnpj.get(cnpj);
  if (prev && staffGestaoSnapshotPoorer(next, medirRiquezaStaffGestao(prev, coopId))) return;
  lastGoodByCnpj.set(cnpj, data);
  persistLastGoodToSession(cnpj, data);
}

export function peekStaffGestaoLastGood(cnpjHint?: string): AppData | null {
  const session = readStaffSessionHint();
  if (session.role && !sessionLooksStaffGestao(session.role)) return null;
  const cnpj = resolveStaffGestaoCnpj(null, cnpjHint);
  if (cnpj.length !== 14) return null;
  const mem = lastGoodByCnpj.get(cnpj);
  if (mem) return mem;
  const stored = readLastGoodFromSession(cnpj);
  if (stored) lastGoodByCnpj.set(cnpj, stored);
  return lastGoodByCnpj.get(cnpj) ?? null;
}

/** Somente testes. */
export function resetStaffGestaoSnapshotGuardForTests(): void {
  lastGoodByCnpj.clear();
  if (persistLkgTimer) {
    clearTimeout(persistLkgTimer);
    persistLkgTimer = null;
  }
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STAFF_GESTAO_LKG_SESSION_KEY);
    const prefix = `${STAFF_GESTAO_LKG_SESSION_KEY}:`;
    const clearStore = (store: Storage) => {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(prefix) || key === STAFF_GESTAO_LKG_SESSION_KEY) toRemove.push(key);
      }
      for (const key of toRemove) store.removeItem(key);
    };
    clearStore(sessionStorage);
    try {
      clearStore(localStorage);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

function uniaoPorId<T extends { id: string }>(prefer: T[], extra: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of extra) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of prefer) {
    if (item?.id) map.set(item.id, item);
  }
  return [...map.values()];
}

function lastroMesmoTenant(lastro: AppData, incomingCnpj: string): boolean {
  if (incomingCnpj.length !== 14) return false;
  const owner = primaryStaffGestaoCnpjFromData(lastro);
  if (owner) return owner === incomingCnpj;
  return Boolean(lastro.cooperativas?.some((c) => normalizeCnpj(String(c.cnpj ?? "")) === incomingCnpj));
}

/**
 * Se o incoming zera o que o lastro já tinha, mantém o lastro e só acrescenta
 * PIX/livro/fichas novos — nunca grava responsável vazio.
 * Lastro de outro CNPJ é ignorado.
 */
export function preservarStaffGestaoContraWipe(
  baseline: AppData | null | undefined,
  incoming: AppData
): AppData {
  const incomingCnpj = resolveStaffGestaoCnpj(incoming);
  const scopedPeek = incomingCnpj.length === 14 ? lastGoodByCnpj.get(incomingCnpj) : undefined;
  const baselineOk =
    baseline &&
    staffGestaoRiquezaTotal(medirRiquezaStaffGestao(baseline)) > 0 &&
    (incomingCnpj.length !== 14 || lastroMesmoTenant(baseline, incomingCnpj));
  const lastro = baselineOk ? baseline : scopedPeek;
  if (!lastro) {
    noteStaffGestaoLastGood(incoming, incomingCnpj);
    return incoming;
  }
  if (incomingCnpj.length === 14 && !lastroMesmoTenant(lastro, incomingCnpj)) {
    noteStaffGestaoLastGood(incoming, incomingCnpj);
    return incoming;
  }

  const coopId = incomingCnpj ? coopIdForCnpj(lastro, incomingCnpj) ?? coopIdForCnpj(incoming, incomingCnpj) : undefined;
  const excluidosLivro = new Set(
    [...(lastro.livroCaixaExcluidos ?? []), ...(incoming.livroCaixaExcluidos ?? [])].map((e) => e.id)
  );
  const livroUnido = uniaoPorId(lastro.livroCaixa ?? [], incoming.livroCaixa ?? []).filter(
    (l) => !excluidosLivro.has(l.id)
  );
  const origensUnidas = uniaoPorId(
    lastro.livroCaixaOrigensCadastro ?? [],
    incoming.livroCaixaOrigensCadastro ?? []
  );
  const comLivroLastro: AppData = {
    ...incoming,
    livroCaixa: livroUnido,
    livroCaixaOrigensCadastro: origensUnidas,
  };

  if (!staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(incoming, coopId), medirRiquezaStaffGestao(lastro, coopId))) {
    noteStaffGestaoLastGood(comLivroLastro, incomingCnpj);
    return comLivroLastro;
  }

  const kept: AppData = {
    ...comLivroLastro,
    cooperados: uniaoPorId(lastro.cooperados ?? [], incoming.cooperados ?? []),
    notasPedido: uniaoPorId(lastro.notasPedido ?? [], incoming.notasPedido ?? []),
    fichaCorrida: uniaoPorId(lastro.fichaCorrida ?? [], incoming.fichaCorrida ?? []),
    pagamentosCooperado: uniaoPorId(
      lastro.pagamentosCooperado ?? [],
      incoming.pagamentosCooperado ?? []
    ),
  };
  noteStaffGestaoLastGood(kept, incomingCnpj);
  return kept;
}
