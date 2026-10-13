/**
 * Confirma deploy do ambiente LAB (URL separada do oficial).
 *
 *   HOMOLOG_APP_URL=https://seu-lab.vercel.app npm run confirm:homolog
 *   npm run confirm:homolog -- --expect-sha <sha>
 */
import {
  compareRelease,
  fetchProductionRelease,
  readRepoRelease,
  type DeployAlignmentVerdict,
} from "./lib/productionReleaseProbe.ts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim();
}

function homologBaseUrl(): string {
  const fromEnv = (process.env.HOMOLOG_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const fromArg = argValue("--url");
  const url = (fromArg || fromEnv).replace(/\/$/, "");
  if (!url) {
    console.error(
      "Defina HOMOLOG_APP_URL (ex.: https://hbcooperativas-lab.vercel.app) ou use --url <base>"
    );
    process.exit(1);
  }
  if (url.includes("hbcooperativas.vercel.app") && !url.includes("-lab")) {
    console.error(
      "HOMOLOG_APP_URL parece ser o domínio OFICIAL. Use o projeto Vercel do laboratório."
    );
    process.exit(1);
  }
  return url;
}

async function main() {
  const base = homologBaseUrl();
  const repo = readRepoRelease();
  const expectSha = argValue("--expect-sha");
  const live = await fetchProductionRelease(base);
  if (!live.ok) {
    console.error("Falha ao ler /api/client-release:", live.error);
    process.exit(1);
  }
  const verdict: DeployAlignmentVerdict = compareRelease(repo, live.data, expectSha);
  console.log("\n=== HB Laboratório — deploy ===\n");
  console.log("URL:", base);
  console.log("Repo build:", repo.build, "| branch:", repo.branch || "(detached)");
  console.log("Live build:", live.data.build, "| sha:", live.data.gitCommitSha.slice(0, 12));
  console.log("Veredito:", verdict);
  if (verdict !== "aligned") process.exit(1);
  console.log("\nOK — lab alinhado ao commit local.\n");
}

main();
