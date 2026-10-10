import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

export type ProductionReleaseSnapshot = {
  build: number;
  gitCommitSha: string;
  deploymentId: string;
  fingerprint: string;
};

export type RepoReleaseSnapshot = {
  build: number;
  headSha: string;
  branch: string;
};

const root = resolve(import.meta.dirname ?? __dirname, "../..");

export function readRepoBuildVersion(): number {
  const src = readFileSync(resolve(root, "src/lib/appBuildVersion.ts"), "utf8");
  const m = src.match(/APP_BUILD_VERSION\s*=\s*(\d+)/);
  if (!m) throw new Error("APP_BUILD_VERSION não encontrado em src/lib/appBuildVersion.ts");
  return Number(m[1]);
}

export function readRepoHeadSha(): string {
  return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
}

export function readCurrentBranch(): string {
  try {
    return execSync("git symbolic-ref --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function readRepoRelease(): RepoReleaseSnapshot {
  return {
    build: readRepoBuildVersion(),
    headSha: readRepoHeadSha(),
    branch: readCurrentBranch(),
  };
}

export async function fetchProductionRelease(
  baseUrl: string
): Promise<{ ok: true; data: ProductionReleaseSnapshot } | { ok: false; error: string }> {
  const url = baseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${url}/api/client-release`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) {
      return { ok: false, error: `client-release HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      build?: number;
      gitCommitSha?: string;
      deploymentId?: string;
      fingerprint?: string;
    };
    return {
      ok: true,
      data: {
        build: json.build ?? 0,
        gitCommitSha: (json.gitCommitSha ?? "").trim(),
        deploymentId: (json.deploymentId ?? "").trim(),
        fingerprint: (json.fingerprint ?? "").trim(),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function shaMatches(expected: string, live: string): boolean {
  const e = expected.trim().toLowerCase();
  const l = live.trim().toLowerCase();
  if (!e || !l) return false;
  const n = Math.min(12, e.length, l.length);
  return l.startsWith(e.slice(0, n)) || e.startsWith(l.slice(0, n));
}

export type DeployAlignmentVerdict = "aligned" | "build_drift" | "sha_drift" | "both_drift" | "unknown";

export function compareRelease(
  repo: RepoReleaseSnapshot,
  prod: ProductionReleaseSnapshot,
  expectSha?: string
): DeployAlignmentVerdict {
  const targetSha = (expectSha ?? repo.headSha).trim().toLowerCase();
  const buildOk = prod.build === repo.build;
  const shaOk = prod.gitCommitSha ? shaMatches(targetSha, prod.gitCommitSha) : false;
  if (buildOk && shaOk) return "aligned";
  if (!buildOk && !shaOk) return "both_drift";
  if (!buildOk) return "build_drift";
  if (!shaOk) return "sha_drift";
  return "unknown";
}
