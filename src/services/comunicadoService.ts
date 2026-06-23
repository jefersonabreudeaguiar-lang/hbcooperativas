import type { AppData, Comunicado, Cooperado, Cooperativa, MensalidadeConfig } from "@/types";
import {
  isAvisoMensalidadeVenceAmanha,
  textoAvisoMensalidadeAmanha,
  getResumoMensalidadesCooperado,
  type ResumoMensalidadesCooperado,
} from "@/services/mensalidadeService";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

export interface ComunicadoExibicao extends Comunicado {
  virtual?: boolean;
  recorrenteLabel?: string;
  /** Link opcional no mural (ex.: mensalidade pendente → /mensalidades). */
  href?: string;
}

function hoje(): Date {
  return new Date();
}

function diaAtual(): number {
  return hoje().getDate();
}

function mesAtualRef(): string {
  return getCurrentMesReferencia();
}

function dataHojeIso(): string {
  return hoje().toISOString().split("T")[0];
}

function pertenceCooperativa(c: Comunicado, cooperativaId?: string): boolean {
  if (!cooperativaId) return true;
  if (!c.cooperativaId) return true;
  return c.cooperativaId === cooperativaId;
}

export function getComunicadoAssunto(c: Pick<Comunicado, "assunto" | "titulo">): string {
  return c.assunto?.trim() || c.titulo?.trim() || "Aviso";
}

/** Avisos recorrentes ficam visíveis a partir do dia configurado até o fim do mês. */
export function avisoRecorrenteVisivelHoje(comunicado: Comunicado): boolean {
  if (!comunicado.recorrente) return true;
  if (comunicado.ativo === false) return false;
  const dia = comunicado.diaDoMes ?? 1;
  return diaAtual() >= dia;
}

function textoLembreteMensalidade(coop: Cooperativa, cfg: MensalidadeConfig): string {
  const titulo = cfg.lembreteTexto?.trim();
  if (titulo) {
    return titulo
      .replace("{valor}", cfg.valorPadrao.toFixed(2).replace(".", ","))
      .replace("{dia}", String(cfg.diaVencimento));
  }
  return `A mensalidade de R$ ${cfg.valorPadrao.toFixed(2).replace(".", ",")} vence todo dia ${cfg.diaVencimento}. Mantenha em dia para evitar descontos nas entregas.`;
}

function lembreteMensalidadeVirtual(coop: Cooperativa): ComunicadoExibicao | null {
  const cfg = coop.mensalidadeConfig;
  if (!cfg || cfg.valorPadrao <= 0) return null;

  if (isAvisoMensalidadeVenceAmanha(cfg)) {
    const dia = Math.min(Math.max(cfg.diaVencimento || 10, 1), 28);
    const assunto = cfg.lembreteTitulo?.trim() || "Mensalidade vence amanhã";
    return {
      id: `virtual_mensalidade_amanha_${coop.id}_${mesAtualRef()}`,
      cooperativaId: coop.id,
      assunto,
      titulo: assunto,
      descricao: textoAvisoMensalidadeAmanha(cfg),
      data: dataHojeIso(),
      responsavel: coop.responsavel ?? "Cooperativa",
      categoria: "financeiro",
      fixado: true,
      visivelParaTodos: true,
      recorrente: true,
      diaDoMes: Math.max(1, dia - 1),
      ativo: true,
      createdAt: hoje().toISOString(),
      virtual: true,
      recorrenteLabel: `Automático · vence amanhã (dia ${dia})`,
    };
  }

  if (!cfg.lembreteAtivo) return null;
  if (diaAtual() < (cfg.diaLembrete ?? 1)) return null;

  const assunto = cfg.lembreteTitulo?.trim() || "Vencimento da mensalidade";
  return {
    id: `virtual_mensalidade_${coop.id}_${mesAtualRef()}`,
    cooperativaId: coop.id,
    assunto,
    titulo: assunto,
    descricao: textoLembreteMensalidade(coop, cfg),
    data: dataHojeIso(),
    responsavel: coop.responsavel ?? "Cooperativa",
    categoria: "financeiro",
    fixado: true,
    visivelParaTodos: true,
    recorrente: true,
    diaDoMes: cfg.diaLembrete ?? 1,
    ativo: true,
    createdAt: hoje().toISOString(),
    virtual: true,
    recorrenteLabel: `Automático · todo mês (venc. dia ${cfg.diaVencimento})`,
  };
}

