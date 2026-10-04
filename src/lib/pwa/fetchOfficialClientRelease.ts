import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  clearReloadBurstCounter,
  collectLoadedDeploymentIdsFromDom,
  evaluateClientReleaseAlignment,
  getPageEmbeddedReleaseFromDom,
  alignClientRuntimeToRelease,
  getEmbeddedClientRelease,
  runtimeAlreadyOnCanonicalRelease,
  runtimeBundleBehindCanonical,
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

/** @deprecated use runtimeAlreadyOnCanonicalRelease */
export const cooperadoRuntimeAlreadyOnCanonicalRelease = runtimeAlreadyOnCanonicalRelease;

async function alignToCanonicalIfNeeded(
  canonical: ClientReleaseInfo,
  reason: string
): Promise<"ok" | "aligning"> {
  const aligned = await alignClientRuntimeToRelease(reason, canonical.deploymentId);
  return aligned ? "aligning" : "ok";
}

export async function ensureCooperadoReleaseUpgrade(isCooperadoExperience: boolean): Promise<"ok" | "aligning"> {
  if (!isCooperadoExperience || typeof window === "undefined") return "ok";
  const canonical = await fetchOfficialClientRelease();
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  if (runtimeBundleBehindCanonical(canonical, embedded)) {
    return alignToCanonicalIfNeeded(
      canonical,
      `cooperado_bundle:${embedded.build}->${canonical.build}`
    );
  }

  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });

  if (decision.action === "align") {
    return alignToCanonicalIfNeeded(canonical, decision.reason);
  }

  if (decision.action === "pending") {
    return "ok";
  }

  if (runtimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReloadBurstCounter();
  }
  return "ok";
}

export async function runClientReleaseAlignment(): Promise<"ok" | "pending" | "aligning"> {
  const canonical = await fetchOfficialClientRelease();
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  if (runtimeBundleBehindCanonical(canonical, embedded)) {
    const aligned = await alignClientRuntimeToRelease(
      `bundle:${embedded.build}->${canonical.build}`,
      canonical.deploymentId
    );
    return aligned ? "aligning" : "ok";
  }

  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });

  if (decision.action === "pending") return "pending";

  if (decision.action === "align") {
    const aligned = await alignClientRuntimeToRelease(decision.reason, canonical.deploymentId);
    return aligned ? "aligning" : "ok";
  }

  if (runtimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReloadBurstCounter();
  } else if (loaded.length > 0) {
    markClientReleaseSeen(decision.target);
    clearReloadBurstCounter();
  }
  return "ok";
}
