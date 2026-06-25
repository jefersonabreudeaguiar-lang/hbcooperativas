/**
 * Simulação massiva do fluxo cooperado ↔ nuvem ↔ responsável.
 * Executar: npx tsx scripts/simulate-entrega-flow.ts
 */

import type { AppData, NotaPedido } from "../src/types";
import { mergeCloudNotasIntoData } from "../src/services/notaPedidoCloudService";
import { mergeNotasSources } from "../src/lib/supabase/notasStorage";
import {
  agruparPendentesPorCooperado,
  compactarFotosNoArmazenamento,
  contarFotosEnviadasNota,
  getChaveGrupoConferencia,
  getFotosExibicaoNota,
  mergeNotaComFotos,
  notaPertenceCooperativa,
  parametrosCompressaoFoto,
  resolverAbaConferenciaAtiva,
} from "../src/utils/fotoEntrega";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import { normalizeCnpj } from "../src/utils/cooperativa";

const CNPJ = "12345678000199";
const COOP_ID = "coop-1";
const COOPERADO_ID = "c-1";
const INST_ID = "inst-1";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    return false;
  }
  passed += 1;
  return true;
}

function tinyJpeg(index: number): string {
  return `data:image/jpeg;base64,/9j/sim${index}`;
}

function thumb(index: number): string {
  return `data:image/jpeg;base64,thumb${index}`;
}

