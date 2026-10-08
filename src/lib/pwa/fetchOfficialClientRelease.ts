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

/**
 * Release oficial na nuvem. `null` se a rede falhar — nunca devolver o build embutido no JS
 * (isso fazia o guard pensar que já estava alinhado e o PWA ficava preso em build antigo).
 */
export async function fetchOfficialClientRelease(): Promise<ClientReleaseInfo | null> {
  try {
    const res = await fetch(`/api/client-release?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<ClientReleaseInfo>;
    const build = typeof json.build === "number" ? json.build : 0;
    if (build <= 0) return null;
    return {
      build,
      deploymentId: (json.deploymentId ?? "").trim(),
      gitCommitSha: (json.gitCommitSha ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/** Cooperado PWA: limpar SW/cache ao subir de build (reload suave mantinha bundle velho). */
export function cooperadoAlignHardForBuildUpgrade(
  canonical: ClientReleaseInfo,
  embedded: ClientReleaseInfo
): boolean {
  return embedded.build > 0 && canonical.build > embedded.build;
}

export function markClientReleaseSeen(official: ClientReleaseInfo): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BUILD_SEEN_KEY, String(official.build));
    if (official.deploymentId) {
      localStorage.setItem(DEPLOYMENT_SEEN_KEY, official.deploymentId);
    }
    clearStaffReleasePendingIfMatches(official.build);
  } catch {
    /* quota / modo privado */
  }
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

export async function ensureCooperadoReleaseUpgrade(
  isCooperadoExperience: boolean
): Promise<"ok" | "aligning" | "pending"> {
  if (!isCooperadoExperience || typeof window === "undefined") return "ok";
  const canonical = await fetchOfficialClientRelease();
  if (!canonical) return "pending";
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  if (runtimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReloadBurstCounter();
    return "ok";
  }

  if (runtimeBundleBehindCanonical(canonical, embedded)) {
    const hard = cooperadoAlignHardForBuildUpgrade(canonical, embedded);
    return alignToCanonicalIfNeeded(
      canonical,
      `cooperado_bundle:${embedded.build}->${canonical.build}`,
      { hard, targetBuild: canonical.build }
    );
  }

  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });

  if (decision.action === "align") {
    const hard =
      decision.hard || cooperadoAlignHardForBuildUpgrade(canonical, embedded);
    return alignToCanonicalIfNeeded(canonical, decision.reason, {
      hard,
      targetBuild: canonical.build,
    });
  }

  if (decision.action === "pending") {
    return "pending";
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
  if (!canonical) return "pending";
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
