import { computeAdminStatsPure } from "@/lib/performance/adminStatsComputeCore";
import type { AdminStatsWorkerRequest, AdminStatsWorkerResponse } from "@/workers/adminStatsCompute.types";

self.onmessage = (ev: MessageEvent<AdminStatsWorkerRequest>) => {
  const req = ev.data;
  try {
    const stats = computeAdminStatsPure(
      req.data,
      req.cooperativaId || undefined,
      { skipValoresAPagar: req.skipValoresAPagar === true },
      { bicCentralRead: req.bicCentralRead }
    );
    const res: AdminStatsWorkerResponse = { id: req.id, ok: true, stats };
    self.postMessage(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const res: AdminStatsWorkerResponse = { id: req.id, ok: false, error: msg };
    self.postMessage(res);
  }
};

export {};
