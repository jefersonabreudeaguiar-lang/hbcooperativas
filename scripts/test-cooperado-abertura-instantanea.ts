/**
 * Abertura do cooperado: Início na hora, sem esperar nuvem/splash.
 * npx tsx scripts/test-cooperado-abertura-instantanea.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COOPERADO_ABERTURA_INSTANTANEA_VERSION,
  COOPERADO_BOOT_SHELL_PINTA_INICIO_LOCAL,
  COOPERADO_LOGIN_NAVEGA_ANTES_DA_NUVEM,
} from "../src/lib/cooperado/cooperadoAberturaInstantanea.ts";
import { buildInlineCooperadoBootShellScript } from "../src/lib/performance/cooperadoBootShell.ts";

const root = join(import.meta.dirname ?? __dirname, "..");

assert.equal(COOPERADO_ABERTURA_INSTANTANEA_VERSION, 1);
assert.equal(COOPERADO_LOGIN_NAVEGA_ANTES_DA_NUVEM, true);
assert.equal(COOPERADO_BOOT_SHELL_PINTA_INICIO_LOCAL, true);

const boot = buildInlineCooperadoBootShellScript();
assert.match(boot, /paintInicio/);
assert.match(boot, /s\.role==="cooperado"/);
assert.doesNotMatch(boot, /A receber/, "splash não mostra valor cacheado antes do React");
assert.match(boot, /Financeiro/, "splash leve com abas do app");
assert.doesNotMatch(
  boot,
  /if\(sessionStorage\.getItem\("[^"]+"\)==="1"\)\{el\.style\.display="flex";el\.setAttribute\("aria-hidden","false"\);return;\}try\{if\(sessionStorage\.getItem/,
  "splash do atalho PWA não segura o cooperado sem pintar o Início"
);

const auth = readFileSync(join(root, "src/modules/auth/AuthProvider.tsx"), "utf8");
const loginFn = auth.slice(auth.indexOf("const login = async"));
const staffFallback = loginFn.indexOf("const synced = cloudProfile");
assert.ok(staffFallback > 0, "login do responsável continua no caminho completo");
const coopFast = loginFn.slice(0, staffFallback);
assert.match(coopFast, /jwtRoleEarly === "cooperado"/);
assert.match(coopFast, /void \(async/);
assert.match(coopFast, /window\.location\.assign/);
assert.match(coopFast, /ensureCloudSessionReady/, "nuvem do cooperado só no fundo");

const store = readFileSync(join(root, "src/services/dataStore.ts"), "utf8");
const finish = store.slice(store.indexOf("async function finishLoginSession"));
assert.match(finish, /user\.role === "cooperado"[\s\S]*void establishCloudSession/);
assert.doesNotMatch(
  finish.slice(0, finish.indexOf("export function refreshSessionForUser")),
  /requestAppSync\(\)/,
  "login cooperado não dispara sync operacional para entrar"
);

const bootstrap = store.slice(store.indexOf("async function bootstrapLocalUserFromCloudLogin"));
assert.match(bootstrap, /void syncCooperadosFromCloud/);

const gate = readFileSync(
  join(root, "src/components/cooperado/CooperadoFinanceiroGate.tsx"),
  "utf8"
);
assert.doesNotMatch(gate, /min-h-screen bg-gray-50/, "gate não vira tela cheia na abertura");

const dismiss = readFileSync(
  join(root, "src/components/performance/CooperadoBootShellDismiss.tsx"),
  "utf8"
);
assert.match(dismiss, /data-cooperado-inicio-ready/, "splash some com Início completo no dashboard");
assert.match(dismiss, /data-cooperado-inicio-shell/, "splash some com casca Olá+cards no dashboard");
assert.match(dismiss, /data-cooperado-inicio-loading/, "splash some com casca GA enquanto viewLive carrega");

const card = readFileSync(join(root, "src/hooks/useCooperadoInicioValorReceberCardState.ts"), "utf8");
assert.match(
  card,
  /useCooperadoInicioAberturaQuiescenceActive/,
  "card A receber evita motor pesado na abertura GA"
);

const aberturaQuiet = readFileSync(
  join(root, "src/lib/cooperado/cooperadoInicioAberturaQuiescence.ts"),
  "utf8"
);
assert.match(aberturaQuiet, /until > Date\.now\(\)\) return/, "quiescência de abertura não renova a cada chamada");
assert.match(
  readFileSync(join(root, "src/lib/cooperado/cooperadoTabSwitchQuiescence.ts"), "utf8"),
  /cooperadoTabSwitchQuiescenceActive\(\)/,
  "pausa pesada na troca de aba só usa tab-hop"
);
assert.doesNotMatch(
  readFileSync(join(root, "src/lib/cooperado/cooperadoTabSwitchQuiescence.ts"), "utf8"),
  /cooperadoInicioAberturaQuiescenceActive/,
  "abertura não entra em cooperadoMobileUiQuiescence"
);

const dash = readFileSync(join(root, "src/app/(app)/dashboard/DashboardContent.tsx"), "utf8");
assert.match(dash, /useLayoutEffect\([\s\S]*markCooperadoInicioAberturaQuiescence\(\)/, "quiescência de abertura uma vez, não a cada render");
assert.match(dash, /useCooperadoInicioAberturaQuiescenceActive/, "repinta Início quando a quiescência termina");
assert.doesNotMatch(
  dash,
  /if \(user\?\.role === "cooperado"\) \{\s*markCooperadoInicioAberturaQuiescence\(\);\s*\}/,
  "não renovar quiescência no corpo do render"
);
assert.match(dash, /data-cooperado-inicio-ready="1"/, "Início completo marca pronto para dismiss");
assert.match(dash, /data-cooperado-inicio-shell="1"/, "casca do Início visível antes do viewLive");
assert.match(dash, /data-cooperado-inicio-loading/, "GA marca loading na casca sem tela vazia");

console.log("ok: abertura do cooperado pinta o Início na hora");
