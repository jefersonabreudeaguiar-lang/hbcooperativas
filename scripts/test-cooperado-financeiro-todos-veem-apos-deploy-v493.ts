/**
 * Cada build novo: todos os cooperados puxam a ficha e vêem A receber / Financeiro.
 * npx tsx scripts/test-cooperado-financeiro-todos-veem-apos-deploy-v493.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.equal(APP_BUILD_VERSION, 493, "build 493");
assert.match(read("public/sw.js"), /hb-coop-build-493/);

const postDeploy = read("src/lib/cooperado/cooperadoPostDeployBackground.ts");
assert.match(
  postDeploy,
  /runCooperadoGaSyncBaseInformacoesFinanceiras\(user, \{ force: true, silent: true \}\)/,
  "pós-deploy puxa a ficha da nuvem para todo cooperado"
);
assert.match(postDeploy, /ackPostDeploySeFinanceiroPronto/, "ack só com valor ou liquidação");
assert.doesNotMatch(
  postDeploy,
  /!cooperadoAppReleaseNeedsOperacionalSync\(\)/,
  "não confirma deploy só porque o build já foi marcado"
);

const gaSync = read("src/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync.ts");
assert.match(
  gaSync,
  /Boolean\(opts\?\.force\) \|\| cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem/,
  "UI zerada fura o defer da abertura"
);

const ficha = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.match(ficha, /Buscando o valor a receber da cooperativa/, "Financeiro não fica em branco");
assert.doesNotMatch(
  ficha,
  /if \(isCooperado\) return <FinanceiroTabSkeleton \/>/,
  "cooperado não trava no skeleton eterno"
);

const inicio = read("src/hooks/useCooperadoInicioValorReceberCardState.ts");
assert.match(
  inicio,
  /display: SNAPSHOT_VAZIO,[\s\S]*atualizando: true/,
  "A receber zerado mostra Atualizando, não R$ 0,00"
);

const gate = read("src/components/cooperado/CooperadoFinanceiroGate.tsx");
assert.doesNotMatch(
  gate,
  /scheduleCooperadoGaSyncBaseInformacoesFinanceiras\(\s*user,\s*\{\s*force:\s*true\s*\}\)/,
  "Gate não força operacional no 1º paint"
);

console.log("ok: todos os cooperados vêem o financeiro após o deploy (v493)");
