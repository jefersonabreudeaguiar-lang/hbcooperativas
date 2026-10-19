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
  getValorQuantoVouReceberMotorLegado,
  listarMesesComValorQuantoVouReceber,
} from "@/services/cooperadoEntregasService";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { cooperadoMotorRevisionOperacional } from "@/lib/cooperado/cooperadoMotorRevisionOperacional";
import { bicCentralResolveInicioParaExibicao, bicCentralSincronizarRotuloMeses, bicCentralValorAReceberAgregado } from "@/services/bicLeituraCentralCooperado";
import {
  type LeituraFinanceiraParidadeCooperado,
} from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import {
  buildCooperadoFinanceiroUiSnapshot,
  type CooperadoFinanceiroUiSnapshot,
} from "@/services/cooperadoFinanceiroUiSnapshot";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { cooperadoUsarFluxoReciboAssinaturaNaUi } from "@/lib/bic/cooperadoBicCentralUi";
import { cooperadoTemReciboAssinadoLocalSemPendenciaUi } from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
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
  const sanitized = sanitizeInicioCardSnapshotFluxoBic(persistido.display);
  if (!persistidoDisplayCompativelBic(persistido.display)) {
    if (persistido.display.valor > 0.005) {
      return {
        ...persistido,
        display: sanitizeInicioCardSnapshotParaPersistenciaBic(persistido.display),
      };
    }
    return null;
  }
  return {
    ...persistido,
    display: sanitized,
  };
}

/**
 * Ao sair/voltar do app: o último valor gravado não cede a um motor 0
 * enquanto o AppData ainda não comprova quitação completa.
 */
export function cooperadoInicioCardEscolherDisplayEstavel(opts: {
  persistido: InicioCardMotorSnapshot | null | undefined;
  motor: InicioCardMotorSnapshot | null | undefined;
  autorizaZerarCompleto: boolean;
}): InicioCardMotorSnapshot {
  const vazio: InicioCardMotorSnapshot = {
    mesLabel: "—",
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
  const persistidoOk = Boolean(
    opts.persistido && cooperadoMotorTemObrigacaoReceber(opts.persistido)
  );
  const motorOk = Boolean(opts.motor && cooperadoMotorTemObrigacaoReceber(opts.motor));
  if (motorOk && opts.motor) return opts.motor;
  if (persistidoOk && !opts.autorizaZerarCompleto && opts.persistido) {
    return opts.persistido;
  }
  if (opts.autorizaZerarCompleto && opts.motor) return opts.motor;
  if (persistidoOk && opts.persistido) return opts.persistido;
  return opts.motor ?? vazio;
}

export type { InicioCardMotorSnapshot } from "@/lib/cooperado/cooperadoInicioCardMotorTypes";
import type { InicioCardMotorSnapshot } from "@/lib/cooperado/cooperadoInicioCardMotorTypes";

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
  if (motor.valor > 0) return true;
  if (
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    motor.aguardandoAssinatura &&
    motor.valorRecibo > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Autoriza R$ 0 no Início só com liquidação confirmada pelo responsável.
 * Snapshot vazio, PIX antigo ou sync incompleto não apagam o lastro.
 */
export function cooperadoBicAutorizaZerarCardInicio(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  _opts?: { tinhaValorExibido?: boolean }
): boolean {
  const paridadeValor = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId).valorLiquido;
  if (paridadeValor > 0) return false;
  if (listarMesesComValorQuantoVouReceber(data, cooperadoId, cooperativaId).length > 0) return false;
  if (getTotalAPagarCooperado(data, cooperadoId, undefined, cooperativaId) > 0) return false;

  const temFicha = (data.fichaCorrida ?? []).some((f) =>
    fichaPertenceCooperado(data, f, cooperadoId, cooperativaId)
  );
  const temLiquidacaoResponsavel = (data.pagamentosCooperado ?? []).some(
    (p) =>
      pagamentoCooperadoPertenceCooperado(data, p, cooperadoId, cooperativaId) &&
      p.status === "confirmado" &&
      Boolean(p.pagoPor?.trim())
  );

  if (!temLiquidacaoResponsavel || !temFicha) return false;
  return true;
}

/** Mantém valor exibido se motor veio zerado sem prova de pagamento BIC. */
export function aplicarMotorCardComGateZeroBic(
  anterior: InicioCardMotorSnapshot | null | undefined,
  motor: InicioCardMotorSnapshot,
  autorizaZerar: boolean
): InicioCardMotorSnapshot {
  const sanitized = sanitizeInicioCardSnapshotFluxoBic(motor);
  if (sanitized.valor > 0) return sanitized;
  if (
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    sanitized.aguardandoAssinatura &&
    sanitized.valorRecibo > 0
  ) {
    return sanitized;
  }
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

export { cooperadoMotorRevisionOperacional } from "@/lib/cooperado/cooperadoMotorRevisionOperacional";

function valorLiquidoCardInicioCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  paridade: LeituraFinanceiraParidadeCooperado,
  fluxoPix: ReturnType<typeof getValorQuantoVouReceberMotorLegado>
): number {
  const valorParidade = paridade.valorLiquido > 0 ? paridade.valorLiquido : 0;
  const inicioBic = isBicCentralReadAuthorityEnabled()
    ? bicCentralResolveInicioParaExibicao(data, cooperadoId, cooperativaId, {
        apresentacaoConsolidada: true,
      })
    : null;
  const valorBicInicio =
    inicioBic && (inicioBic.exibir || inicioBic.valor > 0) ? Math.max(0, inicioBic.valor) : 0;
  if (valorParidade > 0) return valorParidade;
  const valorBase = isBicCentralReadAuthorityEnabled()
    ? Math.max(valorBicInicio, valorParidade)
    : valorParidade;
  if (
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    fluxoPix.aguardandoAssinatura &&
    fluxoPix.valorRecibo > 0 &&
    fluxoPix.valor <= 0 &&
    valorBicInicio <= 0 &&
    valorParidade <= 0
  ) {
    return 0;
  }
  if (
    !isBicCentralReadAuthorityEnabled() &&
    fluxoPix.aguardandoAssinatura &&
    fluxoPix.valorRecibo > 0
  ) {
    return 0;
  }
  return valorBase;
}

export function resolverInicioCardMotorFromAppData(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: { apresentacaoConsolidada?: boolean }
): InicioCardMotorSnapshot {
  void opts?.apresentacaoConsolidada;
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId);
  const fluxoPix = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const mesFallback = paridade.mesesResumo[paridade.mesesResumo.length - 1] ?? getCurrentMesReferencia();
  const mesLabel = paridade.mesLabel?.trim() || formatMesReferencia(mesFallback);
  const valorExibir = valorLiquidoCardInicioCooperado(
    data,
    cooperadoId,
    cooperativaId,
    paridade,
    fluxoPix
  );

  const motor = sanitizeInicioCardSnapshotFluxoBic({
    mesLabel,
    valor: valorExibir,
    valorRecibo: fluxoPix.valorRecibo,
    aguardandoAssinatura: fluxoPix.aguardandoAssinatura,
  });
  if (cooperadoTemReciboAssinadoLocalSemPendenciaUi(data, cooperadoId, cooperativaId)) {
    return sanitizeInicioCardSnapshotFluxoBic({
      ...motor,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    });
  }
  return motor;
}

