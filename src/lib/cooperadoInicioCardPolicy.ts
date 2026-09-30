/**
 * Política endurecida — card fixo “A receber” no início (HB Coop / BIC LAB).
 *
 * Invariantes:
 * 1. O card (shell) nunca some da UI cooperado.
 * 2. Enquanto houver valor a receber, o card não zera por sync/H203 — só atualiza (aumento ou recálculo).
 * 3. O valor só zera quando a BIC/operacional comprova pagamento (mês quitado + pagamento confirmado).
 * 4. Revisão operacional (lançamentos, ficha, pagamentos, notas) atualiza o valor; queda a zero exige prova de pagamento.
 */
import type { AppData } from "@/types";
import { notaPertenceCooperado, fichaPertenceCooperado, pagamentoCooperadoPertenceCooperado } from "@/services/cooperadoCloudService";
import {
  getValorQuantoVouReceber,
  getValorQuantoVouReceberMotorLegado,
  listarMesesComValorQuantoVouReceber,
} from "@/services/cooperadoEntregasService";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { getContaCoopDescontosRevision } from "@/lib/hb-credit/contaCoopDescontosNotify";
import { bicCentralResolveInicioParaExibicao, bicCentralSincronizarRotuloMeses, bicCentralValorAReceberAgregado } from "@/services/bicLeituraCentralCooperado";
import {
  type CooperadoFinanceiroUiSnapshot,
} from "@/services/cooperadoFinanceiroUiSnapshot";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

/** Snapshot de localStorage contém fluxo legado “assinar recibo” (não é autoridade BIC). */
export function inicioCardSnapshotTemEstadoReciboLegado(display: InicioCardMotorSnapshot): boolean {
  return display.aguardandoAssinatura || display.valorRecibo > 0;
}

export function persistidoDisplayCompativelBic(display: InicioCardMotorSnapshot): boolean {
  if (!isBicCentralReadAuthorityEnabled()) return true;
  return !inicioCardSnapshotTemEstadoReciboLegado(display);
}

/** Leitura do card: descarta cache incompatível com BIC; neutraliza recibo legado no restante. */
export function filtrarInicioCardPersistidoLeituraBic(
  persistido: import("@/lib/cooperadoInicioCardPersistencia").InicioCardPersistido | null
): import("@/lib/cooperadoInicioCardPersistencia").InicioCardPersistido | null {
  if (!persistido) return null;
  if (!isBicCentralReadAuthorityEnabled()) return persistido;
  if (!persistidoDisplayCompativelBic(persistido.display)) return null;
  return {
    ...persistido,
    display: sanitizeInicioCardSnapshotFluxoBic(persistido.display),
  };
}

export type InicioCardMotorSnapshot = {
  mesLabel: string;
  valor: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
};

export type InicioCardLatchState = {
  motorRevision: string;
  /** Último snapshot autoritativo exibido. */
  display: InicioCardMotorSnapshot;
  /** Cooperado tinha pendência na última revisão aplicada. */
  hadPendencia: boolean;
};

export type InicioCardPoliticaResult = {
  display: InicioCardMotorSnapshot;
  latch: InicioCardLatchState;
  atualizando: boolean;
};

export function cooperadoMotorTemObrigacaoReceber(motor: InicioCardMotorSnapshot): boolean {
  return motor.valor > 0;
}

/**
 * BIC ON — autoriza exibir R$ 0 no card início.
 * Sync parcial (motor 0 sem pagamento confirmado) retorna false.
 */
export function cooperadoBicAutorizaZerarCardInicio(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: { tinhaValorExibido?: boolean }
): boolean {
  const motor = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  if (motor.valor > 0) return false;
  if (listarMesesComValorQuantoVouReceber(data, cooperadoId, cooperativaId).length > 0) return false;
  if (getTotalAPagarCooperado(data, cooperadoId, undefined, cooperativaId) > 0) return false;

  if (!opts?.tinhaValorExibido) return true;

  return data.pagamentosCooperado.some(
    (p) =>
      pagamentoCooperadoPertenceCooperado(data, p, cooperadoId, cooperativaId) &&
      p.status === "confirmado"
  );
}

