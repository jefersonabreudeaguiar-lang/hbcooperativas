import type { AppData, AssinaturaCadastroStatus, Cooperado, User } from "@/types";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import { addAuditEntry } from "@/services/dataStore";
import {
  listarCooperadosComApp,
  resumoInstalacaoApp,
} from "@/services/cooperadoAppInstallService";
import {
  cpfCooperadoDigits,
  escolherCooperadoCanonico,
  nomeNormalizadoCooperado,
} from "@/utils/cooperadoDedupe";

function chaveCooperadoDedupe(c: Pick<Cooperado, "cpfCnpj" | "nomeCompleto">): string {
  const cpf = cpfCooperadoDigits(c.cpfCnpj);
  if (cpf.length >= 11) return `cpf:${cpf}`;
  return `nome:${nomeNormalizadoCooperado(c.nomeCompleto)}`;
}

/** Unifica assinatura quando o mesmo titular tem vários IDs (Ana, Cleones, etc.). */
export function mergeDuplicatasAssinaturaNaLista(cooperados: Cooperado[]): Cooperado[] {
  const ativos = cooperados.filter((c) => c.status !== "desligado");
  const byKey = new Map<string, Cooperado[]>();
  for (const c of ativos) {
    const key = chaveCooperadoDedupe(c);
    if (!key || key === "nome:") continue;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const out: Cooperado[] = [];
  for (const grupo of byKey.values()) {
    const canon = escolherCooperadoCanonico(grupo);
    let merged: Cooperado = { ...canon };
    for (const c of grupo) {
      if (c.id === canon.id) continue;
      merged = { ...merged, ...mergeAssinaturaCadastroFields(merged, c) };
      if (c.appInstaladoEm && (!merged.appInstaladoEm || c.appInstaladoEm < merged.appInstaladoEm)) {
        merged.appInstaladoEm = c.appInstaladoEm;
      }
    }
    out.push(merged);
  }
  return out.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}

function listarCooperadosElegiveisAssinatura(data: AppData, cooperativaId: string): Cooperado[] {
  return mergeDuplicatasAssinaturaNaLista(
    data.cooperados.filter(
      (c) => c.cooperativaId === cooperativaId && c.status === "ativo" && !c.avulso
    )
  );
}

/** Aviso “assinatura confirmada” some após 24 h. */
export const ASSINATURA_CONFIRMACAO_AVISO_MS = 24 * 60 * 60 * 1000;

type CooperadoAssinaturaFields = Pick<
  Cooperado,
  | "assinaturaCadastroDataUrl"
  | "assinaturaCadastradaEm"
  | "assinaturaCadastroVersao"
  | "assinaturaCadastroHash"
  | "assinaturaCadastroStatus"
  | "assinaturaConfirmadaEm"
  | "assinaturaConfirmadaPorId"
  | "assinaturaConfirmadaPorNome"
  | "assinaturaDevolvidaEm"
  | "assinaturaDevolvidaMotivo"
>;

export type AssinaturaCadastroMergeFields = CooperadoAssinaturaFields;

const ASSINATURA_STATUS_RANK: Record<AssinaturaCadastroStatus, number> = {
  pendente: 0,
  devolvida: 1,
  em_analise: 2,
  confirmada: 3,
};

function assinaturaEventMs(c: CooperadoAssinaturaFields): number {
  const times = [c.assinaturaConfirmadaEm, c.assinaturaCadastradaEm, c.assinaturaDevolvidaEm].filter(
    Boolean
  ) as string[];
  if (times.length === 0) return 0;
  return Math.max(...times.map((t) => new Date(t).getTime()).filter((n) => !Number.isNaN(n)));
}

function pickAssinaturaCadastroFields(c: Cooperado): AssinaturaCadastroMergeFields {
  return {
    assinaturaCadastroDataUrl: c.assinaturaCadastroDataUrl,
    assinaturaCadastradaEm: c.assinaturaCadastradaEm,
    assinaturaCadastroVersao: c.assinaturaCadastroVersao,
    assinaturaCadastroHash: c.assinaturaCadastroHash,
    assinaturaCadastroStatus: c.assinaturaCadastroStatus,
    assinaturaConfirmadaEm: c.assinaturaConfirmadaEm,
    assinaturaConfirmadaPorId: c.assinaturaConfirmadaPorId,
    assinaturaConfirmadaPorNome: c.assinaturaConfirmadaPorNome,
    assinaturaDevolvidaEm: c.assinaturaDevolvidaEm,
    assinaturaDevolvidaMotivo: c.assinaturaDevolvidaMotivo,
  };
}

/** Evita que sync na nuvem reverta conferência ou apague envio do cooperado. */
export function mergeAssinaturaCadastroFields(
  local: Cooperado,
  cloud: Cooperado
): AssinaturaCadastroMergeFields {
  const vLocal = local.assinaturaCadastroVersao ?? 0;
  const vCloud = cloud.assinaturaCadastroVersao ?? 0;
  if (vCloud > vLocal) return pickAssinaturaCadastroFields(cloud);
  if (vLocal > vCloud) return pickAssinaturaCadastroFields(local);

  const rankLocal = ASSINATURA_STATUS_RANK[getAssinaturaCadastroStatus(local)];
  const rankCloud = ASSINATURA_STATUS_RANK[getAssinaturaCadastroStatus(cloud)];
  if (rankLocal !== rankCloud) {
    return rankLocal > rankCloud
      ? pickAssinaturaCadastroFields(local)
      : pickAssinaturaCadastroFields(cloud);
  }

  const tLocal = assinaturaEventMs(local);
  const tCloud = assinaturaEventMs(cloud);
  if (tLocal !== tCloud) {
    return tLocal > tCloud ? pickAssinaturaCadastroFields(local) : pickAssinaturaCadastroFields(cloud);
  }

  const urlLocal = getAssinaturaCadastroDataUrl(local);
  const urlCloud = getAssinaturaCadastroDataUrl(cloud);
  if (urlLocal && !urlCloud) return pickAssinaturaCadastroFields(local);
  if (urlCloud && !urlLocal) return pickAssinaturaCadastroFields(cloud);

  return pickAssinaturaCadastroFields(local);
}

export function assinaturaCadastroFieldsChanged(
  before: CooperadoAssinaturaFields,
  after: AssinaturaCadastroMergeFields
): boolean {
  return (
    before.assinaturaCadastroDataUrl !== after.assinaturaCadastroDataUrl ||
    before.assinaturaCadastradaEm !== after.assinaturaCadastradaEm ||
    before.assinaturaCadastroVersao !== after.assinaturaCadastroVersao ||
    before.assinaturaCadastroHash !== after.assinaturaCadastroHash ||
    before.assinaturaCadastroStatus !== after.assinaturaCadastroStatus ||
    before.assinaturaConfirmadaEm !== after.assinaturaConfirmadaEm ||
    before.assinaturaConfirmadaPorId !== after.assinaturaConfirmadaPorId ||
    before.assinaturaConfirmadaPorNome !== after.assinaturaConfirmadaPorNome ||
    before.assinaturaDevolvidaEm !== after.assinaturaDevolvidaEm ||
    before.assinaturaDevolvidaMotivo !== after.assinaturaDevolvidaMotivo
  );
}

export function getAssinaturaCadastroDataUrl(
  cooperado: Pick<Cooperado, "assinaturaCadastroDataUrl"> | null | undefined
): string | null {
  const url = cooperado?.assinaturaCadastroDataUrl?.trim();
  return url || null;
}

/** Legado: quem já tinha foto antes do fluxo de análise conta como confirmada. */
export function getAssinaturaCadastroStatus(
  cooperado: CooperadoAssinaturaFields | null | undefined
): AssinaturaCadastroStatus {
  if (!cooperado) return "pendente";
  if (cooperado.assinaturaCadastroStatus) return cooperado.assinaturaCadastroStatus;
  if (getAssinaturaCadastroDataUrl(cooperado)) return "confirmada";
  return "pendente";
}

export function cooperadoAssinaturaEmAnalise(cooperado: CooperadoAssinaturaFields | null | undefined): boolean {
  return getAssinaturaCadastroStatus(cooperado) === "em_analise";
}

export function cooperadoAssinaturaDevolvida(cooperado: CooperadoAssinaturaFields | null | undefined): boolean {
  return getAssinaturaCadastroStatus(cooperado) === "devolvida";
}

export function cooperadoAssinaturaConfirmada(cooperado: CooperadoAssinaturaFields | null | undefined): boolean {
  return getAssinaturaCadastroStatus(cooperado) === "confirmada";
}

/** Pode aplicar a firma em recibos, votações e atas (enviada ou já confirmada pela diretoria). */
export function cooperadoPodeUsarAssinaturaEmDocumentos(
  cooperado: CooperadoAssinaturaFields | null | undefined
): boolean {
  if (!getAssinaturaCadastroDataUrl(cooperado)) return false;
  const status = getAssinaturaCadastroStatus(cooperado);
  return status === "em_analise" || status === "confirmada";
}

export function cooperadoTemAssinaturaCadastrada(
  cooperado: CooperadoAssinaturaFields | null | undefined
): boolean {
  return cooperadoAssinaturaConfirmada(cooperado) && Boolean(getAssinaturaCadastroDataUrl(cooperado));
}

/** Exige cadastro (ou reenvio) antes de votar ou assinar recibo. */
export function cooperadoPrecisaCadastrarAssinatura(
  cooperadoId: string | undefined | null,
  cooperado: CooperadoAssinaturaFields | null | undefined
): boolean {
  if (!cooperadoUsaAssinaturaCadastroPilot(cooperadoId)) return false;
  const status = getAssinaturaCadastroStatus(cooperado);
  if (status === "em_analise") return false;
  if (status === "confirmada") return false;
  return status === "pendente" || status === "devolvida" || !getAssinaturaCadastroDataUrl(cooperado);
}

export function cooperadoMostrarAvisoAssinaturaConfirmada(
  cooperado: CooperadoAssinaturaFields | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!cooperadoAssinaturaConfirmada(cooperado)) return false;
  const em = cooperado?.assinaturaConfirmadaEm;
  if (!em) return false;
  const t = new Date(em).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t < ASSINATURA_CONFIRMACAO_AVISO_MS;
}

