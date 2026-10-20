/**
 * Catálogo de preços no PWA cooperado (mensageiro).
 * A aba Preços não assina AppData ao vivo — lê este snapshot ou um getData() pontual.
 */
import type { AppData, User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import {
  getInstituicoesCatalogo,
  getTodosProdutosCatalogo,
} from "@/services/catalogoContratosService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

export const COOPERADO_PWA_PRECOS_SNAPSHOT_VERSION = 1;

export type CooperadoPwaPrecoItem = {
  id: string;
  instituicaoId: string;
  instituicaoNome: string;
  nome: string;
  unidade: string;
  precoUnitario: number;
  createdAt: string;
};

export type CooperadoPwaPrecosCatalogoView = {
  instituicoes: { id: string; nome: string }[];
  itens: CooperadoPwaPrecoItem[];
};

export type CooperadoPwaPrecosCatalogoSnapshot = {
  v: number;
  appBuild: number;
  savedAt: string;
  view: CooperadoPwaPrecosCatalogoView;
};

function storageKey(cooperativaId: string): string {
  return `hb.coop.pwaPrecosCatalogo.v${COOPERADO_PWA_PRECOS_SNAPSHOT_VERSION}:${cooperativaId}`;
}

export function emptyCooperadoPwaPrecosCatalogoView(): CooperadoPwaPrecosCatalogoView {
  return { instituicoes: [], itens: [] };
}

export function buildCooperadoPwaPrecosCatalogoView(
  data: AppData,
  cooperativaId: string
): CooperadoPwaPrecosCatalogoView {
  const instituicoes = getInstituicoesCatalogo(data, cooperativaId).map((i) => ({
    id: i.id,
    nome: i.nome,
  }));
  const nomes = new Map(instituicoes.map((i) => [i.id, i.nome]));
  const itens = getTodosProdutosCatalogo(data, cooperativaId).map((p) => ({
    id: p.id,
    instituicaoId: p.instituicaoId,
    instituicaoNome: nomes.get(p.instituicaoId) ?? "",
    nome: p.nome,
    unidade: p.unidade,
    precoUnitario: p.precoUnitario,
    createdAt: p.createdAt,
  }));
  return { instituicoes, itens };
}

export function lerCooperadoPwaPrecosCatalogoSnapshot(
  cooperativaId: string
): CooperadoPwaPrecosCatalogoSnapshot | null {
  if (typeof localStorage === "undefined" || !cooperativaId) return null;
  try {
    const raw = localStorage.getItem(storageKey(cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPwaPrecosCatalogoSnapshot;
    if (parsed.v !== COOPERADO_PWA_PRECOS_SNAPSHOT_VERSION || !parsed.view) return null;
    if (!cooperadoPwaSnapshotBuildReadable(parsed.appBuild)) return null;
    if (!Array.isArray(parsed.view.instituicoes) || !Array.isArray(parsed.view.itens)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarCooperadoPwaPrecosCatalogoSnapshot(
  cooperativaId: string,
  payload: CooperadoPwaPrecosCatalogoSnapshot
): void {
  if (typeof localStorage === "undefined" || !cooperativaId) return;
  try {
    localStorage.setItem(storageKey(cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function persistirCooperadoPwaPrecosCatalogoSnapshot(
  cooperativaId: string,
  data?: AppData | null
): CooperadoPwaPrecosCatalogoSnapshot | null {
  const d = data ?? (isAppDataWarm() ? getData() : null);
  if (!d || !cooperativaId) return null;
  const payload: CooperadoPwaPrecosCatalogoSnapshot = {
    v: COOPERADO_PWA_PRECOS_SNAPSHOT_VERSION,
    appBuild: APP_BUILD_VERSION,
    savedAt: new Date().toISOString(),
    view: buildCooperadoPwaPrecosCatalogoView(d, cooperativaId),
  };
  gravarCooperadoPwaPrecosCatalogoSnapshot(cooperativaId, payload);
  return payload;
}

export function persistirCooperadoPwaPrecosCatalogoSnapshotFromUser(
  user: Omit<User, "password"> | null | undefined
): CooperadoPwaPrecosCatalogoSnapshot | null {
  if (!user || user.role !== "cooperado") return null;
  const d = isAppDataWarm() ? getData() : null;
  const coopId = (d ? getUserCooperativaId(user, d) : undefined) ?? user.cooperativaId;
  if (!coopId) return null;
  return persistirCooperadoPwaPrecosCatalogoSnapshot(coopId, d);
}

/** Primeiro o AppData quente; senão o snapshot do aparelho. Nunca devolve vazio se houver preço. */
export function lerCooperadoPrecosCatalogoLeitura(
  cooperativaId: string | undefined
): CooperadoPwaPrecosCatalogoView {
  if (!cooperativaId) return emptyCooperadoPwaPrecosCatalogoView();
  if (isAppDataWarm()) {
    return buildCooperadoPwaPrecosCatalogoView(getData(), cooperativaId);
  }
  return lerCooperadoPwaPrecosCatalogoSnapshot(cooperativaId)?.view ?? emptyCooperadoPwaPrecosCatalogoView();
}