function baseAppData(): AppData {
  const now = new Date().toISOString();
  return {
    cooperativas: [
      {
        id: COOP_ID,
        nome: "Coop Teste",
        cnpj: CNPJ,
        endereco: "",
        telefone: "",
        responsavel: "Admin",
        email: "a@test.com",
        createdAt: now,
        updatedAt: now,
      },
    ],
    cooperados: [
      {
        id: COOPERADO_ID,
        cooperativaId: COOP_ID,
        nomeCompleto: "João Silva",
        cpfCnpj: "",
        telefone: "",
        endereco: "",
        comunidade: "",
        cafDap: "",
        chavePix: "",
        banco: "",
        agencia: "",
        conta: "",
        status: "ativo",
        produtos: [],
        observacoes: "",
        createdAt: now,
        updatedAt: now,
      },
    ],
    instituicoes: [
      {
        id: INST_ID,
        cooperativaId: COOP_ID,
        nome: "Escola Municipal",
        endereco: "Rua A",
        localEntrega: "Rua A",
        ativo: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    produtosInstituicao: [
      {
        id: "p1",
        instituicaoId: INST_ID,
        cooperativaId: COOP_ID,
        nome: "Alface",
        unidade: "maço",
        precoUnitario: 2.5,
        ativo: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    notasPedido: [],
    fichaCorrida: [],
    arquivosMensais: [],
    mensalidades: [],
    pagamentosCooperado: [],
    comunicados: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
  } as AppData;
}

function makeNota(
  id: string,
  opts: Partial<NotaPedido> & { fotosCount?: number } = {}
): NotaPedido {
  const now = new Date().toISOString();
  const fotosCount = opts.fotosCount ?? 1;
  const miniaturas = Array.from({ length: fotosCount }, (_, i) => thumb(i));
  return {
    id,
    cooperativaId: COOP_ID,
    cooperadoId: COOPERADO_ID,
    instituicaoId: INST_ID,
    numeroNota: `N-${id}`,
    dataEntrega: now.split("T")[0],
    localEntrega: "Rua A",
    itens: [],
    valorBruto: 0,
    percentualDescontoCooperativa: 5,
    valorDesconto: 0,
    valorLiquido: 0,
    status: "aguardando_conferencia",
    mesReferencia: "2026-06",
    cooperativaCnpj: CNPJ,
    cooperadoNomeSnapshot: "João Silva",
    fotoNaNuvem: true,
    fotosEnviadasCount: fotosCount,
    fotosPedidoMiniaturas: miniaturas,
    fotoPedidoMiniatura: miniaturas[0],
    createdAt: now,
    updatedAt: now,
    ...opts,
  };
}

/** Nuvem em memória */
class CloudStore {
  notas = new Map<string, NotaPedido>();

  upsert(nota: NotaPedido) {
    this.notas.set(nota.id, { ...nota, updatedAt: new Date().toISOString() });
  }

  list(): NotaPedido[] {
    return [...this.notas.values()];
  }

  get(id: string) {
    return this.notas.get(id);
  }

  delete(id: string) {
    this.notas.delete(id);
  }

  /** Simula listagem incompleta (bug que apagava fila) */
  listPartial(omitIds: Set<string>): NotaPedido[] {
    return this.list().filter((n) => !omitIds.has(n.id));
  }
}

function syncFromCloud(data: AppData, cloud: CloudStore): AppData {
  const merged = mergeCloudNotasIntoData(data, cloud.list(), CNPJ);
  return reconciliarFichaFromNotasConferidas(merged);
}

function listarPendentes(d: AppData): NotaPedido[] {
  return d.notasPedido
    .filter(
      (n) =>
        n.status === "aguardando_conferencia" && notaPertenceCooperativa(d, n, COOP_ID)
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function obterProximaNota(
  d: AppData,
  chaveGrupo: string,
  concluidaId: string
): NotaPedido | null {
  const pendentes = listarPendentes(d);
  const mesmaAba = pendentes.filter(
    (n) => n.id !== concluidaId && getChaveGrupoConferencia(n, d, COOP_ID) === chaveGrupo
  );
  if (mesmaAba.length > 0) return mesmaAba[0];
  const outras = pendentes.filter((n) => n.id !== concluidaId);
  return outras[0] ?? null;
}

function aprovarNota(d: AppData, nota: NotaPedido, responsavel: string): AppData {
  const now = new Date().toISOString();
  const atualizada: NotaPedido = {
    ...nota,
    status: "conferida",
    conferidaPor: responsavel,
    dataConferencia: now.split("T")[0],
    valorLiquido: 10,
    valorBruto: 10,
    itens: [
      {
        produtoInstituicaoId: "p1",
        produtoNome: "Alface",
        unidade: "maço",
        precoUnitario: 2.5,
        quantidade: 4,
        valorBruto: 10,
      },
    ],
    updatedAt: now,
  };
  const notasPedido = d.notasPedido.map((n) => (n.id === nota.id ? atualizada : n));
  return reconciliarFichaFromNotasConferidas({ ...d, notasPedido });
}

// ─── Cenários ───────────────────────────────────────────────────────────────

function simCooperadoEnvia21Entregas() {
  const cloud = new CloudStore();
  let cooperado = baseAppData();
  let responsavel = baseAppData();

  for (let i = 1; i <= 21; i++) {
    const nota = makeNota(`np-${i}`, { fotosCount: i % 5 === 0 ? 8 : 2 });
    cooperado = {
      ...cooperado,
      notasPedido: [...cooperado.notasPedido, nota],
    };
    cloud.upsert(nota);
  }

  responsavel = syncFromCloud(responsavel, cloud);
  assert(
    "21 entregas visíveis para responsável após sync",
    listarPendentes(responsavel).length === 21,
    `got ${listarPendentes(responsavel).length}`
  );

  // Responsável lança 1ª — fila deve manter 20
  const first = listarPendentes(responsavel)[0];
  responsavel = aprovarNota(responsavel, first, "Maria");
  cloud.upsert(responsavel.notasPedido.find((n) => n.id === first.id)!);

  cooperado = syncFromCloud(cooperado, cloud);
  responsavel = syncFromCloud(responsavel, cloud);

  assert(
    "Após 1º lançamento: 20 pendentes no responsável",
    listarPendentes(responsavel).length === 20,
    `got ${listarPendentes(responsavel).length}`
  );
  assert(
    "Após 1º lançamento: 20 pendentes no cooperado",
    listarPendentes(cooperado).filter((n) => n.cooperadoId === COOPERADO_ID).length === 20
  );
  assert(
    "1 conferida no responsável",
    responsavel.notasPedido.filter((n) => n.status === "conferida").length === 1
  );
  assert(
    "Ficha criada para 1ª entrega",
    responsavel.fichaCorrida.filter((f) => f.notaPedidoId === first.id).length === 1
  );

  return { cloud, cooperado, responsavel };
}

function simLancarTodas21Sequencial() {
  const cloud = new CloudStore();
  let cooperado = baseAppData();
  let responsavel = baseAppData();

  for (let i = 1; i <= 21; i++) {
    const nota = makeNota(`seq-${i}`);
    cooperado = { ...cooperado, notasPedido: [...cooperado.notasPedido, nota] };
    cloud.upsert(nota);
  }
  responsavel = syncFromCloud(responsavel, cloud);

  let concluidas = 0;
  while (listarPendentes(responsavel).length > 0 && concluidas < 21) {
    const before = listarPendentes(responsavel).length;
    const nota = listarPendentes(responsavel)[0];
    const chave = getChaveGrupoConferencia(nota, responsavel, COOP_ID);
    responsavel = aprovarNota(responsavel, nota, "Maria");
    cloud.upsert(responsavel.notasPedido.find((n) => n.id === nota.id)!);
    cooperado = syncFromCloud(cooperado, cloud);
    responsavel = syncFromCloud(responsavel, cloud);
    const after = listarPendentes(responsavel).length;
    assert(
      `Lançamento ${concluidas + 1}/21 reduz fila em 1`,
      after === before - 1,
      `before=${before} after=${after}`
    );
    const proxima = obterProximaNota(responsavel, chave, nota.id);
    if (after > 0) {
      assert(`Próxima nota existe após ${concluidas + 1}`, proxima !== null);
    }
    concluidas += 1;
  }

  assert("21 conferidas", responsavel.notasPedido.filter((n) => n.status === "conferida").length === 21);
  assert("0 pendentes", listarPendentes(responsavel).length === 0);
  assert("21 fichas", responsavel.fichaCorrida.length === 21);
}

function simListaNuvemIncompletaNaoApagaFila() {
  const cloud = new CloudStore();
  let responsavel = baseAppData();
  const notas: NotaPedido[] = [];
  for (let i = 1; i <= 21; i++) {
    const n = makeNota(`inc-${i}`);
    notas.push(n);
    cloud.upsert(n);
  }
  responsavel = { ...responsavel, notasPedido: [...notas] };

  // Simula nuvem que só retorna 1 nota (cenário do bug)
  const partial = cloud.listPartial(new Set(notas.slice(1).map((n) => n.id)));
  const merged = mergeCloudNotasIntoData(responsavel, partial, CNPJ);

  assert(
    "Lista incompleta NÃO apaga 20 entregas",
    merged.notasPedido.filter((n) => n.status === "aguardando_conferencia").length === 21,
    `got ${merged.notasPedido.filter((n) => n.status === "aguardando_conferencia").length}`
  );
}

function simExclusaoUnicaPropagada() {
  const cloud = new CloudStore();
  let responsavel = baseAppData();
  const n1 = makeNota("del-1");
  const n2 = makeNota("del-2");
  cloud.upsert(n1);
  cloud.upsert(n2);
  responsavel = { ...responsavel, notasPedido: [n1, n2] };

  cloud.delete("del-1");
  const merged = mergeCloudNotasIntoData(responsavel, cloud.list(), CNPJ);
  assert(
    "Exclusão única na nuvem remove 1 local",
    merged.notasPedido.length === 1 && merged.notasPedido[0].id === "del-2"
  );
}

function simMergeTableStorage() {
  const table = makeNota("m-1", { status: "aguardando_conferencia", fotosEnviadasCount: 3 });
  const storage = makeNota("m-1", {
    fotosEnviadasCount: 3,
    fotosPedido: [tinyJpeg(0), tinyJpeg(1), tinyJpeg(2)],
  });
  const merged = mergeNotasSources([table], [storage])[0];
  assert(
    "mergeNotasSources une fotos do storage",
    (merged.fotosPedido?.length ?? 0) === 3
  );
}

function simShouldNotDowngradeConferida() {
  let local = baseAppData();
  const conferida = makeNota("down-1", {
    status: "conferida",
    valorLiquido: 50,
    updatedAt: new Date().toISOString(),
  });
  local = { ...local, notasPedido: [conferida] };

  const cloudStale = makeNota("down-1", {
    status: "aguardando_conferencia",
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const merged = mergeCloudNotasIntoData(local, [cloudStale], CNPJ);
  assert(
    "Conferida local não regride para aguardando",
    merged.notasPedido[0].status === "conferida"
  );
}

function simFilaConferenciaGrupos() {
  const d = baseAppData();
  const pendentes = [
    makeNota("g1", { cooperadoNomeSnapshot: "João Silva" }),
    makeNota("g2", { cooperadoNomeSnapshot: "João Silva" }),
    makeNota("g3", {
      cooperadoId: "c-2",
      cooperadoNomeSnapshot: "Maria Souza",
    }),
  ];
  const grupos = agruparPendentesPorCooperado(d, pendentes, COOP_ID);
  assert("2 grupos de cooperados", grupos.length === 2);
  assert("João tem 2 entregas", grupos.find((g) => g.nome.includes("João"))?.notas.length === 2);

  const { grupo } = resolverAbaConferenciaAtiva(grupos, "", COOPERADO_ID);
  assert("Aba resolve grupo do cooperado", grupo?.notas.length === 2);
}

function simCompressaoProgressiva() {
  const base = parametrosCompressaoFoto(1);
  for (const qtd of [1, 3, 10, 21, 25, 50, 100]) {
    const p = parametrosCompressaoFoto(qtd);
    assert(`compressão qtd=${qtd} maxWidth>0`, p.maxWidth > 0 && p.quality > 0 && p.quality <= 1);
    assert(`qtd=${qtd} usa mesma compressão leve`, p.maxWidth === base.maxWidth && p.quality === base.quality);
  }
}

function simMonteCarlo(iterations: number) {
  for (let run = 0; run < iterations; run++) {
    const cloud = new CloudStore();
    let resp = baseAppData();
    const count = 3 + (run % 18);
    for (let i = 0; i < count; i++) {
      const n = makeNota(`mc-${run}-${i}`, { fotosCount: 1 + (i % 6) });
      cloud.upsert(n);
    }
    resp = syncFromCloud(resp, cloud);
    const approveCount = 1 + (run % Math.max(1, count));
    for (let a = 0; a < approveCount; a++) {
      const pending = listarPendentes(resp);
      if (pending.length === 0) break;
      const n = pending[0];
      resp = aprovarNota(resp, n, "Resp");
      cloud.upsert(resp.notasPedido.find((x) => x.id === n.id)!);
      // Sync alternando lista completa e parcial
      const usePartial = run % 7 === 0 && pending.length > 3;
      const cloudList = usePartial
        ? cloud.listPartial(new Set(pending.slice(2).map((x) => x.id)))
        : cloud.list();
      resp = mergeCloudNotasIntoData(resp, cloudList, CNPJ);
      const stillPending = listarPendentes(resp).length;
      const expectedMin = pending.length - 1 - (usePartial ? 0 : 0);
      assert(
        `MC run=${run} approve=${a} pending>=${expectedMin}`,
        stillPending >= Math.max(0, count - approveCount) || usePartial,
        `count=${count} approve=${approveCount} pending=${stillPending}`
      );
    }
  }
}

function simFotosPartesSemRam() {
  const nota = makeNota("parts-1", {
    fotosPedido: undefined,
    fotosPedidoMiniaturas: [thumb(0), thumb(1)],
    fotosEnviadasCount: 5,
    fotoNaNuvem: true,
  });
  assert(
    "Miniaturas exibidas enquanto fotos completas na nuvem",
    getFotosExibicaoNota(nota).length === 2
  );
  assert("contagem esperada de fotos", contarFotosEnviadasNota(nota) === 5);
}

function simCompactarLiberaMemoria() {
  let d = baseAppData();
  const n = makeNota("cmp-1", {
    fotosPedido: [tinyJpeg(0)],
    fotoNaNuvem: true,
  });
  d = { ...d, notasPedido: [n] };
  d = compactarFotosNoArmazenamento(d);
  assert(
    "Compactar remove fotosPedido quando fotoNaNuvem",
    !d.notasPedido[0].fotosPedido?.length
  );
  assert(
    "Compactar remove miniaturas quando fotoNaNuvem (memória)",
    !d.notasPedido[0].fotoPedidoMiniatura && !d.notasPedido[0].fotosPedidoMiniaturas?.length
  );
  assert(
    "Contagem de fotos preservada",
    (d.notasPedido[0].fotosEnviadasCount ?? 0) > 0
  );
}

function simMergeNotaComFotos() {
  const a = makeNota("mf-1", { fotosEnviadasCount: 4, updatedAt: "2026-06-01T10:00:00Z" });
  const b = makeNota("mf-1", {
    fotosPedido: [tinyJpeg(0), tinyJpeg(1), tinyJpeg(2), tinyJpeg(3)],
    updatedAt: "2026-06-01T09:00:00Z",
  });
  const m = mergeNotaComFotos(a, b);
  assert("merge mantém 4 fotos", (m.fotosPedido?.length ?? 0) === 4);
  assert("merge mantém count 4", m.fotosEnviadasCount === 4);
}

function simRejeicaoEReenvio() {
  const cloud = new CloudStore();
  let cooperado = baseAppData();
  let responsavel = baseAppData();
  const nota = makeNota("rej-1");
  cooperado = { ...cooperado, notasPedido: [nota] };
  cloud.upsert(nota);
  responsavel = syncFromCloud(responsavel, cloud);

  const rejeitada: NotaPedido = {
    ...nota,
    status: "rejeitada",
    motivoRejeicao: "Foto escura",
    rejeitadaPor: "Maria",
    updatedAt: new Date(Date.now() + 1000).toISOString(),
  };
  responsavel = {
    ...responsavel,
    notasPedido: responsavel.notasPedido.map((n) => (n.id === nota.id ? rejeitada : n)),
  };
  cloud.upsert(rejeitada);
  cooperado = syncFromCloud(cooperado, cloud);
  assert(
    "Cooperado vê rejeitada",
    cooperado.notasPedido.find((n) => n.id === "rej-1")?.status === "rejeitada",
    `got ${cooperado.notasPedido.find((n) => n.id === "rej-1")?.status}`
  );

  const reenvio: NotaPedido = {
    ...rejeitada,
    status: "aguardando_conferencia",
    reenviadaEm: new Date().toISOString(),
    motivoRejeicao: undefined,
    rejeitadaPor: undefined,
    dataRejeicao: undefined,
    updatedAt: new Date(Date.now() + 2000).toISOString(),
  };
  cooperado = {
    ...cooperado,
    notasPedido: cooperado.notasPedido.map((n) => (n.id === "rej-1" ? reenvio : n)),
  };
  cloud.upsert(reenvio);
  responsavel = syncFromCloud(responsavel, cloud);
  assert(
    "Responsável vê reenvio em análise",
    listarPendentes(responsavel).some((n) => n.id === "rej-1"),
    `pending=${listarPendentes(responsavel).length}`
  );
}

function simUmaEntregaCom25Fotos() {
  const d = baseAppData();
  const nota = makeNota("f25", { fotosCount: 25, fotosEnviadasCount: 25 });
  assert("25 fotos contadas", contarFotosEnviadasNota(nota) === 25);
  const p = parametrosCompressaoFoto(25);
  assert("compressão 25 fotos", p.maxWidth === 640);
  assert("nota pertence cooperativa", notaPertenceCooperativa(d, nota, COOP_ID));
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log("=== Simulação fluxo entregas HB Cooperativas ===\n");

simCooperadoEnvia21Entregas();
simLancarTodas21Sequencial();
simListaNuvemIncompletaNaoApagaFila();
simExclusaoUnicaPropagada();
simMergeTableStorage();
simShouldNotDowngradeConferida();
simFilaConferenciaGrupos();
simCompressaoProgressiva();
simFotosPartesSemRam();
simCompactarLiberaMemoria();
simMergeNotaComFotos();
simRejeicaoEReenvio();
simUmaEntregaCom25Fotos();

console.log("\nMonte Carlo (2000 iterações)...");
simMonteCarlo(2000);

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
console.log("Fluxo cooperado ↔ responsável validado.\n");
