import type { AppData, Cooperado } from "@/types";
import { updateData } from "@/services/dataStore";
import { normalizeCnpj } from "@/utils/cooperativa";

export function isAppStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Mescla campos de instalação/acesso — nunca perde “já instalou” nem o acesso mais recente. */
export function mergeAppInstallFields(local: Cooperado, cloud: Cooperado): Pick<
  Cooperado,
  "appInstaladoEm" | "ultimoAcessoEm" | "ultimoAcessoModo"
> {
  const appInstaladoEm = earlierIso(local.appInstaladoEm, cloud.appInstaladoEm);
  const ultimoAcessoEm = laterIso(local.ultimoAcessoEm, cloud.ultimoAcessoEm);
  let ultimoAcessoModo = local.ultimoAcessoModo ?? cloud.ultimoAcessoModo;
  if (ultimoAcessoEm) {
    const localIsLater =
      local.ultimoAcessoEm &&
      new Date(local.ultimoAcessoEm).getTime() >= new Date(cloud.ultimoAcessoEm ?? 0).getTime();
    ultimoAcessoModo = localIsLater ? local.ultimoAcessoModo ?? cloud.ultimoAcessoModo : cloud.ultimoAcessoModo ?? local.ultimoAcessoModo;
  }
  return { appInstaladoEm, ultimoAcessoEm, ultimoAcessoModo };
}

function earlierIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function laterIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function cooperadoTemAppInstalado(c: Cooperado): boolean {
  return Boolean(c.appInstaladoEm);
}

/** Ativos que usam o app (não avulsos) e ainda não instalaram. */
export function listarCooperadosSemApp(data: AppData, cooperativaId: string): Cooperado[] {
  return data.cooperados
    .filter(
      (c) =>
        c.cooperativaId === cooperativaId &&
        c.status === "ativo" &&
        !c.avulso &&
        !cooperadoTemAppInstalado(c)
    )
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}

export function listarCooperadosComApp(data: AppData, cooperativaId: string): Cooperado[] {
  return data.cooperados
    .filter(
      (c) =>
        c.cooperativaId === cooperativaId &&
        c.status === "ativo" &&
        !c.avulso &&
        cooperadoTemAppInstalado(c)
    )
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}

export function resumoInstalacaoApp(data: AppData, cooperativaId: string) {
  const elegiveis = data.cooperados.filter(
    (c) => c.cooperativaId === cooperativaId && c.status === "ativo" && !c.avulso
  );
  const comApp = elegiveis.filter(cooperadoTemAppInstalado);
  const semApp = elegiveis.filter((c) => !cooperadoTemAppInstalado(c));
  const avulsos = data.cooperados.filter(
    (c) => c.cooperativaId === cooperativaId && c.status === "ativo" && c.avulso
  ).length;
  return {
    elegiveis: elegiveis.length,
    comApp: comApp.length,
    semApp: semApp.length,
    avulsos,
    listaSemApp: semApp.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")),
    listaComApp: comApp.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")),
  };
}

/**
 * Registra acesso do cooperado logado. Se estiver no app instalado, marca appInstaladoEm.
 * Empurra para a nuvem para o responsável ver.
 */
export function registrarAcessoCooperadoApp(opts: {
  cooperadoId: string;
  cnpj?: string;
  email?: string;
}): void {
  const { cooperadoId, cnpj, email } = opts;
  if (!cooperadoId) return;

  const modo: "app" | "navegador" = isAppStandalone() ? "app" : "navegador";
  const now = new Date().toISOString();
  let saved: Cooperado | null = null;

  updateData((d) => {
    const idx = d.cooperados.findIndex((c) => c.id === cooperadoId);
    if (idx < 0) return d;
    const atual = d.cooperados[idx];

    // Evita gravar a cada sync — no máximo a cada 6 h (exceto 1ª vez no app).
    const last = atual.ultimoAcessoEm ? new Date(atual.ultimoAcessoEm).getTime() : 0;
    const primeiraVezApp = modo === "app" && !atual.appInstaladoEm;
    if (!primeiraVezApp && nowMs() - last < 6 * 60 * 60 * 1000) {
      return d;
    }

    const atualizado: Cooperado = {
      ...atual,
      ultimoAcessoEm: now,
      ultimoAcessoModo: modo,
      appInstaladoEm: atual.appInstaladoEm ?? (modo === "app" ? now : undefined),
      updatedAt: now,
    };
    saved = atualizado;
    return {
      ...d,
      cooperados: d.cooperados.map((c) => (c.id === cooperadoId ? atualizado : c)),
    };
  });

  if (saved && cnpj && normalizeCnpj(cnpj).length === 14) {
    const digits = normalizeCnpj(cnpj);
    void import("@/services/cooperadoCloudService").then(({ pushCooperadoToCloud }) => {
      void pushCooperadoToCloud(digits, saved!, email);
    });
  }
}

function nowMs() {
  return Date.now();
}
