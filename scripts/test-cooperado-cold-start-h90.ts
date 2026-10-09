/**
 * HX 9.0 — smoke estático (sem browser)
 * npx tsx scripts/test-cooperado-cold-start-h90.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const cold = read("src/lib/performance/cooperadoColdStart.ts");
const sync = read("src/services/syncRequest.ts");
const provider = read("src/components/sync/CooperativaSyncProvider.tsx");
const gate = read("src/components/cooperado/CooperadoFinanceiroGate.tsx");
const auth = read("src/modules/auth/AuthProvider.tsx");
const dash = read("src/app/(app)/dashboard/DashboardContent.tsx");

assert(cold.includes("scheduleCooperadoColdStartSync"), "coordinator cold start");
assert(cold.includes("markNextCooperadoSyncSilent"), "marcador silent no coordinator");
assert(cold.includes("scheduleCooperadoPostInteractiveTask"), "post-interactive deploy defer");
const releaseHost = read("src/components/pwa/ClientReleaseShieldHost.tsx");
assert(releaseHost.includes("scheduleCooperadoPostInteractiveTask"), "ClientReleaseShieldHost defer cooperado");
assert(releaseHost.includes("scheduleStaffPostInteractiveTask"), "ClientReleaseShieldHost defer staff");
const releaseFetchEarly = read("src/lib/pwa/fetchOfficialClientRelease.ts");
assert(
  releaseFetchEarly.includes("applyOfficialReleaseIfNeeded") &&
    !releaseFetchEarly.includes("markStaffReleasePending("),
  "align unificado sem defer staff por banner"
);
assert(
  !releaseHost.includes("COOPERADO_RELEASE_POLL_MS") && !releaseHost.includes("setInterval"),
  "release host sem polling periodico de versao"
);
assert(sync.includes("markCooperadoUserSyncVisible"), "sync visível só com ação do usuário");
assert(
  sync.includes("cooperadoBloqueiaSyncOperacionalAutomatico()") &&
    sync.includes("requestAppSync(): void") &&
    sync.indexOf("cooperadoBloqueiaSyncOperacionalAutomatico()") <
      sync.indexOf("markCooperadoUserSyncVisible()"),
  "requestAppSync não marca sync visível quando cooperado manual bloqueia"
);
assert(sync.includes("takePendingCooperadoSilentSync"), "silent flag no dispatch");
assert(provider.includes("syncingForUi"), "contexto syncingForUi");
assert(provider.includes("syncCooperadoAtualizarFromCloud"), "cooperado botao usa sync rapido");
assert(provider.includes("useCooperadoStaffRevisionWatch"), "vigia revisao responsavel");
assert(provider.includes("isCooperadoEventDrivenSync"), "sync event-driven cooperado");
const eventDriven = read("src/lib/performance/cooperadoEventDrivenSync.ts");
assert(eventDriven.includes("fingerprintCooperativaCloudRevision"), "marca dagua nuvem");
const syncReq = read("src/services/syncRequest.ts");
assert(syncReq.includes("requestCooperadoStaffRevisionSync"), "pedido sync por lancamento");
assert(syncReq.includes("requestCooperadoAppReleaseSync"), "pedido sync por versao app");
assert(provider.includes("COOPERADO_ATUALIZAR_TIMEOUT_MS"), "timeout dedicado atualizar cooperado");
const appLayout = read("src/components/layout/AppLayout.tsx");
assert(
  !appLayout.includes("CooperadoAtualizarButton"),
  "cooperado sem botao Atualizar na shell"
);
assert(appLayout.includes("CooperadoSubtleUpdateNotice"), "aviso sutil nova atualizacao");
assert(provider.includes("scheduleCooperadoColdStartSync"), "provider agenda sync único");
assert(gate.includes("shouldSkipCooperadoSecondaryMountSync"), "gate dedupe sync mount");
assert(gate.includes("syncingForUi"), "gate usa syncingForUi");
assert(
  auth.includes("useLayoutEffect") &&
    (auth.includes("ensureCooperadoAppDataEagerWarm") || auth.includes("preloadAppData")),
  "auth warm local no 1º layout (antes do conteúdo)"
);
assert(
  auth.includes("Sync AppData não precisa re-parsear sessão"),
  "auth: dataTick no subscribe sem refresh em todo sync"
);
const rootLayout = read("src/app/layout.tsx");
assert(rootLayout.includes("buildInlineCooperadoAppDataWarmScript"), "parse AppData inline no head");
assert(rootLayout.includes("hb-coop-boot-shell"), "boot shell estático antes do React");
assert(rootLayout.includes("buildInlineCooperadoBootShellScript"), "boot shell cooperado no layout");
assert(
  read("src/components/cooperado/CooperadoPwaMessengerAppDataWarm.tsx").includes(
    "scheduleCooperadoPaintFirst"
  ),
  "AppData PWA mensageiro após 1º paint (não post-interactive 2.8s)"
);
assert(provider.includes("scheduleCooperadoPostShellSync(() =>") && provider.includes("runSync({ force: true, silent: true })"), "sync cold start apos shell");
assert(gate.includes("CooperadoFinanceiroShellProvider"), "gate shell-first com contexto");
assert(!gate.includes("min-h-screen bg-gray-50"), "gate sem tela cheia bloqueante");
assert(appLayout.includes("CooperadoFinanceiroSyncBanner"), "banner discreto no conteudo");
assert(
  dash.includes("instantResume") && dash.includes("cooperadoLocalResumeReady"),
  "dashboard não bloqueia com resume local"
);

const persist = read("src/lib/cooperadoInicioCardPersistencia.ts");
assert(persist.includes("45 * 24"), "cache abertura ampliado (45d)");

const hbWarmup = read("src/hooks/useHbCreditDescontosWarmup.ts");
assert(
  hbWarmup.includes("isCooperadoManualOperacionalSync") &&
    hbWarmup.includes('user.role === "cooperado"'),
  "HB warmup desligado para cooperado sync manual"
);
const hbResumo = read("src/components/hb-credit/CooperadoHbCreditResumoCard.tsx");
assert(
  hbResumo.includes("isCooperadoManualOperacionalSync"),
  "card HB inicio sem poll automatico (manual)"
);

const silentSw = read("src/components/pwa/PwaSilentServiceWorker.tsx");
assert(
  silentSw.includes("serviceWorker.register") && !silentSw.includes("Atualizar"),
  "SW silencioso sem banner manual"
);
const releaseFetch = read("src/lib/pwa/fetchOfficialClientRelease.ts");
assert(
  releaseFetch.includes("applyOfficialReleaseIfNeeded") &&
    releaseFetch.includes("persistReleaseShieldExpected"),
  "release unificado com align automatico"
);
const shield = read("src/lib/pwa/clientReleaseShield.ts");
assert(shield.includes("runClientReleaseShield") && shield.includes("MISALIGNED_RETRY"), "shield com retry");
const clientRelease = read("src/lib/pwa/clientRelease.ts");
assert(clientRelease.includes("markCurrentRuntimeReleaseSeen"), "quiesce loop burst align");
assert(
  clientRelease.includes("allowUrgentReleaseAlignForFingerprint") &&
    clientRelease.includes("URGENT_FP_KEY"),
  "inline cloud_ahead com bypass de burst e dedup por fingerprint"
);

const tabChunks = read("src/lib/performance/prefetchCooperadoTabRouteChunks.ts");
assert(
  tabChunks.includes('href === "/notas-pedido"') && tabChunks.includes("continue"),
  "prefetch em lote não puxa monólito de notas"
);
assert(tabChunks.includes("loadCooperadoNotasHeavyChunk"), "notas pesado só via loader dedicado");
const navPrefetch = read("src/lib/performance/cooperadoNavPrefetch.ts");
assert(
  !navPrefetch.includes('"/notas-pedido",\n  ...COOPERADO_BOTTOM_TAB_HREFS') &&
    navPrefetch.includes("warmCooperadoNotasRouteShell"),
  "nav prefetch prioridade sem notas pesado + shell leve"
);

if (process.exitCode !== 1) {
  console.log("\nHX 9.0 cold start smoke OK");
}
