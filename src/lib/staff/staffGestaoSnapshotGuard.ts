/**
 * O responsável nunca pode persistir um snapshot pior que o lastro já visto
 * (cache limpo / pull operacional / pós-processar).
 */
import type { AppData } from "@/types";
import { stripBinaryForPersist } from "@/utils/fotoEntrega";

export type StaffGestaoRiqueza = {
  cooperados: number;
  notas: number;
  fichas: number;
  pix: number;
  livro: number;
  pixLivro: number;
};

let lastGood: AppData | null = null;

const STAFF_GESTAO_LKG_SESSION_KEY = "hb-staff-gestao-lkg-v1";
const STAFF_GESTAO_LKG_MAX_CHARS = 4_500_000;
let persistLkgTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideBound = false;

function persistLastGoodToSessionNow(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    const slim = stripBinaryForPersist(data, { role: "responsavel" });
    const json = JSON.stringify(slim);
    if (json.length > STAFF_GESTAO_LKG_MAX_CHARS) return;
    sessionStorage.setItem(STAFF_GESTAO_LKG_SESSION_KEY, json);
  } catch {
    /* quota / private */
  }
}

function persistLastGoodToSession(data: AppData): void {
  if (typeof window === "undefined") return;
  bindStaffGestaoLkgPagehide();
  if (persistLkgTimer) clearTimeout(persistLkgTimer);
  persistLkgTimer = setTimeout(() => {
    persistLkgTimer = null;
    persistLastGoodToSessionNow(data);
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
    if (lastGood) persistLastGoodToSessionNow(lastGood);
  };
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}

function readLastGoodFromSession(): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STAFF_GESTAO_LKG_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || typeof parsed !== "object") return null;
    if (staffGestaoRiquezaTotal(medirRiquezaStaffGestao(parsed)) <= 0) return null;
    return parsed;
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
  if (prev.livro > 0 && next.livro === 0 && next.pix <= prev.pix) return true;
  if (prev.pixLivro > 0 && next.pixLivro < prev.pixLivro && next.pix <= prev.pix) return true;
  if (prev.fichas >= 10 && next.fichas < Math.floor(prev.fichas / 2) && next.pix <= prev.pix) {
    return true;
  }
  if (prev.notas >= 10 && next.notas < Math.floor(prev.notas / 2)) return true;
  return false;
}

export function noteStaffGestaoLastGood(data: AppData | null | undefined): void {
  if (!data) return;
  const next = medirRiquezaStaffGestao(data);
  if (staffGestaoRiquezaTotal(next) <= 0) return;
  if (lastGood && staffGestaoSnapshotPoorer(next, medirRiquezaStaffGestao(lastGood))) return;
  lastGood = data;
  persistLastGoodToSession(data);
}

export function peekStaffGestaoLastGood(): AppData | null {
  if (lastGood) return lastGood;
  const stored = readLastGoodFromSession();
  if (stored) lastGood = stored;
  return lastGood;
}

/** Somente testes. */
export function resetStaffGestaoSnapshotGuardForTests(): void {
  lastGood = null;
  if (persistLkgTimer) {
    clearTimeout(persistLkgTimer);
    persistLkgTimer = null;
  }
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STAFF_GESTAO_LKG_SESSION_KEY);
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

/**
 * Se o incoming zera o que o lastro já tinha, mantém o lastro e só acrescenta
 * PIX/livro/fichas novos — nunca grava responsável vazio.
 */
export function preservarStaffGestaoContraWipe(
  baseline: AppData | null | undefined,
  incoming: AppData
): AppData {
  const lastro = baseline && staffGestaoRiquezaTotal(medirRiquezaStaffGestao(baseline)) > 0
    ? baseline
    : lastGood;
  if (!lastro) {
    noteStaffGestaoLastGood(incoming);
    return incoming;
  }
  if (!staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(incoming), medirRiquezaStaffGestao(lastro))) {
    noteStaffGestaoLastGood(incoming);
    return incoming;
  }

  const kept: AppData = {
    ...incoming,
    cooperados: uniaoPorId(lastro.cooperados ?? [], incoming.cooperados ?? []),
    notasPedido: uniaoPorId(lastro.notasPedido ?? [], incoming.notasPedido ?? []),
    fichaCorrida: uniaoPorId(lastro.fichaCorrida ?? [], incoming.fichaCorrida ?? []),
    pagamentosCooperado: uniaoPorId(
      lastro.pagamentosCooperado ?? [],
      incoming.pagamentosCooperado ?? []
    ),
    livroCaixa: uniaoPorId(lastro.livroCaixa ?? [], incoming.livroCaixa ?? []),
  };
  noteStaffGestaoLastGood(kept);
  return kept;
}
