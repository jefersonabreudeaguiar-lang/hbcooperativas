import type { MensalidadeConfig } from "@/types";

/** Allowlist: mensalidade_config também guarda hashes administrativos. */
export function mensalidadeConfigParaExibicao(cfg?: MensalidadeConfig | null): MensalidadeConfig | undefined {
  if (!cfg) return undefined;
  return {
    valorPadrao: cfg.valorPadrao,
    diaVencimento: cfg.diaVencimento,
    lembreteAtivo: cfg.lembreteAtivo,
    diaLembrete: cfg.diaLembrete,
    lembreteTitulo: cfg.lembreteTitulo,
    lembreteTexto: cfg.lembreteTexto,
    gerarAutomaticamente: cfg.gerarAutomaticamente,
    mesesCobranca: cfg.mesesCobranca,
    configSalvaEm: cfg.configSalvaEm,
  };
}
