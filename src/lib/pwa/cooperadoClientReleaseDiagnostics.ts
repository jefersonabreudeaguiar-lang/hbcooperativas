import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  collectLoadedDeploymentIdsFromDom,
  getEmbeddedClientRelease,
  getPageEmbeddedReleaseFromDom,
  runtimeAlreadyOnCanonicalRelease,
  runtimeBundleBehindCanonical,
  type ClientReleaseInfo,
} from "@/lib/pwa/clientRelease";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";

export type CooperadoClientReleaseDiagnostics = {
  /** Build compilado no JS que está rodando agora. */
  embeddedBuild: number;
  embeddedDeploymentId: string;
  /** Build gravado no HTML desta aba (pode diferir se a sessão ficou aberta). */
  pageBuild: number;
  pageDeploymentId: string;
  /** Build que a Vercel considera produção (`/api/client-release`). */
  canonicalBuild: number;
  canonicalDeploymentId: string;
  canonicalGitSha: string;
  loadedChunkDeploymentIds: string[];
  bundleBehindCanonical: boolean;
  runtimeAligned: boolean;
  checkedAt: string;
};

export async function readCooperadoClientReleaseDiagnostics(): Promise<CooperadoClientReleaseDiagnostics> {
  const embedded = getEmbeddedClientRelease();
  const page = getPageEmbeddedReleaseFromDom();
  const canonical = await fetchOfficialClientRelease();
  return {
    embeddedBuild: embedded.build || APP_BUILD_VERSION,
    embeddedDeploymentId: embedded.deploymentId,
    pageBuild: page?.build ?? 0,
    pageDeploymentId: page?.deploymentId ?? "",
    canonicalBuild: canonical.build,
    canonicalDeploymentId: canonical.deploymentId,
    canonicalGitSha: canonical.gitCommitSha,
    loadedChunkDeploymentIds: collectLoadedDeploymentIdsFromDom(),
    bundleBehindCanonical: runtimeBundleBehindCanonical(canonical, embedded),
    runtimeAligned: runtimeAlreadyOnCanonicalRelease(canonical, page, embedded),
    checkedAt: new Date().toISOString(),
  };
}

/** Texto curto para suporte — colar no WhatsApp. */
export function formatCooperadoReleaseDiagnosticsLine(d: CooperadoClientReleaseDiagnostics): string {
  const parts = [
    `app v${d.embeddedBuild}`,
    d.bundleBehindCanonical ? `atrasado (nuvem v${d.canonicalBuild})` : `ok nuvem v${d.canonicalBuild}`,
  ];
  if (d.pageBuild > 0 && d.pageBuild !== d.embeddedBuild) {
    parts.push(`html v${d.pageBuild}`);
  }
  if (d.loadedChunkDeploymentIds.length) {
    parts.push(`chunks ${d.loadedChunkDeploymentIds.map((id) => id.slice(4, 12)).join(",")}`);
  }
  return parts.join(" · ");
}

export function shouldPromptCooperadoReleaseReload(d: CooperadoClientReleaseDiagnostics): boolean {
  return d.bundleBehindCanonical || (d.pageBuild > 0 && d.pageBuild > d.embeddedBuild);
}
