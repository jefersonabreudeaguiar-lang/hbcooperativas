import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  clearReloadBurstCounter,
  clearStaffReleasePendingIfMatches,
  collectLoadedDeploymentIdsFromDom,
  evaluateClientReleaseAlignment,
  getPageEmbeddedReleaseFromDom,
  alignClientRuntimeToRelease,
  getEmbeddedClientRelease,
  markStaffReleasePending,
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
  clearStaffReleasePendingIfMatches(official.build);
}

/** @deprecated use runtimeAlreadyOnCanonicalRelease */
export const cooperadoRuntimeAlreadyOnCanonicalRelease = runtimeAlreadyOnCanonicalRelease;

type AlignOpts = { hard: boolean; targetBuild: number };

async function alignToCanonicalIfNeeded(
  canonical: ClientReleaseInfo,
  reason: string,
  opts: AlignOpts
): Promise<"ok" | "aligning"> {
  const aligned = await alignClientRuntimeToRelease(reason, canonical.deploymentId, {
    hard: opts.hard,
    targetBuild: opts.targetBuild,
  });
  return aligned ? "aligning" : "ok";
}

function staffDeferSoftAlign(
  canonical: ClientReleaseInfo,
  embedded: ClientReleaseInfo
): "ok" {
  if (canonical.build > embedded.build) {
    markStaffReleasePending(canonical.build);
  }
  return "ok";
}

export async function ensureCooperadoReleaseUpgrade(isCooperadoExperience: boolean): Promise<"ok" | "aligning"> {
  if (!isCooperadoExperience || typeof window === "undefined") return "ok";
  const canonical = await fetchOfficialClientRelease();
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  if (runtimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReloadBurstCounter();
    return "ok";
  }

  if (runtimeBundleBehindCanonical(canonical, embedded)) {
    return alignToCanonicalIfNeeded(
      canonical,
      `cooperado_bundle:${embedded.build}->${canonical.build}`,
      { hard: false, targetBuild: canonical.build }
    );
  }

  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });

  if (decision.action === "align") {
    return alignToCanonicalIfNeeded(canonical, decision.reason, {
      hard: decision.hard,
      targetBuild: canonical.build,
    });
  }

  if (decision.action === "pending") {
    return "ok";
  }

  markClientReleaseSeen(canonical);
  clearReloadBurstCounter();
  return "ok";
}

export type RunClientReleaseAlignmentOptions = {
  /** Responsável: nunca reload automático por build/chunks — só banner. */
  staffExperience?: boolean;
};

export async function runClientReleaseAlignment(
  options?: RunClientReleaseAlignmentOptions
): Promise<"ok" | "pending" | "aligning"> {
  const staffExperience = options?.staffExperience === true;
  const canonical = await fetchOfficialClientRelease();
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  if (runtimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReloadBurstCounter();
    return "ok";
  }

  if (runtimeBundleBehindCanonical(canonical, embedded)) {
    const aligned = await alignClientRuntimeToRelease(
      `bundle:${embedded.build}->${canonical.build}`,
      canonical.deploymentId,
      { hard: false, targetBuild: canonical.build }
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
    if (staffExperience && !decision.hard) {
      markStaffReleasePending(canonical.build);
    }
    const aligned = await alignClientRuntimeToRelease(decision.reason, canonical.deploymentId, {
      hard: decision.hard,
      targetBuild: canonical.build,
    });
    return aligned ? "aligning" : "ok";
  }

  if (loaded.length > 0) {
    markClientReleaseSeen(decision.target);
    clearReloadBurstCounter();
  }
  return "ok";
}
