import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  clearReloadBurstCounter,
  collectLoadedDeploymentIdsFromDom,
  evaluateClientReleaseAlignment,
  getPageEmbeddedReleaseFromDom,
  alignClientRuntimeToRelease,
  getEmbeddedClientRelease,
  type ClientReleaseInfo,
} from "@/lib/pwa/clientRelease";

export async function fetchOfficialClientRelease(): Promise<ClientReleaseInfo> {
  const embedded = getEmbeddedClientRelease();
  try {
    const res = await fetch("/api/client-release", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) return embedded;
    const json = (await res.json()) as Partial<ClientReleaseInfo>;
    return {
      build: typeof json.build === "number" ? json.build : embedded.build,
      deploymentId: (json.deploymentId ?? embedded.deploymentId).trim(),
      gitCommitSha: (json.gitCommitSha ?? embedded.gitCommitSha).trim(),
    };
  } catch {
    return embedded;
  }
}

export function markClientReleaseSeen(official: ClientReleaseInfo): void {
  localStorage.setItem(BUILD_SEEN_KEY, String(official.build));
  if (official.deploymentId) {
    localStorage.setItem(DEPLOYMENT_SEEN_KEY, official.deploymentId);
  }
}

/** Evita loop de reload: localStorage antigo com HTML/JS já no build canônico. */
export function cooperadoRuntimeAlreadyOnCanonicalRelease(
  canonical: ClientReleaseInfo,
  pageRelease: ClientReleaseInfo | null,
  embedded: ClientReleaseInfo
): boolean {
  const pageBuild = pageRelease?.build ?? embedded.build;
  const pageDpl = (pageRelease?.deploymentId ?? embedded.deploymentId).trim();
  const canonDpl = canonical.deploymentId.trim();
  if (pageBuild !== canonical.build) return false;
  if (!canonDpl) return true;
  if (!pageDpl) return true;
  return pageDpl === canonDpl;
}

export async function ensureCooperadoReleaseUpgrade(isCooperadoExperience: boolean): Promise<"ok" | "aligning"> {
  if (!isCooperadoExperience || typeof window === "undefined") return "ok";
  const canonical = await fetchOfficialClientRelease();
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();

  if (cooperadoRuntimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReloadBurstCounter();
    return "ok";
  }

  const seenDpl = localStorage.getItem(DEPLOYMENT_SEEN_KEY);
  const seenBuild = localStorage.getItem(BUILD_SEEN_KEY);
  const dplChanged = Boolean(canonical.deploymentId && seenDpl && seenDpl !== canonical.deploymentId);
  const buildChanged = Boolean(seenBuild && String(canonical.build) !== seenBuild);
  if (!dplChanged && !buildChanged) return "ok";
  await alignClientRuntimeToRelease(
    dplChanged ? `cooperado_dpl:${seenDpl}->${canonical.deploymentId}` : `cooperado_build:${seenBuild}->${canonical.build}`,
    canonical.deploymentId
  );
  return "aligning";
}

export async function runClientReleaseAlignment(): Promise<"ok" | "pending" | "aligning"> {
  const canonical = await fetchOfficialClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });

  if (decision.action === "pending") return "pending";

  if (decision.action === "align") {
    await alignClientRuntimeToRelease(decision.reason, canonical.deploymentId);
    return "aligning";
  }

  if (loaded.length > 0) {
    markClientReleaseSeen(decision.target);
    clearReloadBurstCounter();
  }
  return "ok";
}
