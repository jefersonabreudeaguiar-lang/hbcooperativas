import { isCooperadoEntregaFlowActive } from "@/lib/cooperado/cooperadoEntregaFlowGuard";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";
import {
  getEmbeddedClientRelease,
  getPageEmbeddedReleaseFromDom,
  isPwaColdStartWindow,
  runtimeBundleBehindCanonical,
} from "@/lib/pwa/clientRelease";

let lastProbeAt = 0;

/**
 * Checagem leve: bundle em execução vs release oficial na Vercel.
 * Dispara o release shield (align) quando o JS está atrás — típico com tab keep-alive.
 */
export async function runClientReleaseIntegrityProbe(
  trigger: string,
  opts?: { bypassCache?: boolean; minGapMs?: number }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (document.visibilityState === "hidden") return false;
  if (isCooperadoEntregaFlowActive()) return false;

  const minGap = opts?.minGapMs ?? 20_000;
  const now = Date.now();
  if (now - lastProbeAt < minGap) return false;
  lastProbeAt = now;

  const embedded = getEmbeddedClientRelease();
  const official = await fetchOfficialClientRelease({
    bypassCache: opts?.bypassCache === true,
  });
  if (!official) return false;

  const requestAlign = (reason: string): boolean => {
    if (isCooperadoEntregaFlowActive()) return false;
    if (isPwaColdStartWindow()) return false;
    void runClientReleaseShield(`integrity:${reason}:${trigger}`);
    return true;
  };

  if (runtimeBundleBehindCanonical(official, embedded)) {
    return requestAlign("bundle_behind");
  }

  const page = getPageEmbeddedReleaseFromDom();
  if (page && official.build > 0 && page.build > 0 && official.build > page.build) {
    return requestAlign("html_stale");
  }

  if (page && embedded.build > 0 && page.build > embedded.build) {
    return requestAlign("html_ahead_bundle");
  }

  return false;
}
