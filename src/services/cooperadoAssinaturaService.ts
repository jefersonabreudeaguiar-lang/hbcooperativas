import type { AppData, Cooperado, User } from "@/types";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import { addAuditEntry } from "@/services/dataStore";
import {
  listarCooperadosComApp,
  resumoInstalacaoApp,
} from "@/services/cooperadoAppInstallService";

export function getAssinaturaCadastroDataUrl(cooperado: Pick<Cooperado, "assinaturaCadastroDataUrl"> | null | undefined): string | null {
  const url = cooperado?.assinaturaCadastroDataUrl?.trim();
  return url || null;
}

export function cooperadoTemAssinaturaCadastrada(cooperado: Pick<Cooperado, "assinaturaCadastroDataUrl"> | null | undefined): boolean {
  return Boolean(getAssinaturaCadastroDataUrl(cooperado));
}

/** Exige cadastro de assinatura antes de votar ou assinar recibo (como o PIX). */
export function cooperadoPrecisaCadastrarAssinatura(
  cooperadoId: string | undefined | null,
  cooperado: Pick<Cooperado, "assinaturaCadastroDataUrl"> | null | undefined
): boolean {
  if (!cooperadoUsaAssinaturaCadastroPilot(cooperadoId)) return false;
  return !cooperadoTemAssinaturaCadastrada(cooperado);
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
  const atualizado: Cooperado = {
    ...cooperado,
    assinaturaCadastroDataUrl: payload.dataUrl,
    assinaturaCadastradaEm: now,
    assinaturaCadastroVersao: versao,
    assinaturaCadastroHash: payload.hash,
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
    userId: actor.id,
    userName: actor.name,
    changes: `Assinatura manuscrita cadastrada (v${versao})`,
  });

  return { ok: true, data: next, cooperado: atualizado };
}

/** Cooperados que já aderiram ao app (instalado) mas ainda não cadastraram assinatura. */
export function resumoAssinaturaCadastroApp(data: AppData, cooperativaId: string) {
  const instalacao = resumoInstalacaoApp(data, cooperativaId);
  const comApp = listarCooperadosComApp(data, cooperativaId);
  const listaSemAssinatura = comApp.filter((c) =>
    cooperadoPrecisaCadastrarAssinatura(c.id, c)
  );
  const listaComAssinatura = comApp.filter((c) => cooperadoTemAssinaturaCadastrada(c));
  return {
    comApp: instalacao.comApp,
    comAssinatura: listaComAssinatura.length,
    semAssinatura: listaSemAssinatura.length,
    listaSemAssinatura: listaSemAssinatura.sort((a, b) =>
      a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")
    ),
    listaComAssinatura,
  };
}
