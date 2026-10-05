import type { AppData } from "@/types";
import type { AdminDashboardStats } from "@/lib/performance/adminStatsComputeCore";

export interface AdminStatsWorkerRequest {
  id: string;
  data: AppData;
  cooperativaId?: string;
  skipValoresAPagar?: boolean;
  bicCentralRead: boolean;
}

export interface AdminStatsWorkerSuccess {
  id: string;
  ok: true;
  stats: AdminDashboardStats;
}

export interface AdminStatsWorkerFailure {
  id: string;
  ok: false;
  error: string;
}

export type AdminStatsWorkerResponse = AdminStatsWorkerSuccess | AdminStatsWorkerFailure;
