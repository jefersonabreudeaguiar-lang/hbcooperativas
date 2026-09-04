import type { AppData, Cooperado } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

export interface CooperadoAberturaRow {
  cooperadoId: string;
  nome: string;
  cooperativaId: string;
  cooperativaNome: string;
  cooperativaCnpj: string;
  aberturas: number;
  ultimoAcessoEm?: string;
  ultimoAcessoModo?: Cooperado["ultimoAcessoModo"];
  appInstalado: boolean;
  status: Cooperado["status"];
}

export interface CooperativaAberturaResumo {
  cooperativaId: string;
  cooperativaNome: string;
  cooperativaCnpj: string;
  totalCooperados: number;
  cooperadosComAbertura: number;
  totalAberturas: number;
  mediaAberturas: number;
  cooperados: CooperadoAberturaRow[];
}

export interface LevantamentoAberturasApp {
  geradoEm: string;
  totalCooperados: number;
  cooperadosComAbertura: number;
  totalAberturas: number;
  mediaAberturasPorCooperado: number;
  mediaAberturasPorCooperativa: number;
  cooperativas: CooperativaAberturaResumo[];
  topCooperados: CooperadoAberturaRow[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function contagemAberturasCooperado(c: Cooperado): number {
  return Math.max(0, c.aberturasAppTotal ?? 0);
}

export function buildCooperadoAberturaRow(
  c: Cooperado,
  meta: { cooperativaId: string; cooperativaNome: string; cooperativaCnpj: string }
): CooperadoAberturaRow {
  return {
    cooperadoId: c.id,
    nome: c.nomeCompleto,
    cooperativaId: meta.cooperativaId,
    cooperativaNome: meta.cooperativaNome,
    cooperativaCnpj: meta.cooperativaCnpj,
    aberturas: contagemAberturasCooperado(c),
    ultimoAcessoEm: c.ultimoAcessoEm,
    ultimoAcessoModo: c.ultimoAcessoModo,
    appInstalado: Boolean(c.appInstaladoEm),
    status: c.status,
  };
}

export function buildCooperativaAberturaResumo(
  cooperados: Cooperado[],
  meta: { cooperativaId: string; cooperativaNome: string; cooperativaCnpj: string }
): CooperativaAberturaResumo {
  const rows = cooperados
    .filter((c) => c.status === "ativo" && !c.avulso)
    .map((c) => buildCooperadoAberturaRow(c, meta))
    .sort((a, b) => b.aberturas - a.aberturas || a.nome.localeCompare(b.nome, "pt-BR"));

  const totalAberturas = rows.reduce((sum, row) => sum + row.aberturas, 0);
  const cooperadosComAbertura = rows.filter((row) => row.aberturas > 0).length;

  return {
    cooperativaId: meta.cooperativaId,
    cooperativaNome: meta.cooperativaNome,
    cooperativaCnpj: meta.cooperativaCnpj,
    totalCooperados: rows.length,
    cooperadosComAbertura,
    totalAberturas,
    mediaAberturas: rows.length > 0 ? round1(totalAberturas / rows.length) : 0,
    cooperados: rows,
  };
}

export function buildLevantamentoAberturasApp(
  grupos: CooperativaAberturaResumo[]
): LevantamentoAberturasApp {
  const cooperativas = [...grupos].sort((a, b) =>
    b.mediaAberturas - a.mediaAberturas || a.cooperativaNome.localeCompare(b.cooperativaNome, "pt-BR")
  );

  const totalCooperados = cooperativas.reduce((sum, coop) => sum + coop.totalCooperados, 0);
  const cooperadosComAbertura = cooperativas.reduce((sum, coop) => sum + coop.cooperadosComAbertura, 0);
  const totalAberturas = cooperativas.reduce((sum, coop) => sum + coop.totalAberturas, 0);
  const topCooperados = cooperativas
    .flatMap((coop) => coop.cooperados)
    .filter((row) => row.aberturas > 0)
    .sort((a, b) => b.aberturas - a.aberturas || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, 20);

  const mediasCooperativas = cooperativas.filter((coop) => coop.totalCooperados > 0).map((coop) => coop.mediaAberturas);

  return {
    geradoEm: new Date().toISOString(),
    totalCooperados,
    cooperadosComAbertura,
    totalAberturas,
    mediaAberturasPorCooperado: totalCooperados > 0 ? round1(totalAberturas / totalCooperados) : 0,
    mediaAberturasPorCooperativa:
      mediasCooperativas.length > 0
        ? round1(mediasCooperativas.reduce((sum, media) => sum + media, 0) / mediasCooperativas.length)
        : 0,
    cooperativas,
    topCooperados,
  };
}

export function mesclarCooperadoAberturas(local: Cooperado, remoto: Cooperado): Cooperado {
  const aberturasAppTotal = Math.max(local.aberturasAppTotal ?? 0, remoto.aberturasAppTotal ?? 0);
  return {
    ...remoto,
    ...local,
    aberturasAppTotal: aberturasAppTotal || undefined,
    appInstaladoEm: local.appInstaladoEm ?? remoto.appInstaladoEm,
    ultimoAcessoEm:
      !local.ultimoAcessoEm || !remoto.ultimoAcessoEm
        ? local.ultimoAcessoEm ?? remoto.ultimoAcessoEm
        : new Date(local.ultimoAcessoEm).getTime() >= new Date(remoto.ultimoAcessoEm).getTime()
          ? local.ultimoAcessoEm
          : remoto.ultimoAcessoEm,
    ultimoAcessoModo: local.ultimoAcessoModo ?? remoto.ultimoAcessoModo,
  };
}

export function buildLevantamentoFromAppData(data: AppData): LevantamentoAberturasApp {
  const grupos = data.cooperativas.map((coop) =>
    buildCooperativaAberturaResumo(
      data.cooperados.filter((c) => c.cooperativaId === coop.id),
      {
        cooperativaId: coop.id,
        cooperativaNome: coop.nome,
        cooperativaCnpj: normalizeCnpj(coop.cnpj),
      }
    )
  );
  return buildLevantamentoAberturasApp(grupos);
}

/** Combina levantamento da nuvem com cooperados locais do aparelho admin. */
export function mergeLevantamentoComDadosLocais(
  remoto: LevantamentoAberturasApp,
  data: AppData
): LevantamentoAberturasApp {
  const local = buildLevantamentoFromAppData(data);
  const byCnpj = new Map<string, CooperativaAberturaResumo>();

  for (const coop of remoto.cooperativas) {
    byCnpj.set(coop.cooperativaCnpj, coop);
  }

  for (const coopLocal of local.cooperativas) {
    const existente = byCnpj.get(coopLocal.cooperativaCnpj);
    if (!existente) {
      byCnpj.set(coopLocal.cooperativaCnpj, coopLocal);
      continue;
    }

    const porId = new Map<string, CooperadoAberturaRow>();
    for (const row of existente.cooperados) porId.set(row.cooperadoId, row);
    for (const row of coopLocal.cooperados) {
      const atual = porId.get(row.cooperadoId);
      if (!atual || row.aberturas > atual.aberturas) {
        porId.set(row.cooperadoId, { ...row, cooperativaNome: existente.cooperativaNome });
      }
    }

    const cooperados = [...porId.values()].sort(
      (a, b) => b.aberturas - a.aberturas || a.nome.localeCompare(b.nome, "pt-BR")
    );
    const totalAberturas = cooperados.reduce((sum, row) => sum + row.aberturas, 0);
    byCnpj.set(coopLocal.cooperativaCnpj, {
      ...existente,
      totalCooperados: cooperados.length,
      cooperadosComAbertura: cooperados.filter((row) => row.aberturas > 0).length,
      totalAberturas,
      mediaAberturas: cooperados.length > 0 ? round1(totalAberturas / cooperados.length) : 0,
      cooperados,
    });
  }

  return buildLevantamentoAberturasApp([...byCnpj.values()]);
}
