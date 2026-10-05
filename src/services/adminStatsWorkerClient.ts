import type { AppData } from "@/types";
import type { AdminDashboardStats } from "@/lib/performance/adminStatsComputeCore";
import { computeAdminStatsPure } from "@/lib/performance/adminStatsComputeCore";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { isRqlAdminStatsWorkerEnabled } from "@/lib/performance/rqlAdminStats85";
import { seedAdminStatsCache } from "@/services/dashboardService";
import type {
  AdminStatsWorkerRequest,
  AdminStatsWorkerResponse,
} from "@/workers/adminStatsCompute.types";

let worker: Worker | null = null;
let workerFailed = false;
let seq = 0;

const pending = new Map<
  string,
  {
    resolve: (value: AdminStatsWorkerResponse) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function getWorker(): Worker | null {
  if (!isRqlAdminStatsWorkerEnabled()) return null;
  if (workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/adminStatsCompute.worker.ts", import.meta.url));
    worker.onmessage = (ev: MessageEvent<AdminStatsWorkerResponse>) => {
      const entry = pending.get(ev.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(ev.data.id);
      entry.resolve(ev.data);
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("Worker de stats indisponível."));
      }
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function computeSync(
  data: AppData,
  cooperativaId?: string,
  opts?: { skipValoresAPagar?: boolean }
): AdminDashboardStats {
  return computeAdminStatsPure(data, cooperativaId, opts, {
    bicCentralRead: isBicCentralReadAuthorityEnabled(),
  });
}

/** Stats completos do painel gestão — worker quando disponível; fallback síncrono. */
export async function requestAdminStatsFromWorker(
  data: AppData,
  cooperativaId: string | undefined,
  opts: { skipValoresAPagar?: boolean } | undefined,
  revision: number
): Promise<AdminDashboardStats> {
  const w = getWorker();
  if (!w) {
    const stats = computeSync(data, cooperativaId, opts);
    seedAdminStatsCache(stats, revision, cooperativaId ?? "", opts?.skipValoresAPagar === true);
    return stats;
  }

  const id = `adm-${++seq}`;
  const bicCentralRead = isBicCentralReadAuthorityEnabled();
  const req: AdminStatsWorkerRequest = {
    id,
    data,
    cooperativaId: cooperativaId || undefined,
    skipValoresAPagar: opts?.skipValoresAPagar,
    bicCentralRead,
  };

  const response = await new Promise<AdminStatsWorkerResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timeout stats gestão."));
    }, 60_000);
    pending.set(id, { resolve, reject, timer });
    w.postMessage(req);
  }).catch((): AdminStatsWorkerResponse => ({ id, ok: false, error: "timeout" }));

  if (!response.ok) {
    const stats = computeSync(data, cooperativaId, opts);
    seedAdminStatsCache(stats, revision, cooperativaId ?? "", opts?.skipValoresAPagar === true);
    return stats;
  }

  seedAdminStatsCache(response.stats, revision, cooperativaId ?? "", opts?.skipValoresAPagar === true);
  return response.stats;
}

export function resetAdminStatsWorkerClientForTests(): void {
  worker?.terminate();
  worker = null;
  workerFailed = false;
  pending.clear();
}
