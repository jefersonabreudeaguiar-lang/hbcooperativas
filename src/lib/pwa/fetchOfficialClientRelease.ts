import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  clearReloadBurstCounter,
  clearReleaseShieldExpected,
  clearStaffReleasePendingIfMatches,
  collectLoadedDeploymentIdsFromDom,
  evaluateClientReleaseAlignment,
  getPageEmbeddedReleaseFromDom,
  alignClientRuntimeToRelease,
  getEmbeddedClientRelease,
  localPersistedBuildBehindCanonical,
  persistReleaseShieldExpected,
  runtimeAlreadyOnCanonicalRelease,
  runtimeNeedsReleaseUpgrade,
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

async function alignToCanonicalIfNeeded(
  canonical: ClientReleaseInfo,
  reason: string
): Promise<"ok" | "aligning" | "pending"> {
  persistReleaseShieldExpected(canonical);
  const aligned = await alignClientRuntimeToRelease(reason, canonical.deploymentId, {
    hard: true,
    targetBuild: canonical.build,
    urgentUpgrade: true,
  });
  return aligned ? "aligning" : "pending";
}

/** Checa release oficial: abertura do app, volta ao foco, ou troca de aba (sem polling). */
export async function applyOfficialReleaseIfNeeded(): Promise<"ok" | "aligning" | "pending"> {
  if (typeof window === "undefined") return "ok";
  const canonical = await fetchOfficialClientRelease();
  if (!canonical) return "pending";
  const embedded = getEmbeddedClientRelease();
  const pageRelease = getPageEmbeddedReleaseFromDom();
  const loaded = collectLoadedDeploymentIdsFromDom();

  const needsUpgrade =
    runtimeNeedsReleaseUpgrade(canonical, pageRelease, embedded) ||
    localPersistedBuildBehindCanonical(canonical);

  if (!needsUpgrade) {
    markClientReleaseSeen(canonical);
    clearReleaseShieldExpected();
    clearReloadBurstCounter();
    return "ok";
  }

  persistReleaseShieldExpected(canonical);

  const decision = evaluateClientReleaseAlignment({
    canonical,
    pageRelease,
    loadedDeploymentIds: loaded,
  });

  if (decision.action === "pending") return "pending";

  if (decision.action === "align") {
    return alignToCanonicalIfNeeded(canonical, decision.reason);
  }

  if (runtimeNeedsReleaseUpgrade(canonical, pageRelease, embedded)) {
    return alignToCanonicalIfNeeded(
      canonical,
      `release_force:${embedded.build}->${canonical.build}`
    );
  }

  markClientReleaseSeen(canonical);
  clearReloadBurstCounter();
  return "ok";
}

export async function ensureCooperadoReleaseUpgrade(
  isCooperadoExperience: boolean
): Promise<"ok" | "aligning" | "pending"> {
  if (!isCooperadoExperience) return "ok";
  return applyOfficialReleaseIfNeeded();
}

export type RunClientReleaseAlignmentOptions = {
  staffExperience?: boolean;
};

export async function runClientReleaseAlignment(
  _options?: RunClientReleaseAlignmentOptions
): Promise<"ok" | "pending" | "aligning"> {
  return applyOfficialReleaseIfNeeded();
}
