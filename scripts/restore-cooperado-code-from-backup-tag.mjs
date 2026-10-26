/**
 * Restaura o código cooperado a partir da tag git do backup (somente programa — nuvem intacta).
 *
 *   node scripts/restore-cooperado-code-from-backup-tag.mjs
 *
 * Preserva arquivos compartilhados com gestão (ver KEEP_HEAD abaixo).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const TAG = process.env.COOPERADO_BACKUP_TAG ?? "cooperado-mobile-fase3-v644";
const ROOT = resolve(import.meta.dirname, "..");

const CHECKOUT_PATHS = [
  "src/lib/cooperado",
  "src/components/cooperado",
  "src/lib/cooperadoInicioCardPolicy.ts",
  "src/lib/cooperadoInicioCardPersistencia.ts",
  "src/lib/cooperadoApresentacaoFinanceira.ts",
  "src/hooks/useCooperadoApresentacaoFinanceiraConsolidada.ts",
  "src/hooks/useCooperadoDormantAppData.ts",
  "src/hooks/useCooperadoEffectiveTabPath.ts",
  "src/hooks/useCooperadoExibirAguardandoAssinatura.ts",
  "src/hooks/useCooperadoFinanceiroUiSnapshot.ts",
  "src/hooks/useCooperadoFluxoPadrao.ts",
  "src/hooks/useCooperadoInicioCardContext.ts",
  "src/hooks/useCooperadoInicioValorReceberCardState.ts",
  "src/hooks/useCooperadoMessengerReadModelRevision.ts",
  "src/hooks/useCooperadoPanelAppData.ts",
  "src/hooks/useCooperadoPwaDadosDesatualizados.ts",
  "src/hooks/useCooperadoReleaseAlignOnTabPath.ts",
  "src/hooks/useCooperadoReleasePolicy.ts",
  "src/hooks/useCooperadoStaffRevisionWatch.ts",
  "src/hooks/useCooperadoTabPanelActive.ts",
];

/** Pós-tag no piloto (v645/v646) — manter HEAD, não a tag crua. */
const KEEP_HEAD_POST_TAG = [
  "src/lib/bic/bicRevisionPulse.ts",
  "src/app/(app)/dashboard/DashboardContent.tsx",
  "src/components/performance/CooperadoBootShellDismiss.tsx",
  "src/lib/performance/cooperadoBootShell.ts",
  "src/lib/cooperado/cooperadoAberturaInstantanea.ts",
  "src/lib/performance/cooperadoForegroundOperacionalSync.ts",
  "src/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery.ts",
  "src/components/cooperado/CooperadoFinanceiroGate.tsx",
];

/** Não sobrescrever — gestão + anti-travamento cooperado em camadas compartilhadas. */
const KEEP_HEAD = [
  "src/lib/performance/cooperadoColdStart.ts",
  "src/services/dataStore.ts",
  "src/components/sync/CooperativaSyncProvider.tsx",
  "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx",
  "src/services/cooperadoFinanceiroGuard.ts",
];

function sh(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
}

function lsTree(globDir) {
  return execSync(`git ls-tree -r --name-only ${TAG} -- ${globDir}`, {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

const perfCooperado = lsTree("src/lib/performance").filter((p) => {
  const base = p.split("/").pop() ?? "";
  return base.toLowerCase().startsWith("cooperado");
});

const perfComponents = lsTree("src/components/performance").filter((p) => {
  const base = p.split("/").pop() ?? "";
  return base.startsWith("Cooperado");
});

const allPaths = [...new Set([...CHECKOUT_PATHS, ...perfCooperado, ...perfComponents])].filter(
  (p) =>
    !KEEP_HEAD.includes(p) &&
    !KEEP_HEAD_POST_TAG.includes(p) &&
    existsSync(resolve(ROOT, p.split("/")[0]))
);

console.log(`Restaurando cooperado de ${TAG} (${allPaths.length} paths)…`);
for (const p of allPaths) {
  sh(`git checkout ${TAG} -- "${p}"`);
}

console.log("Mantidos do HEAD (gestão / ficha cooperado):");
for (const p of KEEP_HEAD) console.log(`  - ${p}`);
console.log("Próximo: bump APP_BUILD_VERSION + public/sw.js e deploy.");
