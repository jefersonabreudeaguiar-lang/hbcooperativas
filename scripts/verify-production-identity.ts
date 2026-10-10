/**
 * Anti-deploy fantasma — somente leitura HTTP.
 * Compara APP_BUILD_VERSION do repo com /api/client-release em produção.
 *
 * Uso:
 *   npm run verify:production-identity
 *   npm run verify:production-identity -- --url https://hbcooperativas.vercel.app
 *   npm run verify:production-identity -- --expect-sha <git-sha>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");

function readRepoBuild(): number {
  const src = readFileSync(resolve(root, "src/lib/appBuildVersion.ts"), "utf8");
  const m = src.match(/APP_BUILD_VERSION\s*=\s*(\d+)/);
  if (!m) throw new Error("APP_BUILD_VERSION não encontrado em appBuildVersion.ts");
  return Number(m[1]);
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim();
}

async function main() {
  const baseUrl = (argValue("--url") ?? process.env.HB_PRODUCTION_URL ?? "https://hbcooperativas.vercel.app").replace(
    /\/$/,
    ""
  );
  const expectSha = (argValue("--expect-sha") ?? process.env.GITHUB_SHA ?? "").trim().toLowerCase();
  const repoBuild = readRepoBuild();

  const res = await fetch(`${baseUrl}/api/client-release`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    console.error(`FAIL: client-release HTTP ${res.status}`);
    process.exit(1);
  }

  const cloud = (await res.json()) as {
    build?: number;
    gitCommitSha?: string;
    deploymentId?: string;
    fingerprint?: string;
  };

  const cloudBuild = cloud.build ?? 0;
  const cloudSha = (cloud.gitCommitSha ?? "").trim().toLowerCase();

  console.log("=== HB production identity (read-only) ===");
  console.log("url:", baseUrl);
  console.log("repo APP_BUILD_VERSION:", repoBuild);
  console.log("live build:", cloudBuild);
  console.log("live gitCommitSha:", cloud.gitCommitSha ?? "(missing)");
  console.log("live deploymentId:", cloud.deploymentId ?? "(missing)");
  console.log("live fingerprint:", cloud.fingerprint ?? "(missing)");

  let ok = true;

  if (cloudBuild !== repoBuild) {
    console.error(`FAIL: build live (${cloudBuild}) ≠ repo (${repoBuild}).`);
    console.error("     Produção pode estar atrás do main ou o repo não foi bumpado após deploy.");
    ok = false;
  }

  if (expectSha && cloudSha && !cloudSha.startsWith(expectSha.slice(0, 12))) {
    console.error(`FAIL: SHA live não corresponde a --expect-sha (${expectSha}).`);
    ok = false;
  }

  if (!cloudSha) {
    console.warn("WARN: gitCommitSha ausente na resposta — não foi possível validar commit.");
  }

  const loginProbe = await fetch(`${baseUrl}/login`, { method: "GET", redirect: "manual" });
  if (loginProbe.status !== 200 && loginProbe.status !== 307 && loginProbe.status !== 308) {
    console.error(`FAIL: /login retornou HTTP ${loginProbe.status}`);
    ok = false;
  } else {
    console.log("OK: /login responde (smoke HTML).");
  }

  if (!ok) process.exit(1);
  console.log("OK: identidade de produção alinhada ao repositório (build).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
