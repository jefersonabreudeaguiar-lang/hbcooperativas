import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const PWA_SNAPSHOTS_BUILD_KEY = "hb-coop-pwa-snapshots-materialized-build";
/**
 * Incrementar só para limpeza **única** global (todos os cooperados).
 * Não usar bump de `APP_BUILD_VERSION` para purge — evita travar após cada deploy.
 */
const PWA_SNAPSHOT_PURGE_EPOCH = 3;
const PWA_SNAPSHOT_PURGE_EPOCH_KEY = "hb-coop-pwa-snapshots-purge-epoch";

const PWA_SNAPSHOT_KEY_MARKERS = [
  "hb.coop.inicioCard",
  "hb.coop.pwaInicioDash",
  "hb.coop.pwaEntregasResumos",
  "hb.coop.pwaFichaResumo",
  "hb.coop.readModels",
  "hb.coop.reciboAssinadoLocal",
  "hb.coop.operacionalMaterializedRev",
  "hb.coop.pilotJeferson",
] as const;

/**
 * Paridade cooperado: snapshot local só vale no **mesmo** build do bundle.
 * (Antes: até 48 builds de tolerância — cooperados diferentes viam valores/UI distintos.)
 */
export function cooperadoPwaSnapshotBuildReadable(savedBuild: number | undefined | null): boolean {
  if (savedBuild == null || !Number.isFinite(savedBuild) || savedBuild <= 0) return true;
  return savedBuild === APP_BUILD_VERSION;
}

/** Snapshots PWA cooperado (início/ficha/entregas) — não apaga sessão nem AppData operacional. */
export function purgeCooperadoPwaSnapshotLocalStorageKeys(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (PWA_SNAPSHOT_KEY_MARKERS.some((m) => key.includes(m))) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

/**
 * Registra build atual; purge pesado só quando `PWA_SNAPSHOT_PURGE_EPOCH` sobe (uma vez por época).
 * Troca de build sozinha não apaga cache — leitura cross-build + rematerialização cobrem o deploy.
 */
export function materializeCooperadoPwaSnapshotsForCurrentBuild(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const prevBuild = Number(localStorage.getItem(PWA_SNAPSHOTS_BUILD_KEY) || 0);
    const prevEpoch = Number(localStorage.getItem(PWA_SNAPSHOT_PURGE_EPOCH_KEY) || 0);
    const buildChanged = prevBuild !== APP_BUILD_VERSION;
    const epochChanged = prevEpoch !== PWA_SNAPSHOT_PURGE_EPOCH;

    if (epochChanged) {
      purgeCooperadoPwaSnapshotLocalStorageKeys();
      localStorage.setItem(PWA_SNAPSHOT_PURGE_EPOCH_KEY, String(PWA_SNAPSHOT_PURGE_EPOCH));
    }
    if (buildChanged) {
      localStorage.setItem(PWA_SNAPSHOTS_BUILD_KEY, String(APP_BUILD_VERSION));
    }
  } catch {
    /* quota / private mode */
  }
}
