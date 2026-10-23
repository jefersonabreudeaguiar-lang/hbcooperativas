/**
 * Conferir — contrato anti-ANR (página não responde).
 * npx tsx scripts/test-conferir-ui-nao-travar-contrato-v604.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFERIR_EM_ABERTO_CONTAGEM_DIFERIDA,
  CONFERIR_HYDRATE_CADASTRO_NO_IDLE,
  CONFERIR_LEITURA_PESADA_SO_MEMO_OU_SELECTOR,
  CONFERIR_UI_RESPONSIVIDADE_VERSION,
} from "../src/lib/conferencia/conferirUiResponsividadeContrato.ts";

assert.equal(CONFERIR_UI_RESPONSIVIDADE_VERSION, 1);
assert.equal(CONFERIR_LEITURA_PESADA_SO_MEMO_OU_SELECTOR, true);
assert.equal(CONFERIR_HYDRATE_CADASTRO_NO_IDLE, true);
assert.equal(CONFERIR_EM_ABERTO_CONTAGEM_DIFERIDA, true);

const root = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const proj = read("src/hooks/useConferirProjection.ts");
assert.match(proj, /useMemo\([\s\S]*appDataParaConferirLeitura/, "cadastro enriquecido só em useMemo");
assert.doesNotMatch(
  proj,
  /if \(dataLeituraRaw\)[\s\S]{0,400}appDataParaConferirLeitura/,
  "sem appDataParaConferirLeitura no if de render"
);
assert.match(proj, /useDeferredValue\(dataLeituraStable\)/, "Em aberto não bloqueia fila");

const hydrate = read("src/hooks/useConferirCadastroHydrate.ts");
assert.doesNotMatch(hydrate, /resetResponsavelPainelIndexCache/, "hydrate não zera cache do painel");
assert.match(
  hydrate,
  /requestIdleCallback|setTimeout\(run/,
  "sync cooperados fora do frame crítico"
);

const prodUi = read("scripts/test-conferir-producao-ui-v461.ts");
assert.match(prodUi, /useConferirCadastroHydrate/, "faixa produção cita hydrate Conferir");

console.log("ok: Conferir UI responsividade v604 — contrato anti-travamento");
