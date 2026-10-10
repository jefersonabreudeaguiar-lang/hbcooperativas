/**
 * Anti-deploy fantasma — somente leitura HTTP (uma tentativa, sem esperar).
 * Para polling após push: npm run confirm:production:wait
 */
import {
  compareRelease,
  fetchProductionRelease,
  readRepoBuildVersion,
  readRepoHeadSha,
} from "./lib/productionReleaseProbe.ts";

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
  const expectSha = (argValue("--expect-sha") ?? process.env.GITHUB_SHA ?? readRepoHeadSha()).trim().toLowerCase();
  const repoBuild = readRepoBuildVersion();

  const prod = await fetchProductionRelease(baseUrl);
  if (!prod.ok) {
    console.error(`FAIL: ${prod.error}`);
    process.exit(1);
  }

  const cloud = prod.data;
  const repo = { build: repoBuild, headSha: expectSha, branch: "" };
  const verdict = compareRelease(repo, cloud, expectSha);

  console.log("=== HB production identity (read-only) ===");
  console.log("url:", baseUrl);
  console.log("repo APP_BUILD_VERSION:", repoBuild);
  console.log("live build:", cloud.build);
  console.log("live gitCommitSha:", cloud.gitCommitSha || "(missing)");
  console.log("live deploymentId:", cloud.deploymentId || "(missing)");
  console.log("live fingerprint:", cloud.fingerprint || "(missing)");

  if (verdict !== "aligned") {
    if (verdict === "build_drift" || verdict === "both_drift") {
      console.error(`FAIL: build live (${cloud.build}) ≠ repo (${repoBuild}).`);
    }
    if (verdict === "sha_drift" || verdict === "both_drift") {
      console.error(`FAIL: SHA live não corresponde ao esperado (${expectSha.slice(0, 12)}).`);
    }
    if (verdict === "unknown") {
      console.warn("WARN: gitCommitSha ausente — não foi possível validar commit.");
    }
    console.error("     Rode npm run confirm:production:wait após push para aguardar a Vercel.");
    process.exit(1);
  }

  const loginProbe = await fetch(`${baseUrl}/login`, { method: "GET", redirect: "manual" });
  if (loginProbe.status !== 200 && loginProbe.status !== 307 && loginProbe.status !== 308) {
    console.error(`FAIL: /login retornou HTTP ${loginProbe.status}`);
    process.exit(1);
  }
  console.log("OK: /login responde (smoke HTML).");
  console.log("OK: identidade de produção alinhada ao repositório.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
