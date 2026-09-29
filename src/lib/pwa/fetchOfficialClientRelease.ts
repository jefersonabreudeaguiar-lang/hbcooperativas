import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  getEmbeddedClientRelease,
  type ClientReleaseInfo,
} from "@/lib/pwa/clientRelease";

export async function fetchOfficialClientRelease(): Promise<ClientReleaseInfo> {
  const embedded = getEmbeddedClientRelease();
  try {
    const res = await fetch("/api/client-release", { cache: "no-store" });
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
