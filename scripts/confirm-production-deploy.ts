/**
 * Confirma se o deploy na Vercel refletiu o commit/build do repositório.
 *
 * Uso:
 *   npm run confirm:production
 *   npm run confirm:production:wait
 *   npm run confirm:production:wait -- --expect-sha <sha>
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

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function explainVerdict(
  verdict: DeployAlignmentVerdict,
  opts: { waited: boolean; branch: string }
): string[] {
  const lines: string[] = [];
  switch (verdict) {
    case "aligned":
      lines.push("Produção está alinhada ao que você tem no repositório local.");
      lines.push(
        "Por quê: a Vercel já serviu este build e este commit em /api/client-release (metadados públicos do deploy)."
      );
      if (opts.branch !== "main") {
        lines.push(
          `Nota: você está na branch "${opts.branch}" — produção segue o deploy do main na Vercel, não esta branch.`
        );
      }
      break;
    case "build_drift":
      lines.push("O número de build em produção é diferente do arquivo appBuildVersion.ts no repo.");
      lines.push(
        "Por quê: deploy ainda não terminou, push não foi para main, build não foi bumpado após mudança de UI/PWA, ou produção ficou em deploy anterior."
      );
      break;
    case "sha_drift":
      lines.push("O build pode bater, mas o commit Git em produção não é o esperado.");
      lines.push(
        "Por quê: deploy em andamento, rollback, ou Vercel ainda não associou VERCEL_GIT_COMMIT_SHA ao último push."
      );
      break;
    case "both_drift":
      lines.push("Produção está claramente atrás (ou à frente) do repositório local.");
      lines.push(
        "Por quê: ainda não houve deploy do seu push, falha no build da Vercel, ou você não fez push do main após o commit."
      );
      break;
    default:
      lines.push("Não foi possível concluir o alinhamento (SHA ausente na resposta de produção).");
      break;
  }
  if (opts.waited && verdict !== "aligned") {
    lines.push("O script esperou o tempo máximo de polling — o deploy pode ainda estar na fila da Vercel.");
  }
  return lines;
}

async function printReport(params: {
  baseUrl: string;
  repo: ReturnType<typeof readRepoRelease>;
  expectSha: string;
  prod: Awaited<ReturnType<typeof fetchProductionRelease>>;
  verdict: DeployAlignmentVerdict;
  attempt: number;
  waited: boolean;
}): Promise<void> {
  const { baseUrl, repo, expectSha, prod, verdict, attempt, waited } = params;

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  HB — Confirmação de deploy em produção");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("URL:", baseUrl);
  console.log("Branch local:", repo.branch || "(detached)");
  console.log("Commit esperado:", expectSha.slice(0, 12));
  console.log("Build no repo (appBuildVersion.ts):", repo.build);
  console.log("Tentativa:", attempt);
  console.log("");

  if (!prod.ok) {
    console.log("Status: FALHA — não foi possível ler produção");
    console.log("Motivo:", prod.error);
    console.log("");
    console.log("Por quê: rede, URL errada, ou /api/client-release indisponível.");
    return;
  }

  const live = prod.data;
  console.log("── Produção (live) ──");
  console.log("  build:", live.build);
  console.log("  gitCommitSha:", live.gitCommitSha || "(ausente)");
  console.log("  deploymentId:", live.deploymentId || "(ausente)");
  console.log("  fingerprint:", live.fingerprint || "(ausente)");
  console.log("");

  let loginOk = false;
  try {
    const loginProbe = await fetch(`${baseUrl}/login`, { method: "GET", redirect: "manual" });
    loginOk = loginProbe.status === 200 || loginProbe.status === 307 || loginProbe.status === 308;
  } catch {
    loginOk = false;
  }
  console.log("Smoke /login:", loginOk ? "OK" : "FALHA");
  console.log("");

  const ok = verdict === "aligned";
  console.log(ok ? "Status: OK — produção confirmada" : "Status: NÃO ALINHADO — deploy não confirmado");
  console.log("");
  for (const line of explainVerdict(verdict, { waited, branch: repo.branch })) {
    console.log("•", line);
  }
  console.log("");
  if (!ok) {
    console.log("Próximos passos:");
    console.log("  1. Confira em Vercel se o último deploy do main concluiu sem erro.");
    console.log("  2. Se mudou UI/PWA, confirme APP_BUILD_VERSION + public/sw.js bumpados.");
    console.log("  3. Rode de novo: npm run confirm:production:wait");
  }
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
}

async function main() {
  const baseUrl = (argValue("--url") ?? process.env.HB_PRODUCTION_URL ?? "https://hbcooperativas.vercel.app").trim();
  const wait = hasFlag("--wait") || hasFlag("-w");
  const expectSha = (argValue("--expect-sha") ?? process.env.GITHUB_SHA ?? readRepoRelease().headSha).trim();
  const repo = readRepoRelease();

  const intervalMs = Number(process.env.HB_CONFIRM_POLL_MS ?? 15_000);
  const maxWaitMs = Number(process.env.HB_CONFIRM_MAX_WAIT_MS ?? 600_000);
  const start = Date.now();
  let attempt = 0;

  do {
    attempt += 1;
    const prod = await fetchProductionRelease(baseUrl);
    const verdict =
      prod.ok ? compareRelease(repo, prod.data, expectSha) : ("unknown" as DeployAlignmentVerdict);

    if (verdict === "aligned" || !wait) {
      await printReport({ baseUrl, repo, expectSha, prod, verdict, attempt, waited: wait });
      process.exit(verdict === "aligned" && prod.ok ? 0 : 1);
    }

    if (Date.now() - start >= maxWaitMs) {
      await printReport({ baseUrl, repo, expectSha, prod, verdict, attempt, waited: true });
      process.exit(1);
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `[confirm:production] tentativa ${attempt} — ainda não alinhado (${verdict}), ${elapsed}s — aguardando ${intervalMs / 1000}s…`
    );
    await sleep(intervalMs);
  } while (true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
