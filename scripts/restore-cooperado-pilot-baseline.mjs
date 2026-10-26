/**
 * Linha piloto Jeferson — cooperado = tag v644 (Fase 3 SIM), gestão = main atual.
 *
 *   node scripts/restore-cooperado-pilot-baseline.mjs
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const TAG = "cooperado-mobile-fase3-v644";
const ROOT = resolve(import.meta.dirname, "..");

const FROM_TAG = [
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
  "src/lib/bic/bicRevisionPulse.ts",
];

/** Gestão + anti-travamento cooperado em arquivos compartilhados (main). */
const FROM_MAIN = [
  "src/lib/performance/cooperadoColdStart.ts",
  "src/lib/performance/cooperadoBootShell.ts",
  "src/components/performance/CooperadoBootShellDismiss.tsx",
  "src/services/dataStore.ts",
  "src/components/sync/CooperativaSyncProvider.tsx",
  "src/app/(app)/dashboard/DashboardContent.tsx",
  "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx",
  "src/services/cooperadoFinanceiroGuard.ts",
];

function sh(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
}

function lsTree(dir) {
  return execSync(`git ls-tree -r --name-only ${TAG} -- ${dir}`, {
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

const tagPaths = [...new Set([...FROM_TAG, ...perfCooperado, ...perfComponents])];

console.log(`[pilot-baseline] cooperado ← ${TAG} (${tagPaths.length} paths)`);
for (const p of tagPaths) {
  sh(`git checkout ${TAG} -- "${p}"`);
}

console.log(`[pilot-baseline] gestão/compartilhado ← main (${FROM_MAIN.length} paths)`);
for (const p of FROM_MAIN) {
  sh(`git checkout main -- "${p}"`);
}

console.log("[pilot-baseline] OK — bump build piloto (680+) e deploy Preview apenas.");
