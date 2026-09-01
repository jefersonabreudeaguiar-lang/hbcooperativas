/**
 * Simulação massiva do fluxo cooperado ↔ nuvem ↔ responsável.
 * Executar: npx tsx scripts/simulate-entrega-flow.ts
 */

import type { AppData, NotaPedido } from "../src/types";
import { mergeCloudNotasIntoData, queueNotaDelete, unqueueNotaDelete } from "../src/services/notaPedidoCloudService";
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
import { reconciliarFichaFromNotasConferidas, dedupeFichaCorridaPorNota, getResumoPagamentoCooperado, fichaValidaNoExtrato } from "../src/services/notaPedidoService";
import {
  notasSyncProvavelmenteCompleto,
  precisaReparoFullSyncNotas,
  fichaPreservarSemNotaLocal,
} from "../src/services/fichaSyncGuard";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { protectNotaAgainstStatusDowngrade } from "../src/utils/notaStatus";

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
  const outras = listarPendentes(d)
    .filter((n) => n.id !== concluidaId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const mesmaAba = outras.filter(
    (n) => getChaveGrupoConferencia(n, d, COOP_ID) === chaveGrupo
  );
  if (mesmaAba.length > 0) return mesmaAba[0];
  if (outras.length > 0) {
    const proximoGrupo = agruparPendentesPorCooperado(d, outras, COOP_ID)[0];
    if (proximoGrupo) {
      const filaGrupo = outras.filter(
        (n) => getChaveGrupoConferencia(n, d, COOP_ID) === proximoGrupo.chave
      );
      return filaGrupo[0];
    }
    return outras[0];
  }
  return null;
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
  const n1 = makeNota("del-1", { status: "rejeitada" });
  const n2 = makeNota("del-2", { status: "rejeitada" });
  cloud.upsert(n1);
  cloud.upsert(n2);
  responsavel = { ...responsavel, notasPedido: [n1, n2] };

  cloud.delete("del-1");
  const merged = mergeCloudNotasIntoData(responsavel, cloud.list(), CNPJ);
  assert(
    "Exclusão única de rejeitada na nuvem remove 1 local",
    merged.notasPedido.length === 1 && merged.notasPedido[0].id === "del-2"
  );
}

