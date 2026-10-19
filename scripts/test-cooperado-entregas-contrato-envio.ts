/**
 * Cooperado envia foto mesmo com catálogo local vazio / sem preço.
 * Uso: npx tsx scripts/test-cooperado-entregas-contrato-envio.ts
 */
import assert from "node:assert/strict";
import type { AppData, Instituicao, ProdutoInstituicao } from "../src/types/index.ts";
import { mergeContratosIntoData } from "../src/services/cooperativaSyncCloudService.ts";
import {
  listarContratosParaEnvioCooperado,
  resolverContratoEntrega,
} from "../src/utils/contratosEntrega.ts";

const COOP = "coop-1";

function emptyData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop Test", cnpj: "12345678000199" }],
    instituicoes: [],
    produtosInstituicao: [],
    instituicoesExcluidas: [],
    cronogramasContrato: [],
    notasPedido: [],
  } as unknown as AppData;
}

const instCloud: Instituicao = {
  id: "i-pnae",
  cooperativaId: COOP,
  nome: "PNAE Merenda",
  tipo: "PNAE",
  cnpj: "",
  responsavel: "",
  telefone: "",
  endereco: "",
  totalComprado: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const prodCloud: ProdutoInstituicao = {
  id: "pi-alface",
  cooperativaId: COOP,
  instituicaoId: "i-pnae",
  nome: "Alface",
  unidade: "kg",
  precoUnitario: 4.5,
  ativo: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

{
  const merged = mergeContratosIntoData(
    emptyData(),
    {
      updatedAt: "2026-10-01T00:00:00.000Z",
      instituicoes: [instCloud],
      produtosInstituicao: [],
    },
    COOP
  );
  assert.ok(
    merged.instituicoes.some((i) => i.id === "i-pnae"),
    "primeiro pull do cooperado guarda instituição da nuvem mesmo sem preço"
  );
}

{
  const merged = mergeContratosIntoData(
    emptyData(),
    {
      updatedAt: "2026-10-01T00:00:00.000Z",
      instituicoes: [instCloud],
      produtosInstituicao: [prodCloud],
    },
    COOP
  );
  const lista = listarContratosParaEnvioCooperado(merged, COOP);
  assert.equal(lista.length, 1, "com preço o cooperado vê o contrato publicado");
  const resolved = resolverContratoEntrega(merged, COOP, undefined, {
    criarPadraoSeVazio: false,
    aceitarPreferenciaSemCatalogo: true,
  });
  assert.equal(resolved.instituicaoId, "i-pnae");
}

{
  const data = emptyData();
  data.instituicoes = [{ ...instCloud }];
  const lista = listarContratosParaEnvioCooperado(data, COOP);
  assert.equal(lista.length, 1, "instituição sem preço ainda entra no envio do cooperado");
}

{
  const data = emptyData();
  data.notasPedido = [
    {
      id: "np-1",
      cooperativaId: COOP,
      cooperadoId: "c1",
      instituicaoId: "i-pnae",
      status: "aguardando_conferencia",
      createdAt: "2026-10-18T10:00:00.000Z",
      updatedAt: "2026-10-18T10:00:00.000Z",
    },
  ] as AppData["notasPedido"];
  const resolved = resolverContratoEntrega(data, COOP, undefined, {
    criarPadraoSeVazio: false,
    aceitarPreferenciaSemCatalogo: true,
  });
  assert.equal(
    resolved.instituicaoId,
    "i-pnae",
    "sem catálogo local o envio reusa o contrato da última nota"
  );
}

{
  const data = emptyData();
  const resolved = resolverContratoEntrega(data, COOP, "i-salvo", {
    criarPadraoSeVazio: false,
    aceitarPreferenciaSemCatalogo: true,
  });
  assert.equal(
    resolved.instituicaoId,
    "i-salvo",
    "preferência do cooperado vale mesmo com catálogo vazio — foto segue para Conferir"
  );
}

{
  const data = emptyData();
  const blocked = resolverContratoEntrega(data, COOP, "i-salvo", {
    criarPadraoSeVazio: false,
  });
  assert.equal(blocked.instituicaoId, "", "responsável continua exigindo catálogo válido");
}

console.log("test-cooperado-entregas-contrato-envio: ok");
