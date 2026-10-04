import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export function formatRelativoSync(msAgo: number): string {
  if (msAgo < 15_000) return "agora";
  if (msAgo < 60_000) return `há ${Math.floor(msAgo / 1000)}s`;
  if (msAgo < 3_600_000) return `há ${Math.floor(msAgo / 60_000)} min`;
  if (msAgo < 86_400_000) return `há ${Math.floor(msAgo / 3_600_000)} h`;
  return "há mais de 1 dia";
}

/** Texto único do responsável: última sync + build do app instalado. */
export function staffUltimaAtualizacaoTexto(
  syncing: boolean,
  lastSyncedAt: number | null,
  now = Date.now()
): string {
  const build = `v${APP_BUILD_VERSION}`;
  if (syncing) return `Atualizando dados… · app ${build}`;
  if (lastSyncedAt == null) return `Aguardando sincronização · app ${build}`;
  const rel = formatRelativoSync(now - lastSyncedAt);
  return `Última atualização · dados ${rel} · app ${build}`;
}

export const STAFF_APP_BUILD_LABEL = `v${APP_BUILD_VERSION}`;