function mensalidadePendenteMuralVirtual(
  coop: Cooperativa,
  resumo: ResumoMensalidadesCooperado
): ComunicadoExibicao {
  const m = resumo.mensalidadeMesAtual;
  const cfg = coop.mensalidadeConfig;
  const mes = m?.mesReferencia ?? mesAtualRef();
  const valor = m?.valor ?? cfg?.valorPadrao ?? 0;
  const assunto = "Mensalidade em atraso";
  const partes = [`${formatMesReferencia(mes)} · ${formatCurrency(valor)}`];
  if (m?.vencimento) {
    partes.push(`venceu em ${formatDate(m.vencimento)}`);
  }
  if (resumo.qtdAtrasadas > 1) {
    partes.push(`${resumo.qtdAtrasadas} mensalidade(s) em aberto`);
  }

  return {
    id: `virtual_mensalidade_pendente_${coop.id}_${mes}`,
    cooperativaId: coop.id,
    assunto,
    titulo: assunto,
    descricao: `${partes.join(" · ")}. Toque para pagar via PIX na aba Mensalidades.`,
    data: dataHojeIso(),
    responsavel: coop.responsavel ?? "Cooperativa",
    categoria: "financeiro",
    fixado: true,
    visivelParaTodos: true,
    recorrente: false,
    ativo: true,
    createdAt: hoje().toISOString(),
    virtual: true,
    recorrenteLabel: "Pendência · em atraso",
    href: "/mensalidades",
  };
}

/** Combina comunicados cadastrados + lembretes automáticos de mensalidade. */
export function getComunicadosParaExibicao(
  data: AppData,
  cooperativaId?: string,
  opts?: { incluirInativos?: boolean }
): ComunicadoExibicao[] {
  const incluirInativos = opts?.incluirInativos ?? false;
  const lista: ComunicadoExibicao[] = [];

  for (const c of data.comunicados) {
    if (!pertenceCooperativa(c, cooperativaId)) continue;
    if (!incluirInativos && c.ativo === false) continue;

    if (c.recorrente) {
      if (incluirInativos || avisoRecorrenteVisivelHoje(c)) {
        lista.push({
          ...c,
          data: dataHojeIso(),
          recorrenteLabel: `Lembrete mensal · a partir do dia ${c.diaDoMes ?? 1}`,
        });
      }
    } else {
      lista.push(c);
    }
  }

  if (cooperativaId) {
    const coop = data.cooperativas.find((c) => c.id === cooperativaId);
    if (coop) {
      const virtual = lembreteMensalidadeVirtual(coop);
      if (virtual) lista.push(virtual);
    }
  }

  return lista.sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    return new Date(b.data).getTime() - new Date(a.data).getTime();
  });
}

/** Aviso geral da cooperativa (não direcionado a um cooperado específico). */
export function comunicadoParaTodosCooperados(c: Comunicado): boolean {
  return !c.cooperadoId && c.visivelParaTodos !== false;
}

function cooperadoEhMembroDiretoria(data: AppData, cooperadoId?: string): boolean {
  if (!cooperadoId) return false;
  return Boolean(data.cooperados.find((c) => c.id === cooperadoId)?.membroDiretoria);
}

/** Quem pode ver este aviso no aparelho do cooperado. */
export function comunicadoVisivelParaCooperado(
  c: Comunicado,
  cooperadoId: string | undefined,
  data?: AppData
): boolean {
  if (c.cooperadoId) return Boolean(cooperadoId && c.cooperadoId === cooperadoId);

  if (c.somenteDiretoria) {
    if (!data || !cooperadoId) return false;
    return cooperadoEhMembroDiretoria(data, cooperadoId);
  }

  return c.visivelParaTodos !== false;
}

export function getComunicadosCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string
): ComunicadoExibicao[] {
  return getComunicadosParaExibicao(data, cooperativaId).filter((c) =>
    comunicadoVisivelParaCooperado(c, cooperadoId, data)
  );
}

/** Mural do início do cooperado — avisos e mensalidade pendente sincronizados com a aba Mensalidades. */
export function getComunicadosMuralInicioCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string
): ComunicadoExibicao[] {
  const resumoMens = cooperadoId
    ? getResumoMensalidadesCooperado(data, cooperadoId, cooperativaId)
    : null;
  const mensalidadeResolvida =
    !resumoMens ||
    resumoMens.situacao === "em_dia" ||
    resumoMens.situacao === "sem_mensalidade" ||
    resumoMens.situacao === "aguardando_confirmacao";
  const mensalidadePendente = resumoMens?.situacao === "atrasada";
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);

  const lista = getComunicadosCooperado(data, cooperativaId, cooperadoId).filter((c) => {
    if (c.virtual && c.id.startsWith("virtual_mensalidade_pendente_")) return false;
    if (c.virtual && c.id.startsWith("virtual_mensalidade")) {
      return !mensalidadeResolvida;
    }
    if (c.virtual) return false;
    if (mensalidadeResolvida && c.categoria === "financeiro") return false;
    return true;
  });

  if (mensalidadePendente && resumoMens && coop) {
    lista.unshift(mensalidadePendenteMuralVirtual(coop, resumoMens));
  }

  return lista.sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    return new Date(b.data).getTime() - new Date(a.data).getTime();
  });
}

export function cooperadoTemConteudoComunicado(c: Comunicado): boolean {
  return Boolean(c.descricao?.trim() || c.audioDataUrl?.trim());
}
