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
