/**
 * Simula fluxos de sincronização cooperado ↔ responsável (mensalidades + operacional).
 * Executar: npx tsx scripts/simulate-sync-flows.ts
 */
import type { AppData, Mensalidade } from "../src/types";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import { OPERATIONAL_RESET_VERSION } from "../src/services/operationalReset";
import { cooperadoInformouPagamentoMensalidade, confirmarPagamentoMensalidade } from "../src/services/mensalidadeService";

const CNPJ = "62351750000165";
const COOP_ID = "coop-sync";
const COOPERADO_ID = "c-sync";
const COOPERADO_NOME = "Maria Teste";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    return;
  }
  passed += 1;
}

function baseData(): AppData {
  const now = new Date().toISOString();
  return {
    config: { descontoPadraoCooperativa: 5 },
    cooperativas: [
      {
        id: COOP_ID,
        nome: "Coop Sync",
        cnpj: CNPJ,
        endereco: "",
        telefone: "",
        responsavel: "Resp",
        email: "r@test.com",
        createdAt: now,
        updatedAt: now,
      },
    ],
    cooperados: [
      {
        id: COOPERADO_ID,
        cooperativaId: COOP_ID,
        nomeCompleto: COOPERADO_NOME,
        cpfCnpj: "12345678901",
        telefone: "",
        endereco: "",
        comunidade: "",
        cafDap: "",
        chavePix: "pix@test.com",
        banco: "",
        agencia: "",
        conta: "",
        status: "ativo",
        produtos: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    users: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    cotas: [],
    entregas: [],
    descontos: [],
    pagamentos: [],
    financeiro: [],
    fechamentos: [],
    livroCaixa: [],
    comunicados: [],
    propriedades: [],
    veiculos: [],
    prestacoesContas: [],
    auditLog: [],
  };
}

function mensalidadePendente(): Mensalidade {
  const now = new Date().toISOString();
  return {
    id: "mens-1",
    cooperadoId: COOPERADO_ID,
    cooperativaId: COOP_ID,
    mesReferencia: "2026-07",
    valor: 50,
    vencimento: "2026-07-10",
    status: "pendente",
    cooperadoNomeSnapshot: COOPERADO_NOME,
    createdAt: now,
    updatedAt: now,
  };
}

function cloudResetVazio(): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    fullReset: true,
    wipeNotas: true,
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

console.log("=== Simulação sync cooperado ↔ responsável ===\n");

// 1. Reset na nuvem limpa mensalidades locais do responsável
{
  const local = {
    ...baseData(),
    mensalidades: [mensalidadePendente()],
    comunicados: [
      {
        id: "com-1",
        cooperativaId: COOP_ID,
        titulo: "Teste",
        descricao: "Aviso",
        categoria: "aviso_geral",
        ativo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const merged = mergeOperacionalIntoData(local, cloudResetVazio(), COOP_ID, local.cooperados);
  assert(
    "Reset nuvem zera mensalidades locais",
    merged.mensalidades.filter((m) => m.cooperadoId === COOPERADO_ID).length === 0
  );
  assert(
    "Reset nuvem zera comunicados",
    merged.comunicados.filter((c) => c.cooperativaId === COOP_ID).length === 0
  );
}

// 2. Responsável cria mensalidade → cooperado recebe via merge
{
  const resp = baseData();
  const cloudMens = mensalidadePendente();
  const cloud: OperacionalSyncPayload = {
    ...cloudResetVazio(),
    fullReset: false,
    mensalidades: [cloudMens],
    updatedAt: new Date().toISOString(),
  };
  const coopDevice = baseData();
  const merged = mergeOperacionalIntoData(coopDevice, cloud, COOP_ID, coopDevice.cooperados);
  const m = merged.mensalidades.find((x) => x.mesReferencia === "2026-07");
  assert("Cooperado recebe mensalidade do responsável", Boolean(m));
  assert("Status pendente preservado", m?.status === "pendente");
}

// 3. Cooperado informa pagamento → responsável confirma
{
  let data = { ...baseData(), mensalidades: [mensalidadePendente()] };
  const updated = cooperadoInformouPagamentoMensalidade(data, "mens-1", "data:image/jpeg;base64,comp");
  assert("Cooperado informa pagamento", updated !== null);
  data = updated!;
  const aguardando = data.mensalidades[0];
  assert("Cooperado marca aguardando_confirmacao", aguardando.status === "aguardando_confirmacao");
  assert("Comprovante salvo", Boolean(aguardando.comprovante));

  const cloud: OperacionalSyncPayload = {
    ...cloudResetVazio(),
    fullReset: false,
    mensalidades: [aguardando],
    updatedAt: aguardando.updatedAt,
  };
  let respData = baseData();
  respData = mergeOperacionalIntoData(respData, cloud, COOP_ID, respData.cooperados);
  assert(
    "Responsável vê pagamento aguardando",
    respData.mensalidades[0]?.status === "aguardando_confirmacao"
  );

  respData = confirmarPagamentoMensalidade(respData, "mens-1", "u-resp");
  assert("Responsável confirma → paga", respData.mensalidades[0]?.status === "paga");

  const cloudConfirmado: OperacionalSyncPayload = {
    ...cloudResetVazio(),
    fullReset: false,
    mensalidades: respData.mensalidades,
    livroCaixa: respData.livroCaixa ?? [],
    updatedAt: respData.mensalidades[0].updatedAt,
  };
  let coopData = data;
  coopData = mergeOperacionalIntoData(coopData, cloudConfirmado, COOP_ID, coopData.cooperados);
  assert("Cooperado vê mensalidade paga", coopData.mensalidades[0]?.status === "paga");
}

// 4. Nuvem vazia não ressuscita mensalidades antigas do cooperado
{
  const stale = { ...baseData(), mensalidades: [mensalidadePendente()] };
  const cloudEmpty: OperacionalSyncPayload = {
    ...cloudResetVazio(),
    fullReset: false,
    mensalidades: [],
    updatedAt: new Date().toISOString(),
  };
  const merged = mergeOperacionalIntoData(stale, cloudEmpty, COOP_ID, stale.cooperados);
  assert(
    "Nuvem vazia não mantém mensalidades locais obsoletas",
    merged.mensalidades.filter((m) => m.cooperadoId === COOPERADO_ID).length === 0
  );
}

console.log(`\n=== Resultado: ${passed} ok, ${failed} falha(s) ===`);
if (failed > 0) process.exit(1);
