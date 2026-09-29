/**
 * Grava cache do card “A receber” após login, sync ou AppData local — sem abrir o dashboard.
 */
import {
  cooperadoMotorRevisionOperacional,
  cooperadoMotorTemObrigacaoReceber,
  filtrarInicioCardPersistidoLeituraBic,
  resolverCardInicioEndurecido,
  resolverInicioCardMotorFromAppData,
  sanitizeInicioCardSnapshotParaPersistenciaBic,
} from "@/lib/cooperadoInicioCardPolicy";
import {
  INICIO_CARD_STORAGE_VERSION,
  gravarInicioCardPersistidoFlex,
  lerInicioCardPersistidoFlex,
} from "@/lib/cooperadoInicioCardPersistencia";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { User } from "@/types";

export type CooperadoInicioCardPersistUser = Omit<User, "password">;

function resolveTenant(user: CooperadoInicioCardPersistUser): {
  cooperadoId: string;
  cooperativaId: string;
} | null {
  if (user.role !== "cooperado" || !user.cooperadoId) return null;
  if (!isAppDataWarm()) return null;
  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data);
  if (!cooperativaId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  return { cooperadoId, cooperativaId };
}

/** Atualiza localStorage do card a partir do AppData atual (M6 + política endurecida). */
export function persistirInicioCardValorReceberCooperado(
  user: CooperadoInicioCardPersistUser | null | undefined
): boolean {
  if (!user) return false;
  const tenant = resolveTenant(user);
  if (!tenant) return false;

  const { cooperadoId, cooperativaId } = tenant;
  const data = getData();
  const persistido = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
  );
  const resolved = resolverCardInicioEndurecido({
    data,
    cooperadoId,
    cooperativaId,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido,
  });

  gravarInicioCardPersistidoFlex(cooperadoId, cooperativaId, {
    v: INICIO_CARD_STORAGE_VERSION,
    motorRevision: resolved.latch.motorRevision,
    display: sanitizeInicioCardSnapshotParaPersistenciaBic(resolved.display),
    savedAt: new Date().toISOString(),
  });

  return cooperadoMotorTemObrigacaoReceber(resolved.display);
}

/** Leitura rápida só M6 — útil para debug; card usa política completa acima. */
export function lerValorReceberMotorBrutoCooperado(user: CooperadoInicioCardPersistUser | null | undefined): number {
  const tenant = user ? resolveTenant(user) : null;
  if (!tenant) return 0;
  const snap = resolverInicioCardMotorFromAppData(
    getData(),
    tenant.cooperadoId,
    tenant.cooperativaId
  );
  return snap.valor;
}

export function cooperadoInicioCardRevisionAtual(user: CooperadoInicioCardPersistUser | null | undefined): string {
  const tenant = user ? resolveTenant(user) : null;
  if (!tenant) return "";
  return cooperadoMotorRevisionOperacional(getData(), tenant.cooperadoId, tenant.cooperativaId);
}
