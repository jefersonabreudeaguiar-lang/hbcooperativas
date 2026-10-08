import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/**
 * Snapshots locais: build antigo ainda serve para 1º frame / resume até Atualizar rematerializar.
 * Evita tela vazia só porque subimos APP_BUILD_VERSION (hotfix train).
 */
const MAX_READABLE_BUILD_LAG = 48;

export function cooperadoPwaSnapshotBuildReadable(savedBuild: number | undefined | null): boolean {
  if (savedBuild == null || !Number.isFinite(savedBuild) || savedBuild <= 0) return true;
  if (savedBuild === APP_BUILD_VERSION) return true;
  if (savedBuild > APP_BUILD_VERSION) return false;
  return APP_BUILD_VERSION - savedBuild <= MAX_READABLE_BUILD_LAG;
}
