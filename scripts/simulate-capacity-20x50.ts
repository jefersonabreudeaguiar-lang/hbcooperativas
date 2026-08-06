/**
 * Simulação de capacidade: 20 cooperativas × 50 cooperados.
 * Executar: npx tsx scripts/simulate-capacity-20x50.ts
 */

import type { AppData, Cooperado, Cooperativa, FichaCorrida, Mensalidade, NotaPedido } from "../src/types";
import { listCooperadosDaCooperativa } from "../src/services/cooperadoCloudService";
import { calcularValorCobrancaSaas } from "../src/services/cobrancaSaasService";
import { getAdminStats } from "../src/services/dashboardService";
import { agruparPendentesPorCooperado, stripBinaryForPersist } from "../src/utils/fotoEntrega";
import { normalizeCnpj } from "../src/utils/cooperativa";

const NUM_COOPERATIVAS = 20;
const COOPERADOS_POR_COOP = 50;
const MESES_HISTORICO = 6;
const ENTREGAS_POR_COOPERADO_MES = 2;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function mesReferencia(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildCooperativa(index: number, now: string): Cooperativa {
  const seq = String(index + 1).padStart(2, "0");
  const cnpjBase = `1234567800${seq}99`.slice(0, 14);
  return {
    id: `coop-${index + 1}`,
    nome: `Cooperativa Exemplo ${seq}`,
    cnpj: normalizeCnpj(cnpjBase),
    endereco: "Zona Rural",
    telefone: "(11) 90000-0000",
    responsavel: `Responsável ${seq}`,
    email: `resp${seq}@exemplo.coop`,
    status: "ativa",
    createdAt: now,
    updatedAt: now,
  };
}

function buildCooperado(coop: Cooperativa, index: number, now: string): Cooperado {
  const seq = String(index + 1).padStart(3, "0");
  return {
    id: `c-${coop.id}-${seq}`,
    cooperativaId: coop.id,
    nomeCompleto: `Cooperado ${seq} — ${coop.nome}`,
    cpfCnpj: `${String(index + 1).padStart(11, "0")}`,
    telefone: "(11) 99000-0000",
    endereco: "Assentamento",
    comunidade: "Comunidade A",
    cafDap: `CAF-${seq}`,
    chavePix: `coop${seq}@email.com`,
    pixValido: true,
    banco: "Sicoob",
    agencia: "0001",
    conta: `${seq}-0`,
    status: "ativo",
    produtos: ["Hortaliças"],
    observacoes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function buildNota(
  coop: Cooperativa,
  cooperado: Cooperado,
  mes: string,
  seq: number,
  now: string
): NotaPedido {
  const valorBruto = 120 + (seq % 5) * 10;
  const valorDesconto = Math.round(valorBruto * 0.05 * 100) / 100;
  const valorLiquido = Math.round((valorBruto - valorDesconto) * 100) / 100;
  return {
    id: `nota-${coop.id}-${cooperado.id}-${mes}-${seq}`,
    cooperativaId: coop.id,
    cooperadoId: cooperado.id,
    cooperadoNomeSnapshot: cooperado.nomeCompleto,
    instituicaoId: `inst-${coop.id}`,
    numeroNota: `${mes.replace("-", "")}-${seq}`,
    dataEntrega: `${mes}-15`,
    localEntrega: "Escola Municipal",
    itens: [
      {
        produtoInstituicaoId: `p-${coop.id}`,
        produtoNome: "Alface",
        unidade: "maço",
        precoUnitario: 2.5,
        quantidade: 10,
        valorBruto: 25,
      },
    ],
    valorBruto,
    percentualDescontoCooperativa: 5,
    valorDesconto,
    valorLiquido,
    status: seq % 3 === 0 ? "conferida" : seq % 3 === 1 ? "pago" : "aguardando_conferencia",
    fotosMeta: [
      {
        id: `foto-${seq}`,
        storagePath: `${coop.cnpj}/nota/${seq}.webp`,
        url: `https://storage.example/${seq}.webp`,
        mimeType: "image/webp",
        sizeBytes: 85000,
        width: 1024,
        height: 768,
        status: "uploaded",
        createdAt: now,
      },
    ],
    fotosEnviadasCount: 1,
    fotoNaNuvem: true,
    createdAt: now,
    updatedAt: now,
  };
}

function buildFicha(nota: NotaPedido, mes: string, now: string): FichaCorrida {
  return {
    id: `ficha-${nota.id}`,
    cooperativaId: nota.cooperativaId,
    cooperadoId: nota.cooperadoId,
    cooperadoNomeSnapshot: nota.cooperadoNomeSnapshot,
    notaPedidoId: nota.id,
    descricao: `Entrega ${nota.numeroNota}`,
    valorBruto: nota.valorBruto,
    descontos: nota.valorDesconto,
    valorLiquido: nota.valorLiquido,
    saldoAcumulado: nota.valorLiquido,
    mesReferencia: mes,
    status: nota.status === "pago" ? "pago" : "pendente",
    dataLancamento: nota.dataEntrega,
    createdAt: now,
  };
}

function buildMensalidade(coop: Cooperativa, cooperado: Cooperado, mes: string, now: string): Mensalidade {
  return {
    id: `mens-${cooperado.id}-${mes}`,
    cooperativaId: coop.id,
    cooperadoId: cooperado.id,
    mesReferencia: mes,
    valor: 30,
    vencimento: `${mes}-10`,
    status: "pendente",
    createdAt: now,
    updatedAt: now,
  };
}

function buildAppData(scope: "uma-cooperativa" | "plataforma-inteira"): AppData {
  const now = new Date().toISOString();
  const cooperativas: Cooperativa[] = [];
  const cooperados: Cooperado[] = [];
  const notasPedido: NotaPedido[] = [];
  const fichaCorrida: FichaCorrida[] = [];
  const mensalidades: Mensalidade[] = [];

  const coopCount = scope === "uma-cooperativa" ? 1 : NUM_COOPERATIVAS;

  for (let i = 0; i < coopCount; i += 1) {
    const coop = buildCooperativa(i, now);
    cooperativas.push(coop);

    for (let j = 0; j < COOPERADOS_POR_COOP; j += 1) {
      const cooperado = buildCooperado(coop, j, now);
      cooperados.push(cooperado);

      for (let m = 0; m < MESES_HISTORICO; m += 1) {
        const mes = mesReferencia(m);
        mensalidades.push(buildMensalidade(coop, cooperado, mes, now));

        for (let e = 0; e < ENTREGAS_POR_COOPERADO_MES; e += 1) {
          const nota = buildNota(coop, cooperado, mes, e + 1, now);
          notasPedido.push(nota);
          if (nota.status === "conferida" || nota.status === "pago") {
            fichaCorrida.push(buildFicha(nota, mes, now));
          }
        }
      }
    }
  }

  return {
    cooperativas,
    users: [],
    cooperados,
    mensalidades,
    cotas: [],
    instituicoes: cooperativas.map((c) => ({
      id: `inst-${c.id}`,
      cooperativaId: c.id,
      nome: "Escola Municipal",
      endereco: "Centro",
      localEntrega: "Centro",
      ativo: true,
      createdAt: now,
      updatedAt: now,
    })),
    produtosInstituicao: [],
    notasPedido,
    fichaCorrida,
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

function measure(label: string, fn: () => void): number {
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  console.log(`  ${label}: ${ms.toFixed(1)} ms`);
  return ms;
}

function analyzeScope(scope: "uma-cooperativa" | "plataforma-inteira"): void {
  const title =
    scope === "uma-cooperativa"
      ? "CENÁRIO A — 1 cooperativa (50 cooperados) — visão do responsável"
      : "CENÁRIO B — 20 cooperativas × 50 cooperados — visão admin HB (pior caso local)";

  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);

  const data = buildAppData(scope);
  const stripped = stripBinaryForPersist(data);
  const jsonBytes = Buffer.byteLength(JSON.stringify(stripped), "utf8");
  const limiteLocal = 5 * 1024 * 1024;
  const pctLocal = Math.round((jsonBytes / limiteLocal) * 100);

  const coop = data.cooperativas[0];
  const mesAtual = mesReferencia(0);

  console.log("\nVolume gerado:");
  console.log(`  Cooperativas: ${data.cooperativas.length}`);
  console.log(`  Cooperados: ${data.cooperados.length}`);
  console.log(`  Entregas (notas): ${data.notasPedido.length}`);
  console.log(`  Lançamentos ficha: ${data.fichaCorrida.length}`);
  console.log(`  Mensalidades: ${data.mensalidades.length}`);
  console.log(`  Histórico simulado: ${MESES_HISTORICO} meses × ${ENTREGAS_POR_COOPERADO_MES} entregas/cooperado/mês`);

  console.log("\nArmazenamento local (JSON persistido, fotos só metadados):");
  console.log(`  Tamanho: ${formatBytes(jsonBytes)} (${pctLocal}% do limite ~5 MB)`);
  console.log(
    `  Status: ${
      pctLocal >= 90 ? "CRÍTICO" : pctLocal >= 70 ? "ATENÇÃO" : pctLocal >= 50 ? "MODERADO" : "CONFORTÁVEL"
    }`
  );

  console.log("\nOperações típicas (1 cooperativa):");
  measure("listCooperadosDaCooperativa", () => {
    listCooperadosDaCooperativa(data, coop.id);
  });
  measure("getAdminStats (dashboard)", () => {
    getAdminStats(data);
  });
  measure("agruparPendentesPorCooperado", () => {
    agruparPendentesPorCooperado(
      data,
      data.notasPedido.filter((n) => n.cooperativaId === coop.id && n.status === "aguardando_conferencia"),
      coop.id
    );
  });

  if (scope === "plataforma-inteira") {
    const cobranca = calcularValorCobrancaSaas(data.cooperados.length);
    console.log("\nCobrança SaaS (20 × 50 = 1000 cooperados cadastrados):");
    console.log(`  Cooperados faturáveis: ${cobranca.qtd}`);
    console.log(`  Valor bruto: R$ ${cobranca.valorBruto.toFixed(2)}`);
    console.log(`  Valor total (com piso): R$ ${cobranca.valorTotal.toFixed(2)} por ciclo`);
    console.log(`  Por cooperativa (mínimo): R$ ${cobranca.valorMinimo.toFixed(2)} × 20 = R$ ${(cobranca.valorMinimo * 20).toFixed(2)}`);
  } else {
    const cobranca = calcularValorCobrancaSaas(COOPERADOS_POR_COOP);
    console.log("\nCobrança SaaS (1 cooperativa, 50 cooperados):");
    console.log(`  Valor mensal estimado: R$ ${cobranca.valorTotal.toFixed(2)} (mínimo R$ ${cobranca.valorMinimo.toFixed(2)})`);
  }
}

console.log("Simulação HB Cooperativas — 20 cooperativas × 50 cooperados");
console.log(`Total na plataforma: ${NUM_COOPERATIVAS * COOPERADOS_POR_COOP} cooperados`);

analyzeScope("uma-cooperativa");
analyzeScope("plataforma-inteira");

console.log("\n" + "=".repeat(72));
console.log("CONCLUSÃO");
console.log("=".repeat(72));
console.log(`
• 50 cooperados por cooperativa (uso normal do responsável): ${"CONFORTÁVEL".padEnd(12)} — bem abaixo do limite local.
• 20 cooperativas na plataforma (nuvem Supabase):           ${"TRANQUILO".padEnd(12)} — dados isolados por CNPJ.
• 20 cooperativas no MESMO navegador do admin HB:            ${"ARRISCADO".padEnd(12)} — JSON soma tudo; veja cenário B.
• Sync cooperados (limite 500 no código):                    ${"OK neste caso".padEnd(12)} — 50 << 500 por CNPJ.
• Cooperado no celular (só seus dados):                      ${"CONFORTÁVEL".padEnd(12)} — independente das 20 cooperativas.
`);
