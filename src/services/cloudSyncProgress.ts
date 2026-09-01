/** Evita tarefas automáticas (purgar ficha) durante sync da nuvem. */
let activeCloudSyncs = 0;

export function beginCloudSync(): void {
  activeCloudSyncs += 1;
}

export function endCloudSync(): void {
  activeCloudSyncs = Math.max(0, activeCloudSyncs - 1);
}

export function isCloudSyncInProgress(): boolean {
  return activeCloudSyncs > 0;
}
