/**
 * Abertura da gestão — uma cadeia leve por sessão, sem bloquear a UI.
 */
import type { SyncRunOptions } from "@/services/syncRequest";
import type { AppData } from "@/types";
import type { User, UserRole } from "@/types";

/** Usuário de gestão (auth ou App User). */
export type StaffGestaoAberturaUser = Pick<User, "id"> & {
  role?: UserRole;
  cooperativaId?: string;
};
import { getData, isAppDataWarm } from "@/services/dataStore";
import { peekStaffGestaoLastGood } from "@/lib/staff/staffGestaoSnapshotGuard";
import { resolveGestaoCooperativaId } from "@/utils/cooperativa";
import {
  markStaffGestaoAberturaSyncConcluido,
  staffGestaoHydrateIncompleto,
} from "@/lib/staff/staffOperacionalColdHydrate";
import {
  staffResponsavelForceCloudHydrateSyncRequest,
  staffResponsavelHydrateFollowUpSyncRequest,
  staffResponsavelOpeningSyncRequest,
} from "@/lib/staff/staffResponsavelSyncPolicy";

const STAFF_ABERTURA_CHAIN_USER_KEY = "hb-staff-abertura-chain-user";

let chainInFlight = false;
/** Browser: number; Node types: Timeout — ambos aceitos em runtime. */
let followUpTimer: number | null = null;

function sessionStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function staffGestaoAberturaChainJaRodouParaUsuario(userId: string): boolean {
  const storage = sessionStorageSafe();
  if (!storage || !userId) return false;
  try {
    return storage.getItem(STAFF_ABERTURA_CHAIN_USER_KEY) === userId;
  } catch {
    return false;
  }
}

function markStaffGestaoAberturaChainUsuario(userId: string): void {
  const storage = sessionStorageSafe();
  if (!storage || !userId) return;
  try {
    storage.setItem(STAFF_ABERTURA_CHAIN_USER_KEY, userId);
  } catch {
    /* quota */
  }
}

/** Somente testes. */
export function resetStaffGestaoAberturaHydrateForTests(): void {
  chainInFlight = false;
  if (followUpTimer) {
    clearTimeout(followUpTimer);
    followUpTimer = null;
  }
  const storage = sessionStorageSafe();
  if (!storage) return;
  try {
    storage.removeItem(STAFF_ABERTURA_CHAIN_USER_KEY);
  } catch {
    /* ignore */
  }
}

function snapForUser(_user: StaffGestaoAberturaUser): AppData | null {
  return isAppDataWarm() ? getData() : peekStaffGestaoLastGood();
}

function coopForUser(user: StaffGestaoAberturaUser, data: AppData | null): string | undefined {
  return resolveGestaoCooperativaId(user as User, data);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitSyncSlot(isSyncing: () => boolean, maxMs = 120_000): Promise<void> {
  const start = Date.now();
  while (isSyncing() && Date.now() - start < maxMs) {
    await sleep(120);
  }
}

/**
 * 1 sync de abertura + no máximo 1 follow-up adiado — evita “página sem resposta”.
 */
export function runStaffGestaoAberturaHydrateChain(opts: {
  user: StaffGestaoAberturaUser;
  runSync: (incoming?: SyncRunOptions) => Promise<void>;
  isSyncing: () => boolean;
}): void {
  const { user, runSync, isSyncing } = opts;
  if (!user.id) return;
  if (chainInFlight) return;
  if (staffGestaoAberturaChainJaRodouParaUsuario(user.id)) return;

  chainInFlight = true;
  markStaffGestaoAberturaChainUsuario(user.id);

  const finish = () => {
    chainInFlight = false;
  };

  void (async () => {
    try {
      await sleep(80);
      const snap0 = snapForUser(user);
      const coop0 = coopForUser(user, snap0);
      await waitSyncSlot(isSyncing);
      await runSync(staffResponsavelOpeningSyncRequest(snap0, coop0));
      await sleep(200);

      const snap1 = getData();
      const coop1 = coopForUser(user, snap1);
      if (coop1 && staffGestaoHydrateIncompleto(snap1, coop1)) {
        const follow = staffResponsavelHydrateFollowUpSyncRequest(snap1, coop1);
        if (follow) {
          await waitSyncSlot(isSyncing);
          await runSync(follow);
        }
      }

      const snapMid = getData();
      const coopMid = coopForUser(user, snapMid);
      if (coopMid && staffGestaoHydrateIncompleto(snapMid, coopMid)) {
        await waitSyncSlot(isSyncing);
        await runSync(staffResponsavelForceCloudHydrateSyncRequest());
      }

      const finalCoop = coopForUser(user, getData());
      if (!staffGestaoHydrateIncompleto(getData(), finalCoop)) {
        markStaffGestaoAberturaSyncConcluido();
      } else if (followUpTimer == null && typeof window !== "undefined") {
        followUpTimer = window.setTimeout(() => {
          followUpTimer = null;
          const snap2 = getData();
          const coop2 = coopForUser(user, snap2);
          if (!coop2 || !staffGestaoHydrateIncompleto(snap2, coop2)) return;
          const late =
            staffResponsavelHydrateFollowUpSyncRequest(snap2, coop2) ??
            staffResponsavelForceCloudHydrateSyncRequest();
          void waitSyncSlot(isSyncing).then(() => runSync(late));
        }, 6_000);
      }
    } finally {
      finish();
    }
  })();
}
