import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Persistido após confirmar que o bundle carregado bate com o release oficial. */
export const DEPLOYMENT_SEEN_KEY = "hb-coop-app-deployment-seen";
export const BUILD_SEEN_KEY = "hb-coop-app-build-seen";

export type ClientReleaseInfo = {
  build: number;
  deploymentId: string;
  gitCommitSha: string;
};

export function getEmbeddedClientRelease(): ClientReleaseInfo {
  return {
    build: APP_BUILD_VERSION,
    deploymentId: (process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? "").trim(),
    gitCommitSha: (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").trim(),
  };
}

/** dpl=… em scripts/styles já parseados pelo navegador. */
export function collectLoadedDeploymentIdsFromDom(): string[] {
  if (typeof document === "undefined") return [];
  const ids = new Set<string>();
  const sel = 'script[src*="dpl="], link[href*="dpl="]';
  for (const el of document.querySelectorAll(sel)) {
    const url = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || "";
    const m = url.match(/[?&]dpl=([^&]+)/);
    if (m?.[1]) ids.add(m[1]);
  }
  return [...ids];
}

export type DeploymentGuardDecision =
  | { action: "ok"; reason: string }
  | { action: "reload"; reason: string };

/**
 * Se o HTML/JS carregado pertence a outro deployment Vercel que o release atual, força reload.
 * Não apaga AppData — só substitui o runtime.
 */
export function evaluateDeploymentGuard(input: {
  official: ClientReleaseInfo;
  loadedDeploymentIds: string[];
  previouslySeenDeploymentId: string | null;
}): DeploymentGuardDecision {
  const officialId = input.official.deploymentId;
  if (!officialId) {
    return { action: "ok", reason: "deployment_id_unset_on_build" };
  }

  const loaded = input.loadedDeploymentIds.filter(Boolean);
  if (loaded.length === 0) {
    return { action: "ok", reason: "no_dpl_in_dom_yet" };
  }

  const allMatchOfficial = loaded.every((id) => id === officialId);
  if (!allMatchOfficial) {
    return {
      action: "reload",
      reason: `loaded_dpl_mismatch:${loaded.join(",")}!=${officialId}`,
    };
  }

  if (
    input.previouslySeenDeploymentId &&
    input.previouslySeenDeploymentId !== officialId
  ) {
    return {
      action: "reload",
      reason: `seen_deployment_changed:${input.previouslySeenDeploymentId}->${officialId}`,
    };
  }

  return { action: "ok", reason: "deployment_aligned" };
}

export function hardReloadForNewRelease(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_hbRelease", String(Date.now()));
  window.location.replace(url.toString());
}
