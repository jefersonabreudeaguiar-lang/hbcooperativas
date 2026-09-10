import type { UserRole } from "@/types";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";

const DEFAULT_TTL = "7d";

/** TTL curto para staff só quando HB_STAFF_SESSION_TTL_HOURS estiver definido. */
export function resolveAccessTokenTtl(role: UserRole, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HB_STAFF_SESSION_TTL_HOURS?.trim();
  if (!raw || !isStaffRole(role)) return DEFAULT_TTL;

  const hours = Number.parseInt(raw, 10);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) return DEFAULT_TTL;
  return `${hours}h`;
}

export function getDefaultAccessTokenTtl(): string {
  return DEFAULT_TTL;
}