/** Mantém valor exibido se motor veio zerado sem prova de pagamento BIC. */
export function aplicarMotorCardComGateZeroBic(
  anterior: InicioCardMotorSnapshot | null | undefined,
  motor: InicioCardMotorSnapshot,
  autorizaZerar: boolean
): InicioCardMotorSnapshot {
  const sanitized = sanitizeInicioCardSnapshotFluxoBic(motor);
  if (sanitized.valor > 0) return sanitized;
  if (anterior && anterior.valor > 0 && !autorizaZerar) {
    return sanitizeInicioCardSnapshotFluxoBic({
      ...sanitized,
      mesLabel:
        sanitized.mesLabel.trim() && sanitized.mesLabel !== "—" ? sanitized.mesLabel : anterior.mesLabel,
      valor: anterior.valor,
    });
  }
  return sanitized;
}

/** Revisão só de dados operacionais — não depende de máscara H203 de apresentação. */
export function cooperadoMotorRevisionOperacional(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string {
  const chunks: string[] = [];

  for (const p of data.pagamentosCooperado) {
    if (!pagamentoCooperadoPertenceCooperado(data, p, cooperadoId, cooperativaId)) continue;
    chunks.push(
      `p:${p.id}:${p.status}:${p.mesReferencia}:${p.valorLiquido}:${p.updatedAt ?? ""}:${(p.mesesReferencia ?? []).join("+")}`
    );
  }

  for (const f of data.fichaCorrida) {
    if (!fichaPertenceCooperado(data, f, cooperadoId, cooperativaId)) continue;
    chunks.push(`f:${f.id}:${f.mesReferencia}:${f.updatedAt ?? ""}:${f.valorLiquido ?? 0}`);
  }

  for (const n of data.notasPedido) {
    if (!notaPertenceCooperado(data, n, cooperadoId, cooperativaId)) continue;
    chunks.push(`n:${n.id}:${n.status}:${n.mesReferencia}:${n.updatedAt ?? ""}`);
  }

  chunks.sort();
  const hbDescontosRev = getContaCoopDescontosRevision();
  return `${chunks.join("|")}|hbDescontosRev:${hbDescontosRev}`;
}

export function resolverInicioCardMotorFromAppData(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: { apresentacaoConsolidada?: boolean }
): InicioCardMotorSnapshot {
  const apresentacaoConsolidada = opts?.apresentacaoConsolidada ?? true;

  if (isBicCentralReadAuthorityEnabled()) {
    const inicio = bicCentralResolveInicioParaExibicao(data, cooperadoId, cooperativaId, {
      apresentacaoConsolidada,
    });
    const mesFallback = inicio.mes || getCurrentMesReferencia();
    return sanitizeInicioCardSnapshotFluxoBic({
      mesLabel: inicio.mesLabel?.trim() || formatMesReferencia(mesFallback),
      valor: inicio.valor,
      valorRecibo: inicio.valorRecibo,
      aguardandoAssinatura: inicio.aguardandoAssinatura,
    });
  }

  const raw = bicCentralSincronizarRotuloMeses(
    bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, { apresentacaoConsolidada })
  );
  const inicio = bicCentralResolveInicioParaExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada,
  });
  const mesFallback = raw.mes || inicio.mes || getCurrentMesReferencia();
  const mesLabel =
    raw.mesLabel?.trim() ||
    inicio.mesLabel?.trim() ||
    formatMesReferencia(mesFallback);

  const valor =
    raw.valor > 0
      ? raw.valor
      : inicio.aguardandoAssinatura
        ? 0
        : inicio.valor;
  const valorRecibo = raw.valorRecibo > 0 ? raw.valorRecibo : inicio.valorRecibo;
  const aguardandoAssinatura = raw.aguardandoAssinatura || inicio.aguardandoAssinatura;

  return sanitizeInicioCardSnapshotFluxoBic({
    mesLabel,
    valor: aguardandoAssinatura && valorRecibo > 0 && valor <= 0 ? 0 : valor,
    valorRecibo,
    aguardandoAssinatura,
  });
}

