/**
 * H8.9.110 — gates, cache de feature, defer/dedupe aux sync (sem alterar account GET).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

const accountRoute = read("src/app/api/credit/account/route.ts");
assert(
  accountRoute.includes("getLimiteCooperadoExibicaoParidadeLimites"),
  "GET /api/credit/account usa limite em paridade com aba Limites (fast)"
);
assert(
  !accountRoute.includes("ensurePersisted: true"),
  "GET /api/credit/account não dispara persist M6 pesado em cada load"
);
assert(!accountRoute.includes("light read"), "account route sem fast/light read adicionado");
assert(
  read("src/lib/hb-credit/hbCreditAccountPersistencia.ts").includes("HB_CREDIT_ACCOUNT_STORAGE_VERSION = 5"),
  "cache HB cooperado v5"
);
assert(
  read("src/components/hb-credit/HbCreditAccountPersistBootstrap.tsx").includes('"online"'),
  "bootstrap refetch HB ao voltar online"
);

const cloudGate = read("src/components/hb-credit/CloudSessionGate.tsx");
assert(cloudGate.includes("initialCloudGateReady"), "CloudSessionGate inicializa ready com isCloudSessionActive");
assert(cloudGate.includes("ensureCloudSessionReady"), "CloudSessionGate mantém ensureCloudSessionReady");

const hbEnabled = read("src/hooks/useHbCreditEnabled.ts");
assert(hbEnabled.includes("seedSharedFromCache()"), "useHbCreditEnabled faz seed do cache no client");
assert(hbEnabled.includes("if (seedSharedFromCache())"), "cache válido dispara re-render imediato");
assert(hbEnabled.includes("ensureHbCreditStatusFetch"), "revalidação em background preservada");

const page = read("src/app/(app)/minha-conta-coop/page.tsx");
assert(page.includes("auxSyncEnabled"), "página defer aux sync até após fetchCreditAccount");
assert(page.includes("notifyHbCreditAccountLoaded"), "página sinaliza account loaded");
assert(page.includes("fetchCreditAccount"), "fetchCreditAccount preservado");
const reloadBlock = page.match(
  /const reload = useCallback\(async \(opts\?: \{ background\?: boolean \}\) => \{[\s\S]*?\}, \[cnpj, hbApiCooperadoId\]\);/
);
assert(Boolean(reloadBlock), "reload() presente");
assert(
  reloadBlock![0].includes("fetchCreditAccount") && !reloadBlock![0].includes("fetchCreditLedger"),
  "ledger continua lazy (H8.9.97)"
);

const limiteLib = read("src/lib/hb-credit/syncContaCoopLimiteFromFicha.ts");
assert(limiteLib.includes("coalesceContaCoopAuxSync"), "sync-limite coalesce in-flight");
assert(limiteLib.includes("syncCreditLimiteFromFicha"), "sync-limite continua executando syncCreditLimiteFromFicha");

const fichaLib = read("src/lib/hb-credit/syncContaCoopFichaDescontos.ts");
assert(fichaLib.includes("fetchFichaDescontosContaCoop"), "ficha-descontos continua no fluxo");
assert(fichaLib.includes("coalesceContaCoopAuxSync"), "valor a receber coalesce in-flight");

const warmup = read("src/hooks/useHbCreditDescontosWarmup.ts");
assert(warmup.includes("HB_CREDIT_ACCOUNT_LOADED_EVENT"), "warmup aguarda account na rota HB");

const valorHook = read("src/hooks/useSyncContaCoopValorReceberPilot.ts");
assert(valorHook.includes("enabled?: boolean"), "hook valor receber suporta defer via enabled");

console.log("\nH8.9.110 static checks OK");