function patchCooperadoAssinatura(
  data: AppData,
  cooperadoId: string,
  patch: Partial<Cooperado>,
  audit: { userId: string; userName: string; changes: string }
): { ok: true; data: AppData; cooperado: Cooperado } | { ok: false; error: string } {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado) return { ok: false, error: "Cooperado não encontrado." };

  const now = new Date().toISOString();
  const atualizado: Cooperado = {
    ...cooperado,
    ...patch,
    updatedAt: now,
  };

  let next: AppData = {
    ...data,
    cooperados: data.cooperados.map((c) => (c.id === cooperadoId ? atualizado : c)),
  };

  next = addAuditEntry(next, {
    entityType: "cooperado",
    entityId: cooperadoId,
    action: "editar",
    userId: audit.userId,
    userName: audit.userName,
    changes: audit.changes,
  });

  return { ok: true, data: next, cooperado: atualizado };
}

export function salvarAssinaturaCadastroCooperado(
  data: AppData,
  cooperadoId: string,
  payload: { dataUrl: string; hash: string },
  actor: Pick<User, "id" | "name">
): { ok: true; data: AppData; cooperado: Cooperado } | { ok: false; error: string } {
  if (!cooperadoId?.trim()) {
    return { ok: false, error: "Cooperado não identificado." };
  }

  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado) return { ok: false, error: "Cooperado não encontrado." };

  const now = new Date().toISOString();
  const versao = (cooperado.assinaturaCadastroVersao ?? 0) + 1;

  return patchCooperadoAssinatura(
    data,
    cooperadoId,
    {
      assinaturaCadastroDataUrl: payload.dataUrl,
      assinaturaCadastradaEm: now,
      assinaturaCadastroVersao: versao,
      assinaturaCadastroHash: payload.hash,
      assinaturaCadastroStatus: "em_analise",
      assinaturaConfirmadaEm: undefined,
      assinaturaConfirmadaPorId: undefined,
      assinaturaConfirmadaPorNome: undefined,
      assinaturaDevolvidaEm: undefined,
      assinaturaDevolvidaMotivo: undefined,
    },
    {
      userId: actor.id,
      userName: actor.name,
      changes: `Assinatura enviada para análise (v${versao})`,
    }
  );
}