/** Card início — motor operacional da ficha (ignora máscara H203 / snapshot BIC zerado). */
export function resolverInicioCardMotorOperacionalFromAppData(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): InicioCardMotorSnapshot {
  const raw = bicCentralSincronizarRotuloMeses(
    getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId)
  );
  const mesFallback = raw.mes || getCurrentMesReferencia();
  return sanitizeInicioCardSnapshotFluxoBic({
    mesLabel: raw.mesLabel?.trim() || formatMesReferencia(mesFallback),
    valor: raw.valor > 0 ? raw.valor : 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  });
}

function aplicarPoliticaCardInicioEndurecidaComMotorOperacional(
  input: ResolverCardInicioInput,
  persistidoLeitura: ReturnType<typeof filtrarInicioCardPersistidoLeituraBic>,
  financeiroCarregando: boolean
): InicioCardPoliticaResult & { gravarPersistencia: boolean } {
  const { data, cooperadoId, cooperativaId } = input;
  const vazio: InicioCardMotorSnapshot = {
    mesLabel: "—",
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };

  if (!data || !cooperadoId) {
    if (persistidoLeitura && cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display)) {
      return resultadoCardBridgePersistidoBic(persistidoLeitura, { gravarPersistencia: false });
    }
    return finalizarResultadoCardBic({
      display: vazio,
      latch: { motorRevision: "", display: vazio, hadPendencia: false },
      atualizando: financeiroCarregando,
      gravarPersistencia: false,
    });
  }

  const motor = resolverInicioCardMotorOperacionalFromAppData(data, cooperadoId, cooperativaId);
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);

  if (
    persistidoLeitura &&
    cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display) &&
    !cooperadoMotorTemObrigacaoReceber(motor) &&
    financeiroCarregando
  ) {
    return resultadoCardBridgePersistidoBic(persistidoLeitura, {
      gravarPersistencia: false,
      atualizando: true,
    });
  }

  let prevLatch = input.prevLatch;
  if (
    !prevLatch &&
    persistidoLeitura &&
    cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display)
  ) {
    prevLatch = {
      motorRevision: persistidoLeitura.motorRevision,
      display: persistidoLeitura.display,
      hadPendencia: true,
    };
  }

  const tinhaValorExibido = Boolean(
    prevLatch?.hadPendencia ||
      (persistidoLeitura && cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display))
  );
  const autorizaZerar =
    cooperadoId && data
      ? cooperadoBicAutorizaZerarCardInicio(data, cooperadoId, cooperativaId, { tinhaValorExibido })
      : !tinhaValorExibido;

  let applied = aplicarPoliticaCardInicioEndurecida(motor, revision, prevLatch, {
    carregandoFinanceiro: financeiroCarregando,
    autorizaZerarValor: autorizaZerar,
  });

  if (prevLatch && prevLatch.motorRevision !== revision) {
    const display = aplicarSubstituicaoMonotonaDisplay(prevLatch.display, applied.display, true, {
      autorizaZerarValor: autorizaZerar,
    });
    applied = {
      ...applied,
      display,
      latch: { ...applied.latch, display },
    };
  }

  if (
    persistidoLeitura &&
    cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display) &&
    !cooperadoMotorTemObrigacaoReceber(motor) &&
    (financeiroCarregando || !autorizaZerar)
  ) {
    applied = {
      ...applied,
      display: persistidoLeitura.display,
      latch: {
        motorRevision: revision,
        display: persistidoLeitura.display,
        hadPendencia: true,
      },
      atualizando: true,
    };
  }

  return finalizarResultadoCardBic({
    ...applied,
    gravarPersistencia: Boolean(cooperativaId),
  });
}