/** Card início — motor operacional da ficha (ignora máscara H203 / snapshot BIC zerado). */
export function resolverInicioCardMotorOperacionalFromAppData(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): InicioCardMotorSnapshot {
  return resolverInicioCardMotorFromAppData(data, cooperadoId, cooperativaId);
}

function motorInicioCardComReciboBic(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  motorBase: InicioCardMotorSnapshot
): InicioCardMotorSnapshot {
  const fluxoPix = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId);
  const valorExibir = valorLiquidoCardInicioCooperado(
    data,
    cooperadoId,
    cooperativaId,
    paridade,
    fluxoPix
  );
  return sanitizeInicioCardSnapshotFluxoBic({
    mesLabel: motorBase.mesLabel,
    valor: valorExibir > 0 ? valorExibir : motorBase.valor,
    valorRecibo: fluxoPix.valorRecibo,
    aguardandoAssinatura: fluxoPix.aguardandoAssinatura,
  });
}

function resolverMotorCardInicioViaFinanceiroUiSnapshot(
  input: ResolverCardInicioInput,
  financeiroCarregando: boolean
): { motor: InicioCardMotorSnapshot; revision: string } | "aguardando" | "inconsistente" {
  const { data, cooperadoId, cooperativaId } = input;
  if (!data || !cooperadoId) return "aguardando";

  const financeiro = buildCooperadoFinanceiroUiSnapshot({
    data,
    cooperadoId,
    cooperativaId,
    opts: {
      apresentacaoConsolidada: input.apresentacaoConsolidada,
      carregandoNuvem: financeiroCarregando,
      financeiroSincronizando: Boolean(input.syncing || financeiroCarregando),
      dataReady: input.dataReady ?? true,
      conferindoPagamentoNuvem: false,
    },
  });

  if (financeiro.status === "INCONSISTENTE") return "inconsistente";
  if (financeiro.status === "AGUARDANDO_BIC") return "aguardando";

  let motor = inicioCardMotorFromFinanceiroUiSnapshot(financeiro);
  if (cooperadoUsarFluxoReciboAssinaturaNaUi()) {
    motor = motorInicioCardComReciboBic(data, cooperadoId, cooperativaId, motor);
  } else {
    motor = sanitizeInicioCardSnapshotFluxoBic(motor);
  }

  const revision =
    financeiro.observability.motorRevision ??
    cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);
  return { motor, revision };
}