export function confirmarAssinaturaCadastroCooperado(
  data: AppData,
  cooperadoId: string,
  actor: Pick<User, "id" | "name">,
  imagemAjustada?: { dataUrl: string; hash: string }
): { ok: true; data: AppData; cooperado: Cooperado } | { ok: false; error: string } {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado) return { ok: false, error: "Cooperado não encontrado." };
  if (!getAssinaturaCadastroDataUrl(cooperado)) {
    return { ok: false, error: "Cooperado ainda não enviou assinatura." };
  }
  if (getAssinaturaCadastroStatus(cooperado) !== "em_analise") {
    return { ok: false, error: "Esta assinatura não está aguardando análise." };
  }

  const now = new Date().toISOString();
  return patchCooperadoAssinatura(
    data,
    cooperadoId,
    {
      ...(imagemAjustada
        ? {
            assinaturaCadastroDataUrl: imagemAjustada.dataUrl,
            assinaturaCadastroHash: imagemAjustada.hash,
          }
        : {}),
      assinaturaCadastroStatus: "confirmada",
      assinaturaConfirmadaEm: now,
      assinaturaConfirmadaPorId: actor.id,
      assinaturaConfirmadaPorNome: actor.name,
      assinaturaDevolvidaEm: undefined,
      assinaturaDevolvidaMotivo: undefined,
    },
    {
      userId: actor.id,
      userName: actor.name,
      changes: imagemAjustada
        ? "Assinatura confirmada pela diretoria (imagem ajustada)"
        : "Assinatura confirmada pela diretoria",
    }
  );
}

