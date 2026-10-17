/**
 * Cooperado (JWT) não entra no responsável — browser ou celular.
 * Quem o principal conceder (equipe e contador) entra.
 * npx tsx scripts/test-cooperado-browser-nunca-responsavel-v454.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData, User } from "../src/types/index.ts";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import {
  CNPJ_PAINEL_RESPONSAVEL_RESTRITO,
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
} from "../src/lib/security/responsavelPanelAccess.ts";
import {
  cooperadoSessaoNuncaPainelGestao,
  evaluateResponsavelIdentidade,
} from "../src/lib/responsavel/responsavelIdentidade.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
assert.ok(APP_BUILD_VERSION >= 454);
assert.equal(CNPJ_PAINEL_RESPONSAVEL_RESTRITO, "62351750000165");

const COOP = "coop-oficial";

function dataOficial(users: User[]): AppData {
  return {
    users,
    cooperativas: [
      { id: COOP, nome: "Coop", cnpj: CNPJ_PAINEL_RESPONSAVEL_RESTRITO, active: true },
    ],
    cooperados: [],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    cotas: [],
    financeiroMensal: [],
    auditLog: [],
    equipe: [],
    comunicados: [],
    votacoes: [],
    prestacaoContas: [],
    contratos: [],
    instituicoes: [],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    fechamentosMensais: [],
    arquivosMensais: [],
    livroCaixa: [],
  } as AppData;
}

const cooperadoBrowser: User = {
  id: "u-coop",
  email: "jefersonabreudeaguiar@gmail.com",
  name: "Cooperado",
  password: "x",
  role: "cooperado",
  cooperativaId: COOP,
  cooperativaCnpj: CNPJ_PAINEL_RESPONSAVEL_RESTRITO,
  cooperadoId: "c1",
  active: true,
};

assert.equal(cooperadoSessaoNuncaPainelGestao(cooperadoBrowser), true);
assert.equal(canAccessPainelResponsavel(cooperadoBrowser, dataOficial([cooperadoBrowser])), false);
assert.equal(canAccessPainelResponsavelSession(cooperadoBrowser), false);

const idBrowser = evaluateResponsavelIdentidade({
  accountUser: cooperadoBrowser,
  data: dataOficial([cooperadoBrowser]),
  dataReady: true,
  mobile: false,
  preferPainelResponsavel: true,
});
assert.equal(idBrowser.staffPainelUi, false);
assert.equal(idBrowser.modo, "cooperado");

const outroStaff: User = {
  ...cooperadoBrowser,
  id: "u-resp",
  email: "resp@coop.test",
  role: "responsavel",
  cooperadoId: undefined,
};
assert.equal(canAccessPainelResponsavel(outroStaff, dataOficial([outroStaff])), true);

const contador: User = {
  ...outroStaff,
  id: "u-cont",
  email: "contador@coop.test",
  role: "contador",
};
assert.equal(canAccessPainelResponsavel(contador, dataOficial([contador])), true);
assert.equal(canAccessPainelResponsavelSession(contador), true);
const idContador = evaluateResponsavelIdentidade({
  accountUser: contador,
  data: dataOficial([contador]),
  dataReady: true,
  mobile: false,
});
assert.equal(idContador.staffPainelUi, true);
assert.equal(idContador.modo, "gestao");

const criador: User = {
  ...outroStaff,
  id: "u-criador",
  email: "invisium3@gmail.com",
  role: "responsavel",
};
assert.equal(canAccessPainelResponsavel(criador, dataOficial([criador])), true);
assert.equal(canAccessPainelResponsavelSession(criador), true);

const access = readFileSync(join(ROOT, "src/lib/security/responsavelPanelAccess.ts"), "utf8");
assert.ok(access.includes('jwtRoleCooperado(user) && !isAppCreator(user)'));
assert.ok(access.includes("CNPJ_PAINEL_RESPONSAVEL_RESTRITO"));
assert.ok(!access.includes('BUILTIN_PAINEL_RESPONSAVEL_EMAILS = ["jefersonabreudeaguiar@gmail.com"]'));

console.log("test-cooperado-browser-nunca-responsavel-v454: OK");
