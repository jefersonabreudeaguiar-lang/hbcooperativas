/**
 * Cooperado mobile Jeferson — contrato por aba (4 bottom tabs + rotas críticas).
 * Produção: validação humana segue ROTEIRO no final do arquivo.
 * npx tsx scripts/test-cooperado-jeferson-mobile-abas-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { COOPERADO_BOTTOM_TAB_HREFS } from "../src/lib/performance/cooperadoBottomTabRoutes.ts";
import {
  COOPERADO_MOBILE_PILOT_EMAIL,
  isCooperadoMobileGaPromoted,
  isCooperadoMobilePilot,
} from "../src/lib/cooperado/cooperadoMobilePilot.ts";
import {
  COOPERADO_JEFERSON_PILOTO_FASE_LIBERADA,
  COOPERADO_JEFERSON_PILOTO_PROMOVIDO_GA,
  cooperadoJefersonPilotoAbaAtiva,
} from "../src/lib/cooperado/cooperadoJefersonPilotoFases.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 633, "build 633+ baseline GA cooperado");

const forbidden = [
  "useCooperadoParidadeExibicaoJeferson",
  "cooperadoJefersonPilotoFinanceiroAtivo",
  "cooperadoAReceberParidadeUnificadaPilotoJeferson",
  "cooperadoInicioSincronizadoComFinanceiro",
];

const tabPages: Record<string, string> = {
  "/dashboard": "src/app/(app)/dashboard/DashboardContent.tsx",
  "/notas-pedido": "src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx",
  "/precos": "src/app/(app)/precos/PrecosContent.tsx",
  "/ficha-corrida": "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx",
};

for (const href of COOPERADO_BOTTOM_TAB_HREFS) {
  assert.equal(href in tabPages, true, `aba mapeada: ${href}`);
  const path = tabPages[href]!;
  assert.ok(existsSync(join(ROOT, path)), `${href} → ${path}`);
  const src = read(path);
  assert.match(src, /useCooperadoTabPanelActive/, `${href} respeita tabAtiva`);
  for (const f of forbidden) {
    assert.ok(!src.includes(f), `${href} sem piloto isolado: ${f}`);
  }
}

const dash = read(tabPages["/dashboard"]!);
assert.ok(dash.includes("cooperadoMotorAoVivo"));
assert.ok(dash.includes("useCooperadoInicioValorReceberCardState"));
assert.ok(dash.includes("CooperadoMobileBuildBadge") || read("src/components/layout/AppLayout.tsx").includes("CooperadoMobileBuildBadge"));

const ficha = read(tabPages["/ficha-corrida"]!);
assert.ok(ficha.includes("financeiroAppDataAoVivo"));
assert.ok(ficha.includes("cooperadoGaPausaTrabalhoFinanceiroPesado"));

const keepAlive = read("src/components/performance/CooperadoMobileTabKeepAlive.tsx");
assert.ok(keepAlive.includes("markCooperadoTabPathChange"));

const gaUser = {
  id: "u-jeferson",
  role: "cooperado" as const,
  email: COOPERADO_MOBILE_PILOT_EMAIL,
  cooperadoId: "c_1781981564381_w67gg",
  cooperativaId: "coop1",
};
assert.equal(isCooperadoMobileGaPromoted(gaUser), true, "Jeferson está no GA padrão");
assert.equal(isCooperadoMobilePilot(gaUser), true, "Jeferson é piloto de homologação");
assert.equal(COOPERADO_JEFERSON_PILOTO_FASE_LIBERADA, "inicio");
assert.equal(COOPERADO_JEFERSON_PILOTO_PROMOVIDO_GA, false);
assert.equal(cooperadoJefersonPilotoAbaAtiva(gaUser, "inicio"), true);
assert.equal(cooperadoJefersonPilotoAbaAtiva(gaUser, "financeiro"), false, "financeiro só após fases anteriores");

console.log("OK — test-cooperado-jeferson-mobile-abas-contrato");
console.log("");
console.log(`FASE ATUAL: ${COOPERADO_JEFERSON_PILOTO_FASE_LIBERADA} — homologue só esta aba agora.`);
console.log("A1 Início (/dashboard): abre, nome, card A receber, Atualizar 633, sem tela branca → SIM/NÃO");
console.log("(A2–A6 bloqueadas até A1 SIM e avanço de fase no código)");
