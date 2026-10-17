/**
 * BIC padrão no mobile cooperado: abertura só rematerializa cache + GET HB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isBicCentralReadAuthorityEnabled } from "../src/lib/bic/bicCentralReadAuthority.ts";
import { isCooperadoFinanceiroAppDataLiveRead } from "../src/lib/cooperado/cooperadoFinanceiroAppDataLiveRead.ts";
import { isCooperadoBicExibicaoPadraoAtiva } from "../src/lib/cooperado/cooperadoBicMobileAuthority.ts";

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE = "false";

assert.equal(isCooperadoFinanceiroAppDataLiveRead(), false);
assert.equal(isBicCentralReadAuthorityEnabled(), true);
assert.equal(isCooperadoBicExibicaoPadraoAtiva(), true);

const session = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoBicMobileSessionSync.ts"),
  "utf8"
);
assert.equal(session.includes("runCooperadoGaSyncBaseInformacoesFinanceiras"), false);
assert.equal(session.includes("MAX_SYNCS_PER_SESSION"), false);
assert.ok(session.includes("scheduleCooperadoHbCreditLimiteAndAccountWarmup"));
assert.ok(session.includes("isCooperadoBicHybridLightEnabled"));

const vercel = readFileSync(join(import.meta.dirname ?? __dirname, "../vercel.json"), "utf8");
assert.ok(vercel.includes('"NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE": "false"'));

console.log("OK test-cooperado-bic-mobile-session");