export function devolverAssinaturaCadastroCooperado(
  data: AppData,
  cooperadoId: string,
  actor: Pick<User, "id" | "name">,
  motivo?: string
): { ok: true; data: AppData; cooperado: Cooperado } | { ok: false; error: string } {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado) return { ok: false, error: "Cooperado não encontrado." };
  const status = getAssinaturaCadastroStatus(cooperado);
  if (status !== "em_analise" && status !== "confirmada") {
    return { ok: false, error: "Não há assinatura para devolver neste estado." };
  }

  const now = new Date().toISOString();
  const motivoLimpo = motivo?.trim().slice(0, 500);

  return patchCooperadoAssinatura(
    data,
    cooperadoId,
    {
      assinaturaCadastroStatus: "devolvida",
      assinaturaCadastroDataUrl: undefined,
      assinaturaCadastroHash: undefined,
      assinaturaConfirmadaEm: undefined,
      assinaturaConfirmadaPorId: undefined,
      assinaturaConfirmadaPorNome: undefined,
      assinaturaDevolvidaEm: now,
      assinaturaDevolvidaMotivo: motivoLimpo || "Assinatura fora do padrão — envie novamente.",
    },
    {
      userId: actor.id,
      userName: actor.name,
      changes: motivoLimpo
        ? `Assinatura devolvida ao cooperado: ${motivoLimpo}`
        : "Assinatura devolvida ao cooperado para reenvio",
    }
  );
}

/** Cooperados com app — resumo para painel da diretoria. */
export function resumoAssinaturaCadastroApp(data: AppData, cooperativaId: string) {
  const instalacao = resumoInstalacaoApp(data, cooperativaId);
  const comApp = listarCooperadosComApp(data, cooperativaId);
  /** Em análise/devolvida/confirmada: todos os ativos — não só quem tem flag de app instalado. */
  const elegiveis = listarCooperadosElegiveisAssinatura(data, cooperativaId);

  const listaSemAssinatura = comApp.filter((c) => cooperadoPrecisaCadastrarAssinatura(c.id, c));
  const listaEmAnalise = elegiveis.filter((c) => cooperadoAssinaturaEmAnalise(c));
  const listaComAssinatura = elegiveis.filter((c) => cooperadoTemAssinaturaCadastrada(c));
  const listaDevolvida = elegiveis.filter((c) => cooperadoAssinaturaDevolvida(c));

  return {
    comApp: instalacao.comApp,
    comAssinatura: listaComAssinatura.length,
    semAssinatura: listaSemAssinatura.length,
    emAnalise: listaEmAnalise.length,
    devolvida: listaDevolvida.length,
    listaSemAssinatura: listaSemAssinatura.sort((a, b) =>
      a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")
    ),
    listaEmAnalise: listaEmAnalise.sort((a, b) =>
      (b.assinaturaCadastradaEm ?? "").localeCompare(a.assinaturaCadastradaEm ?? "")
    ),
    listaComAssinatura,
    listaDevolvida,
  };
}
