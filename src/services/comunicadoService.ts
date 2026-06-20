import type { AppData, Comunicado, Cooperativa, MensalidadeConfig } from "@/types";
import { getCurrentMesReferencia } from "@/utils/format";

export interface ComunicadoExibicao extends Comunicado {
  virtual?: boolean;
  recorrenteLabel?: string;
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
  if (!cfg?.lembreteAtivo || cfg.valorPadrao <= 0) return null;
  if (diaAtual() < (cfg.diaLembrete ?? 1)) return null;

  const titulo = cfg.lembreteTitulo?.trim() || "Vencimento da mensalidade";
  return {
    id: `virtual_mensalidade_${coop.id}_${mesAtualRef()}`,
    cooperativaId: coop.id,
    titulo,
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

/** Quem pode ver este aviso no aparelho do cooperado. */
export function comunicadoVisivelParaCooperado(c: Comunicado, cooperadoId?: string): boolean {
  if (c.cooperadoId) return Boolean(cooperadoId && c.cooperadoId === cooperadoId);
  return c.visivelParaTodos !== false;
}

export function getComunicadosCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string
): ComunicadoExibicao[] {
  return getComunicadosParaExibicao(data, cooperativaId).filter((c) =>
    comunicadoVisivelParaCooperado(c, cooperadoId)
  );
}
