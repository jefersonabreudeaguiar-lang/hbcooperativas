import type { User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { purgeCooperadoPwaSnapshotLocalStorageKeys } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import {
  BUILD_SEEN_KEY,
  clearClientRuntimeCaches,
  clearCooperadoReleaseAlignLocalKeys,
} from "@/lib/pwa/clientRelease";
import { markPwaRepairSessionForBuild } from "@/lib/pwa/cooperadoPwaInstallPrepare";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";

/** Bump ao reforçar purge para o mesmo cooperado (suporte). */
const FORCED_REPAIR_EPOCH = 1;

/**
 * Allowlist cirúrgica — purge de cache PWA no próximo login bem-sucedido (1× por sessão).
 * Remover o cooperadoId quando o aparelho estiver estável.
 */
const FORCED_COOPERADO_IDS = new Set<string>(["c_1786144409883_n5rgc"]);

const FORCED_COOPERADO_EMAILS = new Set<string>(["rosaagenorburmann@gmail.com"]);

function normalizeEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function forcedRepairSessionKey(cooperadoId: string): string {
  return `hb-coop-forced-profile-repair:${cooperadoId}:e${FORCED_REPAIR_EPOCH}`;
}

export function cooperadoNeedsForcedProfileCacheRepair(user: Pick<User, "role" | "cooperadoId" | "email"> | null): boolean {
  if (!user || user.role !== "cooperado") return false;
  const coopId = user.cooperadoId?.trim();
  if (coopId && FORCED_COOPERADO_IDS.has(coopId)) return true;
  const email = normalizeEmail(user.email);
  return email.length > 0 && FORCED_COOPERADO_EMAILS.has(email);
}

/**
 * Limpa cache/SW + snapshots PWA locais e recarrega o destino pós-login.
 * Não apaga `coopeagriplla_session` nem AppData operacional.
 */
export async function applyCooperadoForcedProfileCacheRepairIfNeeded(
  user: Pick<User, "role" | "cooperadoId" | "email">,
  redirectTo: string
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!cooperadoNeedsForcedProfileCacheRepair(user)) return false;

  const cooperadoId = user.cooperadoId?.trim() ?? normalizeEmail(user.email);
  const sessionKey = forcedRepairSessionKey(cooperadoId);
  try {
    if (sessionStorage.getItem(sessionKey) === "done") return false;
    sessionStorage.setItem(sessionKey, "done");
  } catch {
    return false;
  }

  const official = await fetchOfficialClientRelease();
  const cloudBuild =
    official?.build && official.build > 0 ? official.build : APP_BUILD_VERSION;

  await clearClientRuntimeCaches();
  purgeCooperadoPwaSnapshotLocalStorageKeys();
  clearCooperadoReleaseAlignLocalKeys();

  try {
    localStorage.setItem(BUILD_SEEN_KEY, String(cloudBuild));
    localStorage.setItem(PWA_REPAIR_LOCAL_BUILD_KEY, String(cloudBuild));
  } catch {
    /* ignore */
  }
  markPwaRepairSessionForBuild(cloudBuild);

  const dest = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  const url = new URL(dest, window.location.origin);
  url.searchParams.set("hb-pwa", String(cloudBuild));
  window.location.replace(url.pathname + url.search + url.hash);
  return true;
}
