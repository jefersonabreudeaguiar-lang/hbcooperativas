/**
 * Piloto Jeferson — dados reais por aba, sob demanda (após sync), sem travar troca de abas.
 */
import type { User } from "@/types";
import {
  COOPERADO_BOTTOM_TAB_HREFS,
  type CooperadoBottomTabHref,
  isCooperadoBottomTabPath,
} from "@/lib/performance/cooperadoBottomTabRoutes";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
import { cooperadoJefersonDuplaEntradaDesbloqueado } from "@/lib/cooperado/cooperadoJefersonDuplaEntradaAutoAtualizar";
import { cooperadoMobileUiQuiescenceActive } from "@/lib/cooperado/cooperadoTabSwitchQuiescence";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaPrecosCatalogoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaPrecosCatalogoSnapshot";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { yieldCooperadoMobileUiBeforeHeavyWork } from "@/lib/cooperado/cooperadoGaMobileAtualizarYield";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { isAppDataWarm } from "@/services/dataStore";

const STORAGE_PREFIX = "hb.coop.jefersonAbaMat.v1";
const inflight = new Set<string>();

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readMaterializadas(userId: string): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeMaterializadas(userId: string, set: Set<string>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify([...set]));
  } catch {
    /* quota */
  }
}

export function cooperadoJefersonAbaJaMaterializada(
  user: Omit<User, "password"> | null | undefined,
  href: CooperadoBottomTabHref
): boolean {
  if (!user?.id) return false;
  return readMaterializadas(user.id).has(href);
}

/** Limpa após novo sync automático — abas regravam snapshots sob demanda. */
export function resetCooperadoJefersonAbasMaterializadas(userId?: string): void {
  if (typeof sessionStorage === "undefined") return;
  if (userId) {
    sessionStorage.removeItem(storageKey(userId));
    return;
  }
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
  }
}

export function resolveCooperadoJefersonTabHref(pathname: string): CooperadoBottomTabHref | null {
  const path = (pathname || "/").split("?")[0]?.trim() || "/";
  if (isCooperadoBottomTabPath(path)) return path;
  if (path === "/notas-pedido" || path.startsWith("/notas-pedido/")) return "/notas-pedido";
  return null;
}

export function cooperadoJefersonPodeMaterializarAbas(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || !isCooperadoJefersonSomenteAtualizarPilot(user)) return false;
  if (!cooperadoJefersonDuplaEntradaDesbloqueado(user)) return false;
  return isAppDataWarm();
}

async function materializarAba(
  user: Omit<User, "password">,
  href: CooperadoBottomTabHref
): Promise<boolean> {
  switch (href) {
    case "/dashboard":
      persistirInicioCardValorReceberCooperado(user);
      persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
      break;
    case "/ficha-corrida":
      persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
      break;
    case "/notas-pedido": {
      const mod = await import("@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot");
      mod.persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
      break;
    }
    case "/precos":
      persistirCooperadoPwaPrecosCatalogoSnapshotFromUser(user);
      break;
    default:
      return false;
  }
  const set = readMaterializadas(user.id);
  set.add(href);
  writeMaterializadas(user.id, set);
  clearCooperadoPwaDadosDesatualizados();
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
  return true;
}

export async function materializarCooperadoJefersonAbaDadosReais(
  user: Omit<User, "password"> | null | undefined,
  href: CooperadoBottomTabHref
): Promise<boolean> {
  if (!user?.id || !cooperadoJefersonPodeMaterializarAbas(user)) return false;
  if (cooperadoJefersonAbaJaMaterializada(user, href)) return false;
  if (typeof document !== "undefined" && document.hidden) return false;

  await yieldCooperadoMobileUiBeforeHeavyWork();
  if (!isAppDataWarm()) return false;

  return materializarAba(user, href);
}

export function scheduleCooperadoJefersonMaterializarAba(
  user: Omit<User, "password"> | null | undefined,
  href: CooperadoBottomTabHref,
  attempt = 0
): void {
  if (!user?.id || !isCooperadoJefersonSomenteAtualizarPilot(user)) return;
  if (!COOPERADO_BOTTOM_TAB_HREFS.includes(href)) return;
  if (cooperadoJefersonAbaJaMaterializada(user, href)) return;

  const inflightKey = `${user.id}:${href}`;
  if (inflight.has(inflightKey)) return;
  inflight.add(inflightKey);

  scheduleCooperadoPostInteractiveTask(() => {
    const run = async () => {
      try {
        if (!cooperadoJefersonPodeMaterializarAbas(user)) return;
        if (cooperadoMobileUiQuiescenceActive() && attempt < 12) {
          window.setTimeout(
            () => scheduleCooperadoJefersonMaterializarAba(user, href, attempt + 1),
            700
          );
          return;
        }
        await materializarCooperadoJefersonAbaDadosReais(user, href);
      } finally {
        inflight.delete(inflightKey);
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => void run(), { timeout: 3_500 });
    } else {
      window.setTimeout(() => void run(), 200);
    }
  });
}

export function scheduleCooperadoJefersonMaterializarAbaAtual(
  user: Omit<User, "password"> | null | undefined,
  pathname: string
): void {
  const href = resolveCooperadoJefersonTabHref(pathname);
  if (!href) return;
  scheduleCooperadoJefersonMaterializarAba(user, href);
}
