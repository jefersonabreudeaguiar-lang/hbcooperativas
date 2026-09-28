/**
 * Política endurecida — card fixo “A receber” no início (HB Coop / BIC LAB).
 *
 * Invariantes:
 * 1. O card (shell) nunca some da UI cooperado.
 * 2. Enquanto o motor operacional indicar obrigação a receber, o valor exibido não zera por sync/H203.
 * 3. O valor só muda quando a revisão operacional muda (lançamentos, ficha, pagamentos, notas).
 */
import type { AppData } from "@/types";
import { notaPertenceCooperado, fichaPertenceCooperado, pagamentoCooperadoPertenceCooperado } from "@/services/cooperadoCloudService";
import { bicCentralResolveInicioParaExibicao, bicCentralSincronizarRotuloMeses, bicCentralValorAReceberAgregado } from "@/services/bicLeituraCentralCooperado";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

function persistidoDisplayCompativelBic(display: InicioCardMotorSnapshot): boolean {
  if (!isBicCentralReadAuthorityEnabled()) return true;
  return !display.aguardandoAssinatura && display.valorRecibo <= 0;
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
  if (isBicCentralReadAuthorityEnabled()) return motor.valor > 0;
  return motor.valor > 0 || motor.aguardandoAssinatura || motor.valorRecibo > 0;
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
  return chunks.join("|");
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
    return sanitizeMotorSnapshotBicUi({
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

  return {
    mesLabel,
    valor: aguardandoAssinatura && valorRecibo > 0 && valor <= 0 ? 0 : valor,
    valorRecibo,
    aguardandoAssinatura,
  };
}

function sanitizeMotorSnapshotBicUi(motor: InicioCardMotorSnapshot): InicioCardMotorSnapshot {
  if (!isBicCentralReadAuthorityEnabled()) return motor;
  return {
    ...motor,
    valor: motor.valor > 0 ? motor.valor : 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

/**
 * Nova revisão operacional → aceita motor (lançamento / pagamento / nota).
 */
export function aplicarPoliticaCardInicioEndurecida(
  motor: InicioCardMotorSnapshot,
  motorRevision: string,
  prev: InicioCardLatchState | null,
  opts: { carregandoFinanceiro: boolean }
): InicioCardPoliticaResult {
  const pendenciaMotor = cooperadoMotorTemObrigacaoReceber(motor);
  const revisionChanged = !prev || prev.motorRevision !== motorRevision;

  if (revisionChanged) {
    const latch: InicioCardLatchState = {
      motorRevision,
      display: motor,
      hadPendencia: pendenciaMotor,
    };
    return {
      display: motor,
      latch,
      atualizando: opts.carregandoFinanceiro && !pendenciaMotor,
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
    const latch: InicioCardLatchState = {
      motorRevision,
      display: motor,
      hadPendencia: false,
    };
    return { display: motor, latch, atualizando: false };
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
  revisionChanged: boolean
): InicioCardMotorSnapshot {
  if (isBicCentralReadAuthorityEnabled()) {
    if (!revisionChanged) return anterior;
    return sanitizeMotorSnapshotBicUi(motor);
  }
  if (!revisionChanged) return anterior;
  if (!cooperadoMotorTemObrigacaoReceber(motor)) return motor;
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
};

export function resolverCardInicioEndurecido(input: ResolverCardInicioInput): InicioCardPoliticaResult & {
  gravarPersistencia: boolean;
} {
  const { data, cooperadoId, cooperativaId, persistido } = input;
  const vazio: InicioCardMotorSnapshot = {
    mesLabel: "—",
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };

  if (!cooperadoId) {
    return {
      display: vazio,
      latch: { motorRevision: "", display: vazio, hadPendencia: false },
      atualizando: input.carregandoFinanceiro,
      gravarPersistencia: false,
    };
  }

  if (!data) {
    if (persistido && persistidoDisplayCompativelBic(persistido.display)) {
      const latch: InicioCardLatchState = {
        motorRevision: persistido.motorRevision,
        display: persistido.display,
        hadPendencia: cooperadoMotorTemObrigacaoReceber(persistido.display),
      };
      return {
        display: persistido.display,
        latch,
        atualizando: input.carregandoFinanceiro,
        gravarPersistencia: false,
      };
    }
    return {
      display: vazio,
      latch: { motorRevision: "", display: vazio, hadPendencia: false },
      atualizando: input.carregandoFinanceiro,
      gravarPersistencia: false,
    };
  }

  const motor = resolverInicioCardMotorFromAppData(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada: input.apresentacaoConsolidada,
  });
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);

  let prevLatch = input.prevLatch;
  if (
    !prevLatch &&
    persistido &&
    persistido.motorRevision === revision &&
    cooperadoMotorTemObrigacaoReceber(persistido.display) &&
    persistidoDisplayCompativelBic(persistido.display)
  ) {
    prevLatch = {
      motorRevision: revision,
      display: persistido.display,
      hadPendencia: true,
    };
  }

  let applied = aplicarPoliticaCardInicioEndurecida(motor, revision, prevLatch, {
    carregandoFinanceiro: input.carregandoFinanceiro,
  });

  if (prevLatch && prevLatch.motorRevision !== revision) {
    const display = aplicarSubstituicaoMonotonaDisplay(prevLatch.display, applied.display, true);
    applied = {
      ...applied,
      display,
      latch: { ...applied.latch, display },
    };
  }

  if (
    persistido &&
    persistido.motorRevision === revision &&
    cooperadoMotorTemObrigacaoReceber(persistido.display) &&
    persistidoDisplayCompativelBic(persistido.display) &&
    !cooperadoMotorTemObrigacaoReceber(motor) &&
    input.carregandoFinanceiro
  ) {
    applied = {
      ...applied,
      display: persistido.display,
      latch: {
        motorRevision: revision,
        display: persistido.display,
        hadPendencia: true,
      },
      atualizando: true,
    };
  }

  const gravarPersistencia = Boolean(cooperativaId);

  const display = sanitizeMotorSnapshotBicUi(applied.display);
  const latch = { ...applied.latch, display };

  return { ...applied, display, latch, gravarPersistencia };
}
