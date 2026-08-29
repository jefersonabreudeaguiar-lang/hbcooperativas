import type { AppData, AuditEntry, ParecerContabilMensal, User } from "@/types";
import { getCooperadoNome, round2, sumBy } from "@/utils/calculations";
import {
  getResumoPagamentoCooperado,
  listarFichasExtratoCooperadoMes,
} from "@/services/notaPedidoService";
import { generateId, addAuditEntry } from "@/services/dataStore";

export interface LinhaRazaoAnalitico {
  data: string;
  tipo: "credito" | "desconto" | "pagamento";
  descricao: string;
  valor: number;
  saldo: number;
  referencia?: string;
}

export interface RazaoAnaliticoCooperado {
  cooperadoId: string;
  cooperadoNome: string;
  mesReferencia: string;
  linhas: LinhaRazaoAnalitico[];
  totalCreditos: number;
  totalDescontos: number;
  totalPago: number;
  saldoFinal: number;
}

export interface LinhaMapaReceitaContrato {
  instituicaoId: string;
  instituicaoNome: string;
  qtdEntregas: number;
  valorBruto: number;
  valorLiquido: number;
}

export interface MapaReceitasContrato {
  mesReferencia: string;
  linhas: LinhaMapaReceitaContrato[];
  totalBruto: number;
  totalLiquido: number;
}

export interface LinhaExtratoContaCoop {
  cooperadoId: string;
  cooperadoNome: string;
  motivo: string;
  valor: number;
}

export interface ExtratoContaCoopMes {
  mesReferencia: string;
  linhas: LinhaExtratoContaCoop[];
  total: number;
}

export function getRazaoAnaliticoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): RazaoAnaliticoCooperado {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const fichas = listarFichasExtratoCooperadoMes(data, cooperadoId, mesReferencia, cooperativaId);
  const linhas: LinhaRazaoAnalitico[] = [];
  let saldo = 0;

  for (const f of fichas.sort(
    (a, b) => new Date(a.dataLancamento).getTime() - new Date(b.dataLancamento).getTime()
  )) {
    saldo = round2(saldo + f.valorLiquido);
    linhas.push({
      data: f.dataLancamento.split("T")[0],
      tipo: "credito",
      descricao: f.descricao,
      valor: f.valorLiquido,
      saldo,
      referencia: f.notaPedidoId,
    });
    for (const d of f.descontosDetalhe ?? []) {
      if (d.tipo === "credito_avulso") continue;
      saldo = round2(saldo - d.valor);
      linhas.push({
        data: f.dataLancamento.split("T")[0],
        tipo: "desconto",
        descricao: d.motivo,
        valor: -d.valor,
        saldo,
      });
    }
  }

  const resumo = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, cooperativaId);
  for (const d of resumo.descontosExtras.filter((x) => x.tipo !== "credito_avulso")) {
    saldo = round2(saldo - d.valor);
    linhas.push({
      data: mesReferencia + "-01",
      tipo: "desconto",
      descricao: d.motivo,
      valor: -d.valor,
      saldo,
    });
  }
  for (const d of resumo.descontosExtras.filter((x) => x.tipo === "credito_avulso")) {
    saldo = round2(saldo + d.valor);
    linhas.push({
      data: mesReferencia + "-01",
      tipo: "credito",
      descricao: d.motivo,
      valor: d.valor,
      saldo,
    });
  }

  const pg = data.pagamentosCooperado.find(
    (p) => p.cooperadoId === cooperadoId && p.mesReferencia === mesReferencia && p.status === "confirmado"
  );
  if (pg) {
    saldo = round2(saldo - pg.valorLiquido);
    linhas.push({
      data: pg.pagoEm.split("T")[0],
      tipo: "pagamento",
      descricao: `Pagamento registrado por ${pg.pagoPor}`,
      valor: -pg.valorLiquido,
      saldo,
      referencia: pg.id,
    });
  }

  const totalCreditos = round2(
    linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)
  );
  const totalDescontos = round2(
    Math.abs(linhas.filter((l) => l.valor < 0 && l.tipo === "desconto").reduce((s, l) => s + l.valor, 0))
  );
  const totalPago = pg?.valorLiquido ?? 0;

  return {
    cooperadoId,
    cooperadoNome: cooperado?.nomeCompleto ?? getCooperadoNome(data.cooperados, cooperadoId),
    mesReferencia,
    linhas,
    totalCreditos,
    totalDescontos,
    totalPago,
    saldoFinal: round2(resumo.valorLiquido - totalPago),
  };
}

export function getRazaoAnaliticoTodosCooperados(
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string
): RazaoAnaliticoCooperado[] {
  const coopId = cooperativaId ?? data.cooperativas[0]?.id;
  const cooperados = data.cooperados.filter((c) => !coopId || c.cooperativaId === coopId);
  return cooperados
    .map((c) => getRazaoAnaliticoCooperado(data, c.id, mesReferencia, coopId))
    .filter((r) => r.linhas.length > 0)
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));
}

