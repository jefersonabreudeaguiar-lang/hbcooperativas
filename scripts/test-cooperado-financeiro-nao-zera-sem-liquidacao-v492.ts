/**
 * Financeiro/A receber não grava nem exibe R$ 0 sem liquidação do responsável.
 * npx tsx scripts/test-cooperado-financeiro-nao-zera-sem-liquidacao-v492.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { cooperadoInicioCardEscolherDisplayEstavel } from "../src/lib/cooperadoInicioCardPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.equal(APP_BUILD_VERSION, 492, "build 492");
assert.match(read("public/sw.js"), /hb-coop-build-492/);

const fichaPersist = read("src/lib/cooperado/cooperadoPwaFichaResumoSnapshot.ts");
assert.match(
  fichaPersist,
  /nextValor <= 0\.005 && !cooperadoBicAutorizaZerarCardInicio/,
  "ficha não grava 0 sem liquidação"
);

const fichaUi = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.doesNotMatch(
  fichaUi,
  /if \(fromSnap\) return fromSnap;/,
  "Financeiro não pinta snapshot zerado"
);
assert.match(fichaUi, /messenger \|\| pilotFinanceiroLeve/, "mensageiro relê snapshot no refresh");
assert.match(fichaUi, /appDataWarmTick/, "Financeiro reagenda sync quando o AppData aquece");

const gaSync = read("src/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync.ts");
assert.match(
  gaSync,
  /cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem/,
  "abertura zerada fura o defer e puxa a nuvem"
);

const messenger = read("src/lib/cooperado/cooperadoPwaMessengerMode.ts");
assert.match(
  messenger,
  /dispatchCooperadoPwaLeveUiSnapshotRefresh\(\);\s*void import\("@\/services\/hbCreditAccountPersistenciaService"\)/s,
  "abertura leve avisa a UI e grava HB"
);

const warmup = read("src/lib/cooperado/cooperadoFinanceiroDisplayWarmup.ts");
assert.match(
  warmup,
  /scheduleCooperadoGaSyncBaseInformacoesFinanceiras\(user\)/,
  "warmup PWA puxa ficha se A receber segue zerado"
);

const gate = read("src/components/cooperado/CooperadoFinanceiroGate.tsx");
assert.match(
  gate,
  /scheduleCooperadoGaSyncBaseInformacoesFinanceiras\(user\)/,
  "abertura com R$ 0 busca a ficha na nuvem"
);
assert.doesNotMatch(
  gate,
  /scheduleCooperadoGaSyncBaseInformacoesFinanceiras\(\s*user,\s*\{\s*force:\s*true\s*\}\)/,
  "Gate não força operacional_full no 1º paint"
);

const persistCard = read("src/services/cooperadoInicioCardPersistenciaService.ts");
assert.match(persistCard, /persistido,/, "card A receber usa o valor já gravado");
assert.doesNotMatch(persistCard, /persistido: null/);

const estavel = cooperadoInicioCardEscolherDisplayEstavel({
  persistido: { mesLabel: "Out", valor: 890.4, valorRecibo: 0, aguardandoAssinatura: false },
  motor: { mesLabel: "—", valor: 0, valorRecibo: 0, aguardandoAssinatura: false },
  autorizaZerarCompleto: false,
});
assert.equal(estavel.valor, 890.4, "motor 0 não apaga A receber");

console.log("ok: financeiro não zera sem liquidação (v492)");