function simAguardandoAusenteNaListaNaoApaga() {
  const cloud = new CloudStore();
  let local = baseAppData();
  const emAnalise = makeNota("keep-ag", {
    status: "aguardando_conferencia",
    fotoNaNuvem: true,
    fotosEnviadasCount: 2,
  });
  const outra = makeNota("other-ag", {
    status: "aguardando_conferencia",
    fotoNaNuvem: true,
    fotosEnviadasCount: 1,
  });
  cloud.upsert(outra);
  // emAnalise ainda rascunho na nuvem → filtrada da lista (como a API faz)
  local = { ...local, notasPedido: [emAnalise, outra] };

  const merged = mergeCloudNotasIntoData(local, cloud.list(), CNPJ);
  assert(
    "aguardando_conferencia local ausente da lista NÃO é apagada",
    merged.notasPedido.some((n) => n.id === "keep-ag"),
    `ids=${merged.notasPedido.map((n) => n.id).join(",")}`
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

function simStickyAguardandoNaoSomeNoSync() {
  let local = baseAppData();
  const pendente = makeNota("sticky-1", {
    status: "aguardando_conferencia",
    updatedAt: new Date(Date.now() - 10_000).toISOString(),
  });
  local = { ...local, notasPedido: [pendente] };

  // Nuvem manda rascunho mais novo — fila do responsável deve manter em análise.
  const cloudRascunho = makeNota("sticky-1", {
    status: "rascunho",
    updatedAt: new Date().toISOString(),
  });
  let merged = mergeCloudNotasIntoData(local, [cloudRascunho], CNPJ);
  assert(
    "Sticky: rascunho na nuvem não tira da fila",
    merged.notasPedido[0].status === "aguardando_conferencia"
  );

  // Lista incompleta (delta sem a nota) — local permanece.
  merged = mergeCloudNotasIntoData(local, [], CNPJ);
  assert(
    "Sticky: lista vazia não apaga aguardando local",
    merged.notasPedido.some((n) => n.id === "sticky-1" && n.status === "aguardando_conferencia")
  );

  // Só some quando responsável lança (conferida).
  const cloudConferida = makeNota("sticky-1", {
    status: "conferida",
    valorLiquido: 40,
    updatedAt: new Date().toISOString(),
  });
  merged = mergeCloudNotasIntoData(local, [cloudConferida], CNPJ);
  assert(
    "Sticky: conferida remove da fila (status avançou)",
    merged.notasPedido[0].status === "conferida"
  );

  // entregue na nuvem não tira aguardando local da fila.
  local = { ...local, notasPedido: [pendente] };
  const cloudEntregue = makeNota("sticky-1", {
    status: "entregue",
    updatedAt: new Date().toISOString(),
  });
  merged = mergeCloudNotasIntoData(local, [cloudEntregue], CNPJ);
  assert(
    "Sticky: entregue na nuvem não tira aguardando da fila",
    merged.notasPedido[0].status === "aguardando_conferencia"
  );
}

/** Regressão: lista parcial da nuvem NÃO pode apagar outras entregas em análise. */
function simListaParcialNuncaEscondeAguardando() {
  let local = baseAppData();
  const a = makeNota("keep-a", { status: "aguardando_conferencia" });
  const b = makeNota("keep-b", { status: "aguardando_conferencia" });
  const c = makeNota("keep-c", { status: "aguardando_conferencia" });
  local = { ...local, notasPedido: [a, b, c] };

  // Nuvem só devolve uma das três (delta/storage incompleto).
  const merged = mergeCloudNotasIntoData(local, [{ ...a, updatedAt: new Date().toISOString() }], CNPJ);
  const pendentes = merged.notasPedido.filter((n) => n.status === "aguardando_conferencia");
  assert(
    "Lista parcial: mantém as 3 em análise",
    pendentes.length === 3 &&
      pendentes.some((n) => n.id === "keep-a") &&
      pendentes.some((n) => n.id === "keep-b") &&
      pendentes.some((n) => n.id === "keep-c"),
    `got ${pendentes.map((n) => n.id).join(",")}`
  );
}

/** Regressão: upload/reenvio com rascunho não pode sobrescrever aguardando/conferida. */
function simProtectUploadNaoRebaixaStatus() {
  const aguardando = makeNota("prot-1", { status: "aguardando_conferencia" });
  const rascunho = makeNota("prot-1", {
    status: "rascunho",
    updatedAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const protectedAguardando = protectNotaAgainstStatusDowngrade(aguardando, rascunho);
  assert(
    "Protect: rascunho não sobrescreve aguardando",
    protectedAguardando.status === "aguardando_conferencia"
  );

  const conferida = makeNota("prot-2", {
    status: "conferida",
    valorLiquido: 99,
    conferidaPor: "Resp",
  });
  const staleAguardando = makeNota("prot-2", {
    status: "aguardando_conferencia",
    updatedAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const protectedConferida = protectNotaAgainstStatusDowngrade(conferida, staleAguardando);
  assert(
    "Protect: aguardando não sobrescreve conferida",
    protectedConferida.status === "conferida" && protectedConferida.valorLiquido === 99
  );
}

/** Regressão: entrega nova na nuvem sempre entra na fila do responsável. */
function simNovaEntregaCooperadoApareceNoResponsavel() {
  let responsavel = baseAppData();
  const cloud = new CloudStore();

  const nova = makeNota("nova-1", {
    status: "aguardando_conferencia",
    fotoNaNuvem: true,
    updatedAt: new Date().toISOString(),
  });
  cloud.upsert(nova);

  responsavel = syncFromCloud(responsavel, cloud);
  assert(
    "Nova entrega do cooperado entra na fila do responsável",
    listarPendentes(responsavel).some((n) => n.id === "nova-1"),
    `pending=${listarPendentes(responsavel).map((n) => n.id).join(",")}`
  );

  // Sync seguinte com lista parcial (sem a nota) não pode esconder.
  const outras = makeNota("outra-1", { status: "conferida", valorLiquido: 10 });
  const merged = mergeCloudNotasIntoData(responsavel, [outras], CNPJ);
  assert(
    "Após lista parcial, nova entrega continua na fila",
    merged.notasPedido.some((n) => n.id === "nova-1" && n.status === "aguardando_conferencia")
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

  const cloudNewer = makeNota("down-1", {
    status: "aguardando_conferencia",
    updatedAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const merged2 = mergeCloudNotasIntoData(local, [cloudNewer], CNPJ);
  assert(
    "Conferida não regride mesmo com nuvem mais nova",
    merged2.notasPedido[0].status === "conferida"
  );

  const protectedNota = protectNotaAgainstStatusDowngrade(conferida, cloudNewer);
  assert("protect upsert bloqueia downgrade", protectedNota.status === "conferida");
  assert("protect mantém valor", protectedNota.valorLiquido === 50);
}

function simReconciliarValorAReceber() {
  let d = baseAppData();
  const conferida = makeNota("val-1", {
    status: "conferida",
    valorLiquido: 120,
    valorBruto: 130,
    valorDesconto: 10,
    itens: [
      {
        produtoInstituicaoId: "p1",
        produtoNome: "Alface",
        unidade: "kg",
        precoUnitario: 10,
        quantidade: 13,
        valorBruto: 130,
      },
    ],
  });
  d = { ...d, notasPedido: [conferida], fichaCorrida: [] };
  d = reconciliarFichaFromNotasConferidas(d);
  assert("ficha criada após conferida", d.fichaCorrida.length === 1);
  assert("valor ficha > 0", d.fichaCorrida[0].valorLiquido === 120);
}

function simDedupeFichaNaoDobraValor() {
  let d = baseAppData();
  const conferida = makeNota("dup-1", {
    status: "conferida",
    valorLiquido: 100,
    valorBruto: 105,
    valorDesconto: 5,
    itens: [
      {
        produtoInstituicaoId: "p1",
        produtoNome: "Alface",
        unidade: "kg",
        precoUnitario: 10,
        quantidade: 10.5,
        valorBruto: 105,
      },
    ],
  });
  const f1 = {
    id: "fc-local",
    cooperativaId: COOP_ID,
    cooperadoId: COOPERADO_ID,
    notaPedidoId: "dup-1",
    descricao: "Nota N-dup-1 — Escola",
    valorBruto: 105,
    descontos: 5,
    valorLiquido: 100,
    saldoAcumulado: 100,
    mesReferencia: "2026-06",
    status: "pendente" as const,
    dataLancamento: new Date().toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 1000).toISOString(),
  };
  const f2 = {
    ...f1,
    id: "fc-cloud",
    createdAt: new Date().toISOString(),
  };
  d = { ...d, notasPedido: [conferida], fichaCorrida: [f1, f2] };
  const deduped = dedupeFichaCorridaPorNota(d.fichaCorrida, d.notasPedido);
  assert("dedupe deixa 1 ficha por nota", deduped.length === 1);
  d = reconciliarFichaFromNotasConferidas({ ...d, fichaCorrida: [f1, f2] });
  assert("reconciliar remove duplicata", d.fichaCorrida.length === 1);
  const resumo = getResumoPagamentoCooperado(d, COOPERADO_ID, "2026-06", COOP_ID);
  assert("valor a receber não dobra", resumo.valorEntregas === 100, `got ${resumo.valorEntregas}`);
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

function simProximaNotaRespeitaGrupoAlfabetico() {
  const d = {
    ...baseAppData(),
    cooperados: [
      ...baseAppData().cooperados,
      {
        id: "c-2",
        cooperativaId: COOP_ID,
        nomeCompleto: "Ana Costa",
        cpfCnpj: "",
        telefone: "",
        endereco: "",
        comunidade: "",
        cafDap: "",
        chavePix: "",
        banco: "",
        agencia: "",
        conta: "",
        status: "ativo" as const,
        produtos: [],
        observacoes: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "c-3",
        cooperativaId: COOP_ID,
        nomeCompleto: "Maria Souza",
        cpfCnpj: "",
        telefone: "",
        endereco: "",
        comunidade: "",
        cafDap: "",
        chavePix: "",
        banco: "",
        agencia: "",
        conta: "",
        status: "ativo" as const,
        produtos: [],
        observacoes: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const joao = makeNota("joao-1", { createdAt: "2026-06-01T10:00:00.000Z" });
  const maria = makeNota("maria-1", {
    cooperadoId: "c-3",
    cooperadoNomeSnapshot: "Maria Souza",
    createdAt: "2026-06-01T08:00:00.000Z",
  });
  const ana = makeNota("ana-1", {
    cooperadoId: "c-2",
    cooperadoNomeSnapshot: "Ana Costa",
    createdAt: "2026-06-01T12:00:00.000Z",
  });
  const chaveJoao = getChaveGrupoConferencia(joao, d, COOP_ID);
  const proxima = obterProximaNota(
    { ...d, notasPedido: [joao, maria, ana] },
    chaveJoao,
    joao.id
  );
  assert(
    "Próxima nota ao trocar grupo segue ordem alfabética do cooperado",
    proxima?.id === ana.id,
    `expected ana-1 got ${proxima?.id ?? "null"}`
  );
}

function simMergeIgnoraNotaExclusaoPendente() {
  const storage = new Map<string, string>();
  const g = globalThis as typeof globalThis & {
    localStorage?: Storage;
  };
  const prev = g.localStorage;
  g.localStorage = {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    removeItem: (key: string) => {
      storage.delete(key);
    },
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  } as Storage;

  try {
    const local = baseAppData();
    const nota = makeNota("del-pending-1", { status: "aguardando_conferencia", valorLiquido: 0 });
    const semNota = { ...local, notasPedido: [] as typeof local.notasPedido };
    queueNotaDelete(CNPJ, nota.id);
    const merged = mergeCloudNotasIntoData(semNota, [nota], CNPJ);
    assert(
      "Merge não reimporta nota com exclusão pendente",
      !merged.notasPedido.some((n) => n.id === nota.id)
    );
    unqueueNotaDelete(CNPJ, nota.id);
  } finally {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
  }
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

function simPruneStaleConferidasOnFullSync() {
  let local = baseAppData();
  const fantasma = makeNota("fantasma-1", {
    status: "conferida",
    valorLiquido: 2000,
    valorBruto: 2100,
    fotoNaNuvem: true,
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
  });
  const valida = makeNota("valida-1", {
    status: "conferida",
    valorLiquido: 200,
    valorBruto: 211,
    fotoNaNuvem: true,
  });
  local = { ...local, notasPedido: [fantasma, valida] };

  // Delta parcial: não remove fantasma (lista incompleta).
  const mergedDelta = mergeCloudNotasIntoData(local, [valida], CNPJ);
  assert(
    "Delta parcial mantém conferida local ausente da nuvem",
    mergedDelta.notasPedido.some((n) => n.id === "fantasma-1")
  );

  // Sync completo: remove conferidas locais que não existem na nuvem.
  const mergedFull = mergeCloudNotasIntoData(local, [valida], CNPJ, { pruneStaleConferidas: true });
  assert(
    "Full sync remove conferida fantasma",
    !mergedFull.notasPedido.some((n) => n.id === "fantasma-1")
  );
  assert(
    "Full sync mantém conferida presente na nuvem",
    mergedFull.notasPedido.some((n) => n.id === "valida-1")
  );

  let comFicha = {
    ...mergedFull,
    notasPedido: [valida],
    notasPedidoExcluidas: [
      {
        id: "fantasma-1",
        cooperativaId: COOP_ID,
        excluidaEm: new Date().toISOString(),
        excluidaPor: "teste",
      },
    ],
    fichaCorrida: [
      {
        id: "fc-fant",
        cooperadoId: COOPERADO_ID,
        cooperativaId: COOP_ID,
        notaPedidoId: "fantasma-1",
        descricao: "Fantasma",
        mesReferencia: "2026-08",
        status: "pendente" as const,
        valorBruto: 2100,
        descontos: 100,
        valorLiquido: 2000,
        saldoAcumulado: 2000,
        dataLancamento: "2026-08-01",
        itens: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: "fc-ok",
        cooperadoId: COOPERADO_ID,
        cooperativaId: COOP_ID,
        notaPedidoId: "valida-1",
        descricao: "Válida",
        mesReferencia: "2026-08",
        status: "pendente" as const,
        valorBruto: 211,
        descontos: 11,
        valorLiquido: 200,
        saldoAcumulado: 200,
        dataLancamento: "2026-08-02",
        itens: [],
        createdAt: new Date().toISOString(),
      },
    ],
  };
  comFicha = reconciliarFichaFromNotasConferidas(comFicha);
  assert(
    "Reconciliar após prune remove ficha órfã",
    comFicha.fichaCorrida.every((f) => f.notaPedidoId !== "fantasma-1")
  );
  assert("Ficha válida permanece", comFicha.fichaCorrida.some((f) => f.notaPedidoId === "valida-1"));
}

function simFichaSyncGuardPreservaAteNotasChegarem() {
  const fichaNuvem = {
    id: "fc-cloud",
    cooperadoId: COOPERADO_ID,
    cooperativaId: COOP_ID,
    notaPedidoId: "nota-cloud-1",
    descricao: "Da nuvem",
    mesReferencia: "2026-08",
    status: "pendente" as const,
    valorBruto: 100,
    descontos: 5,
    valorLiquido: 95,
    saldoAcumulado: 95,
    dataLancamento: "2026-08-01",
    itens: [],
    createdAt: new Date().toISOString(),
  };
  let data = {
    ...baseAppData(),
    notasPedido: [],
    fichaCorrida: [fichaNuvem],
  };
  assert("Sync incompleto detectado", !notasSyncProvavelmenteCompleto(data, COOP_ID));
  assert("Precisa reparo full sync notas", precisaReparoFullSyncNotas(data, COOP_ID, COOPERADO_ID));
  assert(
    "Ficha preservada sem nota local (sync pendente)",
    fichaPreservarSemNotaLocal(data, fichaNuvem)
  );
  data = reconciliarFichaFromNotasConferidas(data);
  assert(
    "Reconciliar não apaga ficha antes das notas",
    data.fichaCorrida.some((f) => f.notaPedidoId === "nota-cloud-1")
  );

  const nota = makeNota("nota-cloud-1", { status: "conferida", valorLiquido: 95, valorBruto: 100 });
  data = reconciliarFichaFromNotasConferidas({ ...data, notasPedido: [nota] });
  assert("Após nota conferida, ficha permanece válida", fichaValidaNoExtrato(data, fichaNuvem));
  assert("Sync completo após notas", notasSyncProvavelmenteCompleto(data, COOP_ID));
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log("=== Simulação fluxo entregas HB Cooperativas ===\n");

simCooperadoEnvia21Entregas();
simLancarTodas21Sequencial();
simListaNuvemIncompletaNaoApagaFila();
simExclusaoUnicaPropagada();
simAguardandoAusenteNaListaNaoApaga();
simMergeTableStorage();
simShouldNotDowngradeConferida();
simPruneStaleConferidasOnFullSync();
simStickyAguardandoNaoSomeNoSync();
simListaParcialNuncaEscondeAguardando();
simProtectUploadNaoRebaixaStatus();
simNovaEntregaCooperadoApareceNoResponsavel();
simReconciliarValorAReceber();
simDedupeFichaNaoDobraValor();
simFilaConferenciaGrupos();
simProximaNotaRespeitaGrupoAlfabetico();
simMergeIgnoraNotaExclusaoPendente();
simCompressaoProgressiva();
simFotosPartesSemRam();
simCompactarLiberaMemoria();
simMergeNotaComFotos();
simRejeicaoEReenvio();
simUmaEntregaCom25Fotos();
simFichaSyncGuardPreservaAteNotasChegarem();

console.log("\nMonte Carlo (2000 iterações)...");
simMonteCarlo(2000);

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
console.log("Fluxo cooperado ↔ responsável validado.\n");