/** Card início — nunca exibir fluxo PIX registrado / assinar recibo. */
export function sanitizeInicioCardSnapshotFluxoBic(motor: InicioCardMotorSnapshot): InicioCardMotorSnapshot {
  return {
    ...motor,
    valor: motor.valor > 0 ? motor.valor : 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

/** Gravação localStorage v7 — nunca persistir estado de recibo legado com BIC ON. */
export function sanitizeInicioCardSnapshotParaPersistenciaBic(
  motor: InicioCardMotorSnapshot
): InicioCardMotorSnapshot {
  return sanitizeInicioCardSnapshotFluxoBic(motor);
}

function finalizarResultadoCardBic(
  result: InicioCardPoliticaResult & { gravarPersistencia: boolean }
): InicioCardPoliticaResult & { gravarPersistencia: boolean } {
  const display = sanitizeInicioCardSnapshotFluxoBic(result.display);
  const latchDisplay = sanitizeInicioCardSnapshotFluxoBic(result.latch.display);
  return {
    ...result,
    display,
    latch: { ...result.latch, display: latchDisplay },
  };
}

/**
 * Nova revisão operacional → aceita motor (lançamento / pagamento / nota).
 */
export function aplicarPoliticaCardInicioEndurecida(
  motor: InicioCardMotorSnapshot,
  motorRevision: string,
  prev: InicioCardLatchState | null,
  opts: { carregandoFinanceiro: boolean; autorizaZerarValor?: boolean }
): InicioCardPoliticaResult {
  const pendenciaMotor = cooperadoMotorTemObrigacaoReceber(motor);
  const revisionChanged = !prev || prev.motorRevision !== motorRevision;
  const autorizaZerar = opts.autorizaZerarValor ?? true;

  if (revisionChanged) {
    const display = aplicarMotorCardComGateZeroBic(prev?.display, motor, autorizaZerar);
    const pendenciaDisplay = cooperadoMotorTemObrigacaoReceber(display);
    const latch: InicioCardLatchState = {
      motorRevision,
      display,
      hadPendencia: pendenciaDisplay,
    };
    return {
      display,
      latch,
      atualizando: opts.carregandoFinanceiro && !pendenciaDisplay,
    };
  }

  if (pendenciaMotor) {
    const latch: InicioCardLatchState = {
      motorRevision,
      display: motor,
      hadPendencia: true,
    };
    return {
      display: motor,
      latch,
      atualizando: false,
    };
  }

  if (prev.hadPendencia && opts.carregandoFinanceiro) {
    return {
      display: prev.display,
      latch: prev,
      atualizando: true,
    };
  }

  if (prev.hadPendencia && !opts.carregandoFinanceiro && !pendenciaMotor) {
    const display = aplicarMotorCardComGateZeroBic(prev.display, motor, autorizaZerar);
    const latch: InicioCardLatchState = {
      motorRevision,
      display,
      hadPendencia: cooperadoMotorTemObrigacaoReceber(display),
    };
    return { display, latch, atualizando: false };
  }

  const latch: InicioCardLatchState = {
    motorRevision,
    display: motor,
    hadPendencia: false,
  };
  return {
    display: motor,
    latch,
    atualizando: opts.carregandoFinanceiro,
  };
}

/** Só troca para valor menor quando quitou; senão aceita aumento ou novo crédito. */
export function aplicarSubstituicaoMonotonaDisplay(
  anterior: InicioCardMotorSnapshot,
  motor: InicioCardMotorSnapshot,
  revisionChanged: boolean,
  opts?: { autorizaZerarValor?: boolean }
): InicioCardMotorSnapshot {
  const autorizaZerar = opts?.autorizaZerarValor ?? true;
  if (isBicCentralReadAuthorityEnabled()) {
    if (!revisionChanged) return anterior;
    if (motor.valor > anterior.valor) {
      return sanitizeInicioCardSnapshotFluxoBic(motor);
    }
    return aplicarMotorCardComGateZeroBic(anterior, motor, autorizaZerar);
  }
  if (!revisionChanged) return anterior;
  if (!cooperadoMotorTemObrigacaoReceber(motor)) {
    return aplicarMotorCardComGateZeroBic(anterior, motor, autorizaZerar);
  }
  if (!cooperadoMotorTemObrigacaoReceber(anterior)) return motor;
  if (motor.valor > anterior.valor) return motor;
  if (motor.valorRecibo > anterior.valorRecibo) return motor;
  if (motor.aguardandoAssinatura && motor.valorRecibo > 0 && !anterior.aguardandoAssinatura) return motor;
  if (motor.valor >= anterior.valor && motor.valorRecibo >= anterior.valorRecibo) return motor;
  return anterior;
}

export type ResolverCardInicioInput = {
  data: import("@/types").AppData | null;
  cooperadoId: string | undefined;
  cooperativaId: string | undefined;
  apresentacaoConsolidada: boolean;
  carregandoFinanceiro: boolean;
  prevLatch: InicioCardLatchState | null;
  persistido: import("@/lib/cooperadoInicioCardPersistencia").InicioCardPersistido | null;
  /** Warm AppData — obrigatório para projeção BIC no snapshot (PASSO 26). */
  dataReady?: boolean;
  syncing?: boolean;
};

/** Card BIC ON — display derivado somente do CooperadoFinanceiroUiSnapshot. */
export function inicioCardMotorFromFinanceiroUiSnapshot(
  financeiro: CooperadoFinanceiroUiSnapshot
): InicioCardMotorSnapshot {
  const mesLabel = financeiro.mesLabel?.trim() || "—";
  if (financeiro.status === "AGUARDANDO_BIC" || financeiro.status === "INCONSISTENTE") {
    return {
      mesLabel,
      valor: 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }
  const valor =
    financeiro.valorAReceber > 0
      ? financeiro.valorAReceber
      : financeiro.status === "CONFIRMADO" || financeiro.status === "LEGADO"
        ? financeiro.valorAReceber
        : 0;
  return {
    mesLabel,
    valor,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

function resultadoCardBridgePersistidoBic(
  persistidoLeitura: NonNullable<ReturnType<typeof filtrarInicioCardPersistidoLeituraBic>>,
  opts: { gravarPersistencia: boolean; atualizando?: boolean }
): InicioCardPoliticaResult & { gravarPersistencia: boolean } {
  const latch: InicioCardLatchState = {
    motorRevision: persistidoLeitura.motorRevision,
    display: persistidoLeitura.display,
    hadPendencia: cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display),
  };
  return finalizarResultadoCardBic({
    display: persistidoLeitura.display,
    latch,
    atualizando: opts.atualizando ?? true,
    gravarPersistencia: opts.gravarPersistencia,
  });
}

function resolverCardInicioEndurecidoFinanceiroUiSnapshot(
  input: ResolverCardInicioInput
): InicioCardPoliticaResult & { gravarPersistencia: boolean } {
  const persistidoLeitura = filtrarInicioCardPersistidoLeituraBic(input.persistido);
  const financeiroCarregando = Boolean(input.syncing || input.carregandoFinanceiro);
  return aplicarPoliticaCardInicioEndurecidaComMotorOperacional(
    input,
    persistidoLeitura,
    financeiroCarregando
  );
}

export function resolverCardInicioEndurecido(input: ResolverCardInicioInput): InicioCardPoliticaResult & {
  gravarPersistencia: boolean;
} {
  const persistidoLeitura = filtrarInicioCardPersistidoLeituraBic(input.persistido);
  const financeiroCarregando = Boolean(input.syncing || input.carregandoFinanceiro);
  const vazio: InicioCardMotorSnapshot = {
    mesLabel: "—",
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };

  if (!input.cooperadoId) {
    return finalizarResultadoCardBic({
      display: vazio,
      latch: { motorRevision: "", display: vazio, hadPendencia: false },
      atualizando: financeiroCarregando,
      gravarPersistencia: false,
    });
  }

  if (isBicCentralReadAuthorityEnabled()) {
    return resolverCardInicioEndurecidoFinanceiroUiSnapshot(input);
  }

  return aplicarPoliticaCardInicioEndurecidaComMotorOperacional(
    input,
    persistidoLeitura,
    financeiroCarregando
  );
}
