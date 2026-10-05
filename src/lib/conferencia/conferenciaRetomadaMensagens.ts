import type { AppData } from "@/types";
import type { ConferenciaDraftMemoria } from "@/lib/conferencia/conferenciaDraftMemoria";
import {
  conferenciaParcialPendenteFinalizacao,
  encontrarPrimeiraFotoPendente,
} from "@/lib/conferencia/conferenciaFichaHydrate";

export function progressoFotosDraftDivergeDaFicha(
  draft: ConferenciaDraftMemoria,
  lancadasFicha: ReadonlySet<number>,
  fotoIdxAtual: number
): boolean {
  if (draft.fotoIdx !== fotoIdxAtual) return true;
  if (draft.fotosLancadas.length !== lancadasFicha.size) return true;
  for (const idx of draft.fotosLancadas) {
    if (!lancadasFicha.has(idx)) return true;
  }
  for (const idx of lancadasFicha) {
    if (!draft.fotosLancadas.includes(idx)) return true;
  }
  return false;
}

export function fotoIdxAtualAposRetomadaFicha(
  d: AppData,
  notaId: string,
  totalFotos: number,
  lancadas: ReadonlySet<number>
): number {
  if (lancadas.size === 0) return 0;
  const partial = conferenciaParcialPendenteFinalizacao(d, notaId, totalFotos);
  if (partial.todasLancadasNaFicha) return Math.max(0, totalFotos - 1);
  return encontrarPrimeiraFotoPendente(totalFotos, lancadas);
}

/** Combina mensagem da ficha com aviso quando rascunho de sessão diverge ou complementa. */
export function enriquecerMensagemRetomadaMultiFotoComDraft(
  mensagemFicha: string,
  draft: ConferenciaDraftMemoria | undefined,
  lancadasFicha: ReadonlySet<number>,
  fotoIdxAtual: number,
  totalFotos: number
): string {
  if (!draft) return mensagemFicha;

  if (totalFotos <= 1) {
    if (mensagemFicha.trim()) return mensagemFicha;
    return "Formulário restaurado do rascunho desta sessão.";
  }

  const diverge = progressoFotosDraftDivergeDaFicha(draft, lancadasFicha, fotoIdxAtual);
  const base =
    mensagemFicha.trim() ||
    (lancadasFicha.size > 0
      ? `${lancadasFicha.size} de ${totalFotos} fotos já foram lançadas na ficha. Continue pela foto ${fotoIdxAtual + 1}.`
      : "");

  if (diverge) {
    const prefix = base || `Continue pela foto ${fotoIdxAtual + 1} de ${totalFotos}.`;
    return `${prefix} O rascunho local apontava outro ponto nas fotos — a ficha prevaleceu; campos do formulário vieram do rascunho.`;
  }

  if (base) {
    return `${base} Campos do formulário restaurados do rascunho desta sessão.`;
  }

  return "Campos do formulário restaurados do rascunho desta sessão.";
}
