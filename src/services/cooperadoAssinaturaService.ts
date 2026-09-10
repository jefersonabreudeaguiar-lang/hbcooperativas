import type { AppData, AssinaturaCadastroStatus, Cooperado, User } from "@/types";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import { addAuditEntry } from "@/services/dataStore";
import {
  listarCooperadosComApp,
  resumoInstalacaoApp,
} from "@/services/cooperadoAppInstallService";

/** Aviso “assinatura confirmada” some após 24 h. */
export const ASSINATURA_CONFIRMACAO_AVISO_MS = 24 * 60 * 60 * 1000;

type CooperadoAssinaturaFields = Pick<
  Cooperado,
  | "assinaturaCadastroDataUrl"
  | "assinaturaCadastroStatus"
  | "assinaturaConfirmadaEm"
  | "assinaturaDevolvidaEm"
  | "assinaturaDevolvidaMotivo"
>;

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

  const listaSemAssinatura = comApp.filter((c) => cooperadoPrecisaCadastrarAssinatura(c.id, c));
  const listaEmAnalise = comApp.filter((c) => cooperadoAssinaturaEmAnalise(c));
  const listaComAssinatura = comApp.filter((c) => cooperadoTemAssinaturaCadastrada(c));
  const listaDevolvida = comApp.filter((c) => cooperadoAssinaturaDevolvida(c));

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
