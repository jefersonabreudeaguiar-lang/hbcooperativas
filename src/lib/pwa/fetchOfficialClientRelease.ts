import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  clearReloadBurstCounter,
  clearReleaseShieldExpected,
  clearUrgentReleaseAlignDedup,
  clearStaffReleasePendingIfMatches,
  collectLoadedDeploymentIdsFromDom,
  evaluateClientReleaseAlignment,
  getPageEmbeddedReleaseFromDom,
  alignClientRuntimeToRelease,
  getEmbeddedClientRelease,
  localPersistedBuildBehindCanonical,
  markStaffReleasePending,
  persistReleaseShieldExpected,
  releaseFingerprint,
  shouldAutoAlignClientRelease,
  releaseShieldSatisfied,
  runtimeAlreadyOnCanonicalRelease,
  runtimeNeedsReleaseUpgrade,
  runtimeBundleBehindCanonical,
  RELEASE_ALIGN_COOLDOWN_KEY,
  RELEASE_ALIGN_SESSION_KEY,
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
    targetFingerprint: releaseFingerprint(canonical),
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
    if (releaseShieldSatisfied(canonical, pageRelease, embedded)) {
      markClientReleaseSeen(canonical);
      clearReleaseShieldExpected();
      clearReloadBurstCounter();
      clearUrgentReleaseAlignDedup();
    }
    return "ok";
  }

  if (!shouldAutoAlignClientRelease()) {
    markStaffReleasePending(canonical.build);
    return "ok";
  }

  persistReleaseShieldExpected(canonical);

  const pageBuild = pageRelease?.build ?? 0;
  const bundleBuild = embedded.build;
  const buildBehindCloud =
    runtimeBundleBehindCanonical(canonical, embedded) ||
    (pageBuild > 0 && pageBuild !== canonical.build) ||
    localPersistedBuildBehindCanonical(canonical);

  /** Build novo na nuvem: não esperar `dpl=` nos chunks (keep-alive pode ficar preso em pending). */
  if (buildBehindCloud) {
    return alignToCanonicalIfNeeded(
      canonical,
      `build_behind:${bundleBuild || pageBuild}->${canonical.build}`
    );
  }

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

  if (releaseShieldSatisfied(canonical, pageRelease, embedded)) {
    markClientReleaseSeen(canonical);
    clearReleaseShieldExpected();
    clearReloadBurstCounter();
    clearUrgentReleaseAlignDedup();
  }
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

/** Botão «Atualizar app» — ignora cooldown/rajada e força hard align com a nuvem. */
export async function requestManualCooperadoReleaseUpgrade(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const canonical = await fetchOfficialClientRelease();
  if (!canonical) return false;

  clearUrgentReleaseAlignDedup();
  clearReloadBurstCounter();
  try {
    sessionStorage.removeItem(RELEASE_ALIGN_COOLDOWN_KEY);
    sessionStorage.removeItem(RELEASE_ALIGN_SESSION_KEY);
  } catch {
    /* ignore */
  }

  persistReleaseShieldExpected(canonical);
  return alignClientRuntimeToRelease("manual_cooperado", canonical.deploymentId, {
    hard: true,
    targetBuild: canonical.build,
    urgentUpgrade: true,
    targetFingerprint: releaseFingerprint(canonical),
  });
}
