/**
 * Cache local do card “A receber” — exibição instantânea ao abrir o app (antes do sync).
 */
import type { InicioCardMotorSnapshot } from "@/lib/cooperado/cooperadoInicioCardMotorTypes";
import { cooperadoUsarFluxoReciboAssinaturaNaUi } from "@/lib/bic/cooperadoBicCentralUi";

function persistidoTemObrigacaoReceber(display: InicioCardMotorSnapshot): boolean {
  if (display.valor > 0) return true;
  if (
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    display.aguardandoAssinatura &&
    display.valorRecibo > 0
  ) {
    return true;
  }
  return false;
}
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";

export const INICIO_CARD_STORAGE_VERSION = 8;

export type InicioCardPersistido = {
  v: number;
  /** Build do app quando o cache foi gravado — invalida snapshot de versão anterior no mobile/PWA. */
  appBuild: number;
  motorRevision: string;
  display: InicioCardMotorSnapshot;
  savedAt: string;
};

export function inicioCardStorageKey(cooperadoId: string, cooperativaId: string): string {
  return `hb.coop.inicioCard.v${INICIO_CARD_STORAGE_VERSION}:${cooperativaId}:${cooperadoId}`;
}

export function lerInicioCardPersistido(
  cooperadoId: string,
  cooperativaId: string
): InicioCardPersistido | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(inicioCardStorageKey(cooperadoId, cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InicioCardPersistido;
    if (parsed.v !== INICIO_CARD_STORAGE_VERSION || !parsed.display) return null;
    if (!cooperadoPwaSnapshotBuildReadable(parsed.appBuild)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Lê cache mesmo se cooperativaId ainda não veio do sync (match por sufixo do cooperado). */
export function lerInicioCardPersistidoFlex(
  cooperadoId: string,
  cooperativaId: string | undefined
): InicioCardPersistido | null {
  if (cooperativaId) {
    const direct = lerInicioCardPersistido(cooperadoId, cooperativaId);
    if (direct) return direct;
  }
  if (typeof localStorage === "undefined") return null;
  const prefix = `hb.coop.inicioCard.v${INICIO_CARD_STORAGE_VERSION}:`;
  const suffix = `:${cooperadoId}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix) || !key.endsWith(suffix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as InicioCardPersistido;
      if (
        parsed.v === INICIO_CARD_STORAGE_VERSION &&
        cooperadoPwaSnapshotBuildReadable(parsed.appBuild) &&
        parsed.display
      ) {
        return parsed;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const PILOT_CROSS_BUILD_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

function inicioCardPersistidoCrossBuildFresh(savedAt: string | undefined): boolean {
  if (!savedAt) return false;
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= PILOT_CROSS_BUILD_MAX_AGE_MS;
}

function listarInicioCardPersistidoFlexRaw(
  cooperadoId: string,
  cooperativaId: string | undefined
): InicioCardPersistido[] {
  if (typeof localStorage === "undefined") return [];
  const prefix = `hb.coop.inicioCard.v${INICIO_CARD_STORAGE_VERSION}:`;
  const suffix = `:${cooperadoId}`;
  const out: InicioCardPersistido[] = [];
  try {
    if (cooperativaId) {
      const raw = localStorage.getItem(inicioCardStorageKey(cooperadoId, cooperativaId));
      if (raw) {
        const parsed = JSON.parse(raw) as InicioCardPersistido;
        if (parsed.v === INICIO_CARD_STORAGE_VERSION && parsed.display) out.push(parsed);
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix) || !key.endsWith(suffix)) continue;
      if (cooperativaId && key === inicioCardStorageKey(cooperadoId, cooperativaId)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as InicioCardPersistido;
      if (parsed.v === INICIO_CARD_STORAGE_VERSION && parsed.display) out.push(parsed);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Piloto mobile — lê cache do card mesmo de build anterior (até sync rematerializar).
 * GA continua usando `lerInicioCardPersistidoFlex` (filtro de build).
 */
export function lerInicioCardPersistidoFlexSemFiltroBuild(
  cooperadoId: string,
  cooperativaId: string | undefined
): InicioCardPersistido | null {
  const candidates = listarInicioCardPersistidoFlexRaw(cooperadoId, cooperativaId).filter((p) =>
    inicioCardPersistidoCrossBuildFresh(p.savedAt)
  );
  if (candidates.length === 0) return null;

  const sameBuild = candidates.filter((p) => p.appBuild === APP_BUILD_VERSION);
  const pool = sameBuild.length > 0 ? sameBuild : candidates;
  const withObrigacao = pool.filter((p) => persistidoTemObrigacaoReceber(p.display));
  const pickFrom = withObrigacao.length > 0 ? withObrigacao : pool;

  return pickFrom.reduce<InicioCardPersistido | null>((best, cur) => {
    if (!best) return cur;
    const bestT = Date.parse(best.savedAt);
    const curT = Date.parse(cur.savedAt);
    if (!Number.isFinite(bestT)) return cur;
    if (!Number.isFinite(curT)) return best;
    return curT > bestT ? cur : best;
  }, null);
}

export function gravarInicioCardPersistido(
  cooperadoId: string,
  cooperativaId: string,
  payload: InicioCardPersistido
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(inicioCardStorageKey(cooperadoId, cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function gravarInicioCardPersistidoFlex(
  cooperadoId: string,
  cooperativaId: string | undefined,
  payload: InicioCardPersistido
): void {
  if (cooperativaId) gravarInicioCardPersistido(cooperadoId, cooperativaId, payload);
}

/**
 * Cache válido para liberar abertura instantânea (HX 9.0).
 * Antes: só com valor a receber; agora qualquer snapshot da última sessão.
 */
/** Remove snapshots do card — cooperado mobile após update do app ou sync operacional. */
export function limparInicioCardPersistidoFlex(
  cooperadoId: string,
  cooperativaId?: string
): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (cooperativaId) {
      localStorage.removeItem(inicioCardStorageKey(cooperadoId, cooperativaId));
    }
    const prefix = `hb.coop.inicioCard.v`;
    const suffix = `:${cooperadoId}`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes("inicioCard") && key.endsWith(suffix)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function inicioCardCacheProntoParaAbertura(persistido: InicioCardPersistido | null): boolean {
  if (!persistido?.display) return false;
  if (persistido.v !== INICIO_CARD_STORAGE_VERSION) return false;
  if (!cooperadoPwaSnapshotBuildReadable(persistido.appBuild)) return false;
  if (persistidoTemObrigacaoReceber(persistido.display)) return true;
  const savedAt = Date.parse(persistido.savedAt);
  if (!Number.isFinite(savedAt)) return false;
  const maxAgeMs = 45 * 24 * 60 * 60 * 1000;
  return Date.now() - savedAt <= maxAgeMs;
}
