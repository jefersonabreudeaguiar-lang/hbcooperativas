/**
 * Gestão: sync contínuo discreto (notas_delta + sem operacional no tick).
 * npx tsx scripts/test-staff-gestao-live-sync.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isStaffGestaoLiveSyncEnabled,
  resolveStaffGestaoLiveSyncIntervalMs,
  staffResponsavelLiveSyncTickRequest,
  staffGestaoLiveSyncSkippedOnPath,
} from "../src/lib/staff/staffResponsavelLiveSyncPolicy.ts";
import { expandStaffTierPlanIfOperacionalVazio } from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const provider = readFileSync(
  join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"),
  "utf8"
);

assert(isStaffGestaoLiveSyncEnabled(), "live sync habilitado por default");
assert(staffGestaoLiveSyncSkippedOnPath("/notas-pedido"), "notas usa poll próprio");
assert(resolveStaffGestaoLiveSyncIntervalMs("/dashboard") >= 15_000, "intervalo dashboard");
assert(resolveStaffGestaoLiveSyncIntervalMs("/notas-pedido") === 0, "sem loop duplicado em notas");

const tick = staffResponsavelLiveSyncTickRequest("/ficha-corrida", null);
assert(tick.tier === "notas_delta" && tick.silent === true && tick.staffLiveBackground === true, "tick leve");

const expanded = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("notas_delta", "staff"),
  { cooperados: [], pagamentosCooperado: [], livroCaixa: [], notasPedido: [] },
  "coop-1",
  { staffLiveBackground: true }
);
assert(expanded.pullOperacional === false, "tick não expande operacional");

assert(provider.includes("scheduleStaffGestaoLiveSyncLoop"), "provider agenda loop");
assert(provider.includes("staffResponsavelLifecycleSyncRequestLive"), "lifecycle usa notas_delta leve");
assert(provider.includes("staffLiveBackground"), "pull staff respeita tick leve");

const pull = readFileSync(join(ROOT, "src/services/cooperativaSyncCloudService.ts"), "utf8");
assert(pull.includes("staffLiveBackground?: boolean"), "tiered pull aceita tick leve");
assert(pull.includes("opts?.staffLiveBackground"), "tick leve não aplica reset operacional");

console.log("test-staff-gestao-live-sync.ts done.");