function aplicarPoliticaCardInicioEndurecidaComMotor(
  input: ResolverCardInicioInput,
  persistidoLeitura: ReturnType<typeof filtrarInicioCardPersistidoLeituraBic>,
  financeiroCarregando: boolean,
  motor: InicioCardMotorSnapshot,
  revision: string
): InicioCardPoliticaResult & { gravarPersistencia: boolean } {
  const { data, cooperadoId, cooperativaId } = input;

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

  const anchor =
    prevLatch?.hadPendencia && cooperadoMotorTemObrigacaoReceber(prevLatch.display)
      ? prevLatch.display
      : persistidoLeitura && cooperadoMotorTemObrigacaoReceber(persistidoLeitura.display)
        ? persistidoLeitura.display
        : null;
  if (
    financeiroCarregando &&
    anchor &&
    cooperadoMotorTemObrigacaoReceber(applied.display) &&
    applied.display.valor + 0.02 < anchor.valor
  ) {
    applied = {
      ...applied,
      display: anchor,
      latch: {
        motorRevision: revision,
        display: anchor,
        hadPendencia: true,
      },
      atualizando: true,
    };
  }

  const displayComObrigacao = cooperadoMotorTemObrigacaoReceber(applied.display);
  return finalizarResultadoCardBic({
    ...applied,
    gravarPersistencia: Boolean(cooperativaId) && (displayComObrigacao || autorizaZerar),
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

  const motor = resolverInicioCardMotorFromAppData(data, cooperadoId, cooperativaId);
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);
  return aplicarPoliticaCardInicioEndurecidaComMotor(
    input,
    persistidoLeitura,
    financeiroCarregando,
    motor,
    revision
  );
}

/** Card início — mascara recibo/assinatura só quando o fluxo cooperado está desligado. */
export function sanitizeInicioCardSnapshotFluxoBic(motor: InicioCardMotorSnapshot): InicioCardMotorSnapshot {
  if (cooperadoUsarFluxoReciboAssinaturaNaUi()) {
    const aguardando = motor.aguardandoAssinatura && motor.valorRecibo > 0;
    return {
      ...motor,
      valor: motor.valor > 0 ? motor.valor : 0,
      valorRecibo: aguardando ? motor.valorRecibo : 0,
      aguardandoAssinatura: aguardando,
    };
  }
  return {
    ...motor,
    valor: motor.valor > 0 ? motor.valor : 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

/** Gravação localStorage v7 — nunca persistir estado de recibo (evita cache legado; motor reidrata na UI). */
export function sanitizeInicioCardSnapshotParaPersistenciaBic(
  motor: InicioCardMotorSnapshot
): InicioCardMotorSnapshot {
  if (isBicCentralReadAuthorityEnabled()) {
    return {
      ...motor,
      valor: motor.valor > 0 ? motor.valor : 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }
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
  const autorizaZerar = opts.autorizaZerarValor ?? false;

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

/**
 * Lastro do Início: valor positivo da ficha/HB substitui o card.
 * Só zera com PIX confirmado da obrigação atual (autorizaZerarValor).
 */
export function aplicarSubstituicaoMonotonaDisplay(
  anterior: InicioCardMotorSnapshot,
  motor: InicioCardMotorSnapshot,
  revisionChanged: boolean,
  opts?: { autorizaZerarValor?: boolean }
): InicioCardMotorSnapshot {
  const autorizaZerar = opts?.autorizaZerarValor ?? false;
  const sanitized = sanitizeInicioCardSnapshotFluxoBic(motor);
  if (!revisionChanged) {
    if (sanitized.valor > 0.005) return sanitized;
    return anterior;
  }
  if (sanitized.valor > 0.005) return sanitized;
  return aplicarMotorCardComGateZeroBic(anterior, motor, autorizaZerar);
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
  const reciboPendente =
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    financeiro.podeExibirBannerRecibo &&
    financeiro.valorReciboPendente > 0;
  const valor =
    financeiro.valorAReceber > 0
      ? financeiro.valorAReceber
      : financeiro.status === "CONFIRMADO" || financeiro.status === "LEGADO"
        ? financeiro.valorAReceber
        : 0;
  return {
    mesLabel,
    valor: reciboPendente && valor <= 0 ? 0 : valor,
    valorRecibo: reciboPendente ? financeiro.valorReciboPendente : 0,
    aguardandoAssinatura: reciboPendente,
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
  const persistidoLeitura = persistidoLeituraCardInicio(input);
  const financeiroCarregando =
    !input.apresentacaoConsolidada ||
    Boolean(input.syncing || input.carregandoFinanceiro);
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

  if (!input.data) {
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

  const { motor, revision } = resolverMotorCardInicioParidadeFinanceiro(
    input.data,
    input.cooperadoId,
    input.cooperativaId
  );

  return aplicarPoliticaCardInicioEndurecidaComMotor(
    input,
    persistidoLeitura,
    financeiroCarregando,
    motor,
    revision
  );
}

function persistidoLeituraCardInicio(input: ResolverCardInicioInput) {
  return filtrarInicioCardPersistidoLeituraBic(input.persistido);
}

export function resolverCardInicioEndurecido(input: ResolverCardInicioInput): InicioCardPoliticaResult & {
  gravarPersistencia: boolean;
} {
  const persistidoLeitura = persistidoLeituraCardInicio(input);
  const financeiroCarregando =
    !input.apresentacaoConsolidada ||
    Boolean(input.syncing || input.carregandoFinanceiro);
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