export function getMapaReceitasContrato(
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string
): MapaReceitasContrato {
  const notas = data.notasPedido.filter(
    (n) =>
      n.mesReferencia === mesReferencia &&
      (n.status === "conferida" || n.status === "pago") &&
      (!cooperativaId || n.cooperativaId === cooperativaId)
  );

  const map = new Map<string, LinhaMapaReceitaContrato>();
  for (const n of notas) {
    const inst = data.instituicoes.find((i) => i.id === n.instituicaoId);
    const nome = n.escolaAvulsaNome?.trim() || inst?.nome || "Instituição";
    const cur = map.get(n.instituicaoId) ?? {
      instituicaoId: n.instituicaoId,
      instituicaoNome: nome,
      qtdEntregas: 0,
      valorBruto: 0,
      valorLiquido: 0,
    };
    cur.qtdEntregas += 1;
    cur.valorBruto = round2(cur.valorBruto + n.valorBruto);
    cur.valorLiquido = round2(cur.valorLiquido + n.valorLiquido);
    map.set(n.instituicaoId, cur);
  }

  const linhas = [...map.values()].sort((a, b) => a.instituicaoNome.localeCompare(b.instituicaoNome, "pt-BR"));
  return {
    mesReferencia,
    linhas,
    totalBruto: round2(sumBy(linhas, (l) => l.valorBruto)),
    totalLiquido: round2(sumBy(linhas, (l) => l.valorLiquido)),
  };
}

export function getExtratoContaCoopMes(data: AppData, mesReferencia: string, cooperativaId?: string): ExtratoContaCoopMes {
  const coopId = cooperativaId ?? data.cooperativas[0]?.id;
  const linhas: LinhaExtratoContaCoop[] = [];

  for (const f of data.fichaCorrida.filter(
    (x) => x.mesReferencia === mesReferencia && (!coopId || x.cooperativaId === coopId)
  )) {
    for (const d of f.descontosDetalhe ?? []) {
      if (d.tipo !== "conta_coop" || d.valor <= 0) continue;
      linhas.push({
        cooperadoId: f.cooperadoId,
        cooperadoNome: f.cooperadoNomeSnapshot ?? getCooperadoNome(data.cooperados, f.cooperadoId),
        motivo: d.motivo,
        valor: d.valor,
      });
    }
  }

  for (const p of data.pagamentosCooperado.filter((pg) => pg.mesReferencia === mesReferencia)) {
    for (const d of p.descontosExtras ?? []) {
      if (d.tipo !== "conta_coop" || d.valor <= 0) continue;
      linhas.push({
        cooperadoId: p.cooperadoId,
        cooperadoNome: getCooperadoNome(data.cooperados, p.cooperadoId),
        motivo: d.motivo,
        valor: d.valor,
      });
    }
  }

  return {
    mesReferencia,
    linhas: linhas.sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR")),
    total: round2(sumBy(linhas, (l) => l.valor)),
  };
}

export function auditLogParaExportacao(data: AppData, mesReferencia?: string): AuditEntry[] {
  return data.auditLog
    .filter((e) => !mesReferencia || e.timestamp.startsWith(mesReferencia) || e.changes?.includes(mesReferencia))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getParecerContabilMes(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string
): ParecerContabilMensal | undefined {
  return (data.pareceresContabeis ?? []).find(
    (p) => p.cooperativaId === cooperativaId && p.mesReferencia === mesReferencia
  );
}

export function salvarParecerContabil(
  data: AppData,
  actor: Pick<User, "id" | "name" | "funcao">,
  cooperativaId: string,
  mesReferencia: string,
  texto: string,
  assinaturaDataUrl?: string
): AppData {
  const now = new Date().toISOString();
  const existing = getParecerContabilMes(data, cooperativaId, mesReferencia);
  const parecer: ParecerContabilMensal = {
    id: existing?.id ?? generateId("parecer"),
    cooperativaId,
    mesReferencia,
    texto: texto.trim(),
    contadorNome: actor.name,
    contadorFuncao: actor.funcao?.trim() || "Contador",
    assinaturaDataUrl: assinaturaDataUrl ?? existing?.assinaturaDataUrl,
    emitidoEm: now,
    emitidoPorUserId: actor.id,
    updatedAt: now,
  };

  const others = (data.pareceresContabeis ?? []).filter(
    (p) => !(p.cooperativaId === cooperativaId && p.mesReferencia === mesReferencia)
  );

  return addAuditEntry(
    { ...data, pareceresContabeis: [parecer, ...others] },
    {
      entityType: "parecer_contabil",
      entityId: parecer.id,
      action: existing ? "editar" : "criar",
      userId: actor.id,
      userName: actor.name,
      changes: `Parecer contábil ${mesReferencia}${assinaturaDataUrl ? " (assinado)" : ""}`,
    }
  );
}
